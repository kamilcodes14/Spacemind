// PDF extraction can contain NUL bytes, which PostgreSQL text/JSONB rejects.
// Keep the original chunk ID so retrying the corpus does not create duplicates.
export function cleanPaperText(value) {
  if (typeof value === 'string') return value.replaceAll('\u0000', ' ');
  if (Array.isArray(value)) return value.map(cleanPaperText);
  return value;
}

export function cleanPaperFields(body) {
  const cleaned = {...body};
  for (const key of ['content', 'title', 'authors', 'categories', 'arxiv_id']) {
    if (key in cleaned) cleaned[key] = cleanPaperText(cleaned[key]);
  }
  return cleaned;
}
