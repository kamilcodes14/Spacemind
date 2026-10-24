// Display logic for evidence: labels, supporting-passage links, coverage summary, claim labels.
// Kept DOM-free so it can be unit-tested. Exposes window.SpaceMindEvidence.
(() => {
  const safe = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  const count = (n, word) => `${n} ${word}`;
  function sourceLabel(c) { return c.evidence_label || (String(c.origin || '').includes('abstract') ? 'Abstract only' : ''); }
  // Each passage: the exact quote the checker accepted, an optional page (uploaded PDFs only),
  // and a link that opens the source at the passage when the browser supports text fragments.
  function passages(c) {
    const list = Array.isArray(c.supporting_passages) && c.supporting_passages.length ? c.supporting_passages : (c.supporting_quotes || []).map(quote => ({ quote }));
    return list.filter(p => p && typeof p.quote === 'string' && p.quote.trim()).map(p => {
      const fragment = safe(p.text_fragment_url), href = fragment || safe(p.url);
      return { quote: p.quote, page: Number.isInteger(p.page) ? p.page : null, href, linkLabel: !href ? '' : fragment ? 'Open at passage ↗' : 'Open source ↗' };
    });
  }
  function evidenceSummary(s) {
    if (!s || typeof s !== 'object' || !Number.isFinite(s.documents)) return '';
    const k = s.by_kind || {}, parts = [];
    if (s.full_text_documents) parts.push(count(s.full_text_documents, 'with full text'));
    if (s.abstract_only_documents) parts.push(count(s.abstract_only_documents, 'abstract only'));
    if (k.web) parts.push(count(k.web, k.web === 1 ? 'web page' : 'web pages'));
    let text = `${s.documents} ${s.documents === 1 ? 'document' : 'documents'}${parts.length ? ': ' + parts.join(', ') : ''}.`;
    if (Array.isArray(s.uncovered_terms) && s.uncovered_terms.length) text += ` Not found in the evidence: ${s.uncovered_terms.slice(0, 4).join(', ')}.`;
    return text;
  }
  function claimLabel(check) {
    if (check.status === 'partial') return check.support_basis === 'numeric_guard' ? 'Partially supported (a number is missing from the excerpt)' : 'Partially supported';
    return ({ supported: 'Supported by excerpt', unsupported: 'Unsupported', unverified: 'Not verified' })[check.status] || 'Not verified';
  }
  window.SpaceMindEvidence = { sourceLabel, passages, evidenceSummary, claimLabel };
})();
