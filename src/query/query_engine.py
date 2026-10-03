"""
Builds a citation-aware query engine: retrieves the most relevant chunks
from Chroma, re-ranks them with a cross-encoder, then asks an LLM to
answer using only that context, with inline [N] citations pointing back
to source chunks.

Also handles:
  - confidence fallback (don't force an answer from a weak match)
  - "simple" vs "technical" answer depth
  - multi-turn conversations (condenses follow-ups into standalone questions)
  - resolving citations to real, clickable source URLs
  - suggested follow-up questions

Generation backend is chosen by config.LLM_PROVIDER:
  - "groq"   (default) — hosted inference, required for a deployed server
  - "ollama" — local model, for offline development only
"""

import json
import logging
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from llama_index.core import Settings
from llama_index.core.prompts import PromptTemplate
from llama_index.core.query_engine import CitationQueryEngine
from llama_index.llms.groq import Groq
from llama_index.llms.ollama import Ollama

from src.config import (
    GROQ_API_KEY,
    GROQ_MODEL,
    LLM_PROVIDER,
    OLLAMA_MODEL,
    OLLAMA_BASE_URL,
    OLLAMA_REQUEST_TIMEOUT,
    OLLAMA_NUM_CTX,
    TOP_K,
    RETRIEVE_TOP_K,
    RERANK_ENABLED,
    RERANK_MODEL,
    MIN_SIMILARITY_SCORE,
    ARXIV_ABS_URL,
    NTRS_CITATION_URL,
    SEMANTIC_SCHOLAR_ABS_URL,
    WEB_SEARCH_ENABLED,
    TAVILY_API_KEY,
)
from src.vectorstore.chroma_store import load_index
from src.query.web_search import search_web, WebResult

logger = logging.getLogger(__name__)

DEPTH_INSTRUCTIONS = {
    "simple": (
        "Explain this in simple, beginner-friendly terms. Avoid jargon "
        "where possible, and briefly explain any technical term you do "
        "need to use. Question: "
    ),
    "technical": (
        "Provide a precise, technically detailed answer suitable for "
        "someone with a background in the field. Question: "
    ),
}

FALLBACK_MESSAGE = (
    "I don't have enough information in my indexed papers to answer that "
    "confidently yet. Try rephrasing, asking something more specific, or "
    "check back once more papers on this topic have been ingested."
)

# --- Strict grounding -------------------------------------------------------
# Replaces the library's default prompt so answers stick to the papers.
STRICT_QA_TEMPLATE = PromptTemplate(
    "Answer the query using ONLY the numbered sources below.\n"
    "Rules:\n"
    "- Every factual statement must end with a citation like [1] or [2][3].\n"
    "- Do NOT add facts, numbers, names or examples that are not in the sources, "
    "even if you know them from elsewhere.\n"
    "- If the sources only partly answer the query, answer just that part and say "
    "what the papers do not cover.\n"
    "- If the sources do not answer the query at all, reply exactly: "
    "\"The indexed papers don't cover this.\"\n"
    "- Do not use tables unless the query asks for one.\n"
    "Example:\n"
    "Source 1:\nThe sky is red in the evening and blue in the morning.\n"
    "Source 2:\nWater is wet when the sky is red.\n"
    "Query: When is water wet?\n"
    "Answer: Water is wet when the sky is red [2], which occurs in the evening [1].\n"
    "Now it's your turn. Below are the numbered sources:\n"
    "------\n{context_str}\n------\n"
    "Query: {query_str}\nAnswer: "
)

# --- Casual fast-path -------------------------------------------------------
# Greetings/small talk shouldn't pay for retrieval, web search, or follow-up
# generation. Exact matches (after stripping trailing punctuation) plus a
# short-message heuristic catch the vast majority of these.
CASUAL_PATTERNS = {
    "hi", "hello", "hey", "yo", "sup", "hiya", "howdy",
    "how are you", "how are you doing", "how's it going", "hows it going",
    "what's up", "whats up", "good morning", "good afternoon", "good evening",
    "thanks", "thank you", "thanks a lot", "appreciate it",
    "bye", "goodbye", "see you", "cya",
    "who are you", "what are you", "what can you do", "help",
}

CASUAL_SYSTEM_PROMPT = (
    "You are SpaceMind, a friendly AI space research assistant used by people "
    "learning about or pursuing careers in astronomy and aerospace. Respond to "
    "this casual message naturally and briefly (1-2 sentences). If asked how "
    "you are, answer warmly, then invite them to ask a space/astronomy question. "
    "If asked what you do, mention you can answer questions grounded in NASA and "
    "arXiv papers, with live web search as backup. Don't mention citations, "
    "databases, or retrieval mechanics unless directly asked."
)


@dataclass
class Citation:
    source_file: str
    origin: str  # "arxiv", "ntrs", "ads", or "semantic_scholar"
    snippet: str
    url: Optional[str] = None


@dataclass
class Answer:
    text: str
    citations: List[Citation]
    follow_up_questions: List[str] = field(default_factory=list)
    confident: bool = True
    used_web: bool = False


