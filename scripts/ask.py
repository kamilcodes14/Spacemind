"""
Quick CLI to ask the assistant a question without spinning up the API.

Usage:
    python scripts/ask.py "What causes gamma-ray bursts?"
    python scripts/ask.py --depth simple "What causes gamma-ray bursts?"
    python scripts/ask.py --chat              # interactive multi-turn session
"""

import sys
import argparse
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.query.query_engine import ask
from src.ingestion.bootstrap import ensure_index

logging.basicConfig(level=logging.WARNING)


def print_answer(result):
    print(f"A: {result.text}\n")

    if not result.confident:
        return

    if result.used_web:
        print("(sourced from a live web search)\n")

    if result.citations:
        print("Sources:")
        for i, c in enumerate(result.citations, start=1):
            url_part = f" — {c.url}" if c.url else ""
            print(f"  [{i}] ({c.origin}) {c.source_file}{url_part}")

    if result.follow_up_questions:
        print("\nYou might also ask:")
        for q in result.follow_up_questions:
            print(f"  - {q}")


def run_chat(depth: str, use_web):
    print("SpaceMind chat — multi-turn session. Type 'exit' to quit.\n")
    history = []
    while True:
        try:
            question = input("Q: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not question:
            continue
        if question.lower() in ("exit", "quit"):
            break

        result = ask(question, depth=depth, history=history, use_web=use_web)
        print()
        print_answer(result)
        print()
        if result.confident:
            history.append((question, result.text))


def main():
    parser = argparse.ArgumentParser(description="Ask SpaceMind a question.")
    parser.add_argument("question", nargs="*", help="The question to ask (omit for --chat mode)")
    parser.add_argument("--depth", choices=["simple", "technical"], default="technical")
    parser.add_argument("--chat", action="store_true", help="Interactive multi-turn session")
    parser.add_argument(
        "--use-web",
        choices=["auto", "always", "off"],
        default="auto",
        help="auto: fall back to web search if papers aren't confident (default). "
        "always: skip papers, always search the web. off: papers only, no web.",
    )
    args = parser.parse_args()
    use_web = {"auto": None, "always": True, "off": False}[args.use_web]

    # First run on an empty index: build it automatically (blocks until done).
    logging.getLogger("src.ingestion.bootstrap").setLevel(logging.INFO)
    logging.getLogger().setLevel(logging.INFO)
    ensure_index(background=False)
    logging.getLogger().setLevel(logging.WARNING)

    if args.chat:
        run_chat(depth=args.depth, use_web=use_web)
        return

    if not args.question:
        parser.print_usage()
        sys.exit(1)

    question = " ".join(args.question)
    print(f"\nQ: {question}\n")
    result = ask(question, depth=args.depth, use_web=use_web)
    print_answer(result)


if __name__ == "__main__":
    main()