def _is_casual(question: str) -> bool:
    q = question.strip().lower().rstrip("!.? ")
    if q in CASUAL_PATTERNS:
        return True
    # Astronomy terms such as "Mars", "Sun", and "stars" are research,
    # even when they are only a few letters long.
    return q in {"hii", "hiii", "heyy", "heyyy", "thx"}



def _answer_casual(question: str, llm) -> Answer:
    prompt = f"{CASUAL_SYSTEM_PROMPT}\n\nMessage: {question}\nReply:"
    response = llm.complete(prompt)
    return Answer(text=str(response).strip(), citations=[], confident=True, used_web=False)


_reranker_cache = None
_reranker_disabled = False


def get_llm():
    if LLM_PROVIDER == "groq":
        if not GROQ_API_KEY:
            raise RuntimeError(
                "LLM_PROVIDER is 'groq' but GROQ_API_KEY is not set. "
                "Get a free key at https://console.groq.com/keys and set it "
                "as an environment variable, or set LLM_PROVIDER=ollama for "
                "local development."
            )
        return Groq(model=GROQ_MODEL, api_key=GROQ_API_KEY)

    return Ollama(
        model=OLLAMA_MODEL,
        base_url=OLLAMA_BASE_URL,
        request_timeout=OLLAMA_REQUEST_TIMEOUT,
        context_window=OLLAMA_NUM_CTX,
        additional_kwargs={"num_ctx": OLLAMA_NUM_CTX},
    )


def _get_reranker():
    global _reranker_cache
    global _reranker_disabled
    if _reranker_cache is None and RERANK_ENABLED and not _reranker_disabled:
        try:
            from llama_index.core.postprocessor import SentenceTransformerRerank

            logger.info("Loading re-ranker model: %s", RERANK_MODEL)
            _reranker_cache = SentenceTransformerRerank(model=RERANK_MODEL, top_n=TOP_K)
        except ImportError:
            logger.warning("Re-ranking is on but sentence-transformers isn't installed - skipping it.")
            _reranker_disabled = True
    return _reranker_cache


def _citation_url(origin: str, doc_id: str) -> Optional[str]:
    """Resolve a chunk's source metadata into a real, clickable paper URL."""
    if origin == "arxiv":
        return ARXIV_ABS_URL + doc_id
    if origin == "ntrs":
        return NTRS_CITATION_URL + doc_id
    if origin == "semantic_scholar":
        return SEMANTIC_SCHOLAR_ABS_URL + doc_id
    return None


def condense_question(
    history: List[Tuple[str, str]], latest_question: str, llm
) -> str:
    """
    Given prior (question, answer) turns and a new question, rewrites the
    new question as a fully standalone one — e.g. "what about black holes?"
    after a dark-matter exchange becomes "What causes black holes to form?"
    This keeps the existing citation-retrieval pipeline working unchanged
    for multi-turn conversations.
    """
    if not history:
        return latest_question

    transcript = "\n".join(f"Q: {q}\nA: {a}" for q, a in history[-4:])
    prompt = (
        "Given this conversation history and a follow-up question, rewrite "
        "the follow-up as a standalone question that makes sense without "
        "the history. If it's already standalone, return it unchanged. "
        "Reply with ONLY the rewritten question, nothing else.\n\n"
        f"History:\n{transcript}\n\nFollow-up question: {latest_question}\n\n"
        "Standalone question:"
    )
    try:
        response = llm.complete(prompt)
        rewritten = str(response).strip().strip('"')
        return rewritten or latest_question
    except Exception as e:
        logger.warning("Question condensing failed, using original question: %s", e)
        return latest_question


def _generate_follow_ups(question: str, answer_text: str, llm) -> List[str]:
    """Best-effort: ask the LLM for 2-3 natural follow-up questions."""
    prompt = (
        "Given this question and answer, suggest exactly 3 short, natural "
        "follow-up questions a curious reader might ask next. Reply with "
        "ONLY a JSON array of 3 strings, nothing else.\n\n"
        f"Question: {question}\nAnswer: {answer_text}\n\nFollow-up questions:"
    )
    try:
        response = llm.complete(prompt)
        raw = str(response).strip()
        # Models sometimes wrap JSON in a code fence despite instructions.
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(q).strip() for q in parsed[:3] if str(q).strip()]
    except Exception as e:
        logger.info("Follow-up generation skipped (non-fatal): %s", e)
    return []


def _answer_from_web(
    question: str, depth: str, llm, web_results: List[WebResult], with_follow_ups: bool
) -> Answer:
    """Answers directly from live web search results (not the paper index),
    with the same [N] citation style and depth handling as paper answers."""
    depth_prefix = DEPTH_INSTRUCTIONS.get(depth, DEPTH_INSTRUCTIONS["technical"])
    context = "\n\n".join(
        f"[{i + 1}] {r.title} ({r.url})\n{r.snippet}" for i, r in enumerate(web_results)
    )
    prompt = (
        f"{depth_prefix}{question}\n\n"
        "Answer using ONLY the numbered web sources below — do not rely on "
        "prior knowledge beyond them. Cite sources inline using [N] matching "
        "the source numbers. If the sources genuinely don't contain enough "
        "to answer, say so honestly instead of guessing.\n\n"
        f"Sources:\n{context}\n\nAnswer:"
    )
    response = llm.complete(prompt)
    answer_text = str(response).strip()

    citations = [
        Citation(source_file=r.title, origin="web", snippet=r.snippet, url=r.url)
        for r in web_results
    ]
    follow_ups = (
        _generate_follow_ups(question, answer_text, llm) if with_follow_ups else []
    )
    return Answer(
        text=answer_text,
        citations=citations,
        follow_up_questions=follow_ups,
        confident=True,
        used_web=True,
    )


def build_query_engine(index, top_k: int = TOP_K) -> CitationQueryEngine:
    """
    Wraps an already-loaded index in a CitationQueryEngine, which
    automatically numbers each retrieved chunk and instructs the LLM to
    cite [N] for every claim it makes.
    """
    postprocessors = []
    reranker = _get_reranker()
    if reranker is not None:
        postprocessors.append(reranker)

    engine = CitationQueryEngine.from_args(
        index,
        similarity_top_k=RETRIEVE_TOP_K if reranker is not None else top_k,
        citation_chunk_size=512,
        citation_qa_template=STRICT_QA_TEMPLATE,
        node_postprocessors=postprocessors,
    )
    return engine


def _check_confidence(index, question: str) -> bool:
    """Quick low-cost retrieval pass to check whether we have anything
    relevant before spending an LLM call on a weak match."""
    retriever = index.as_retriever(similarity_top_k=1)
    nodes = retriever.retrieve(question)
    if not nodes:
        return False
    score = nodes[0].score if nodes[0].score is not None else 0.0
    return score >= MIN_SIMILARITY_SCORE


def ask(
    question: str,
    top_k: int = TOP_K,
    depth: str = "technical",
    history: Optional[List[Tuple[str, str]]] = None,
    with_follow_ups: bool = True,
    use_web: Optional[bool] = None,
) -> Answer:
    """
    Ask a natural-language question and get back an answer + citations.

    `history` (list of prior (question, answer) tuples) enables multi-turn
    conversations — the question is condensed into a standalone form
    before retrieval so follow-ups like "what about X?" work correctly.

    `use_web` controls live web search:
      - None (default): papers first; if the paper library doesn't have a
        confident match, automatically falls back to a live web search
        instead of just saying "I don't know".
      - True: always answer from a live web search, skipping the paper
        library entirely — for "what's the latest on X" style questions.
      - False: papers only, no web fallback — the old strict behavior.
    """
    llm = get_llm()
    Settings.llm = llm

    if use_web is not True and _is_casual(question):
        return _answer_casual(question, llm)

    standalone_question = condense_question(history or [], question, llm)

    # Explicit Web mode never depends on a local index or silently falls back.
    if use_web is True:
        if not (WEB_SEARCH_ENABLED and TAVILY_API_KEY):
            raise RuntimeError("Web research is not configured.")
        web_results = search_web(standalone_question)
        if not web_results:
            return Answer(text="Web research returned no usable sources. Try another query or switch to Papers only.", citations=[], confident=False)
        return _answer_from_web(standalone_question, depth, llm, web_results, with_follow_ups)

    index = load_index()
    local_confident = index is not None and _check_confidence(index, standalone_question)
    if use_web is None and not local_confident and WEB_SEARCH_ENABLED and TAVILY_API_KEY:
        web_results = search_web(standalone_question)
        if web_results:
            return _answer_from_web(standalone_question, depth, llm, web_results, with_follow_ups)

    if not local_confident:
        return Answer(text=FALLBACK_MESSAGE, citations=[], confident=False)

    engine = build_query_engine(index, top_k=top_k)
    depth_prefix = DEPTH_INSTRUCTIONS.get(depth, DEPTH_INSTRUCTIONS["technical"])
    response = engine.query(depth_prefix + standalone_question)

    citations = [
        Citation(
            source_file=node.metadata.get("file_name", "unknown"),
            origin=node.metadata.get("source", "unknown"),
            snippet=node.get_text()[:300],
            url=_citation_url(
                node.metadata.get("source", ""), node.metadata.get("doc_id", "")
            ),
        )
        for node in response.source_nodes
    ]

    follow_ups = (
        _generate_follow_ups(standalone_question, str(response), llm)
        if with_follow_ups
        else []
    )

    return Answer(
        text=str(response),
        citations=citations,
        follow_up_questions=follow_ups,
        confident=True,
        used_web=False,
    )


if __name__ == "__main__":
    import sys

    logging.basicConfig(level=logging.INFO)
    question = " ".join(sys.argv[1:]) or "What is dark matter?"
    result = ask(question)
    print("\n--- ANSWER ---")
    print(result.text)
    print("\n--- SOURCES ---")
    for i, c in enumerate(result.citations, start=1):
        print(f"[{i}] ({c.origin}) {c.source_file} — {c.url}")
    if result.follow_up_questions:
        print("\n--- FOLLOW-UPS ---")
        for q in result.follow_up_questions:
            print(f"- {q}")
