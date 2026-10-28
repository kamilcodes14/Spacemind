// Shared by the static hosted app and the optional Python frontend.
(() => {
  const text = (value) =>
    typeof value === 'string'
      ? value
          .replace(/[\u0000-\u001f\u007f]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '';
  const url = (value) => {
    try {
      const parsed = new URL(value);
      return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : '';
    } catch {
      return '';
    }
  };
  const latex = (value) =>
    text(value).replace(
      /[\\{}$&#%_^~]/g,
      (c) =>
        ({
          '\\': '\\textbackslash{}',
          '{': '\\{',
          '}': '\\}',
          '$': '\\$',
          '&': '\\&',
          '#': '\\#',
          '%': '\\%',
          '_': '\\_',
          '^': '\\textasciicircum{}',
          '~': '\\textasciitilde{}',
        })[c],
    );
  function papers(sources) {
    const records = new Map();
    for (const source of Array.isArray(sources) ? sources : []) {
      if (!source || source.origin === 'spacemind-tool-v1') continue;
      const title = text(source.title) || text(source.source_file);
      if (!title) continue;
      const authors = (Array.isArray(source.authors) ? source.authors : [])
        .map((a) => text(typeof a === 'string' ? a : a?.name))
        .filter(Boolean);
      const year = /^\d{4}$/.test(String(source.year))
        ? String(source.year)
        : '';
      const arxiv = text(source.arxiv_id);
      const link = url(source.url);
      const doi = text(source.doi).replace(
        /^https?:\/\/(?:dx\.)?doi\.org\//i,
        '',
      );
      const key =
        source.origin === 'uploaded_pdf' && source.doc_id
          ? `upload:${source.doc_id}`
          : arxiv
            ? `arxiv:${arxiv}`
            : doi
              ? `doi:${doi.toLowerCase()}`
              : link ||
                text(source.doc_id) ||
                JSON.stringify([title.toLowerCase(), year, authors]);
      const paper = {
        title,
        authors,
        year,
        arxiv,
        url: link,
        doi,
        origin: text(source.origin),
      };
      const previous = records.get(key);
      if (!previous) records.set(key, paper);
      else {
        // Repeated retrieval chunks often carry the same paper's metadata.
        for (const field of ['year', 'arxiv', 'doi', 'url'])
          if (!previous[field]) previous[field] = paper[field];
        if (!previous.authors.length) previous.authors = authors;
      }
    }
    return [...records.values()];
  }
  function bibtex(sources) {
    return papers(sources)
      .map((paper, index) => {
        const fields = [['title', `{${latex(paper.title)}}`]];
        if (paper.authors.length)
          fields.push(['author', paper.authors.map(latex).join(' and ')]);
        if (paper.year) fields.push(['year', paper.year]);
        if (paper.doi) fields.push(['doi', latex(paper.doi)]);
        if (paper.arxiv)
          fields.push(
            ['eprint', latex(paper.arxiv)],
            ['archivePrefix', 'arXiv'],
          );
        if (paper.url) fields.push(['url', latex(paper.url)]);
        if (paper.origin.includes('abstract'))
          fields.push([
            'note',
            'Metadata from an abstract record; verify against the original publication',
          ]);
        // No journal/volume/pages are invented when retrieval does not supply them.
        return `@misc{spacemind${index + 1},\n${fields.map(([key, value]) => `  ${key} = {${value}}`).join(',\n')}\n}`;
      })
      .join('\n\n');
  }
  function apaAuthor(name) {
    // Comma-separated family names are unambiguous. Unstructured names follow
    // the common final-family-name convention and require user review.
    const comma = name.indexOf(',');
    const parts = name.split(/\s+/);
    if (parts.length === 1) return name;
    const family = comma >= 0 ? name.slice(0, comma).trim() : parts.pop();
    const given =
      comma >= 0
        ? name
            .slice(comma + 1)
            .trim()
            .split(/\s+/)
        : parts;
    const initials = given
      .filter(Boolean)
      .map((part) =>
        part
          .split('-')
          .map((p) => `${Array.from(p)[0]}.`)
          .join('-'),
      )
      .join(' ');
    return `${family}, ${initials}`;
  }
  function apa(sources) {
    return papers(sources)
      .map((paper) => {
        const authors = paper.authors.map(apaAuthor);
        let byline =
          authors.length > 20
            ? `${authors.slice(0, 19).join(', ')}, … ${authors.at(-1)}`
            : authors.length > 1
              ? `${authors.slice(0, -1).join(', ')}, & ${authors.at(-1)}`
              : authors[0] || '';
        const date = `(${paper.year || 'n.d.'}).`;
        const title = `${paper.title.replace(/[.]$/, '')}.`;
        const archive = paper.arxiv ? ' arXiv.' : '';
        const link = paper.doi ? `https://doi.org/${paper.doi}` : paper.url;
        return {
          sort: byline || paper.title,
          line: `${byline ? `${byline} ${date} ${title}` : `${title} ${date}`}${archive}${link ? ` ${link}` : ''}`,
        };
      })
      .sort((a, b) => a.sort.localeCompare(b.sort))
      .map((item) => item.line)
      .join('\n\n');
  }
  function download(sources, format) {
    if (!['bibtex', 'apa'].includes(format))
      throw new Error('Choose BibTeX or APA.');
    if (!papers(sources).length)
      throw new Error('No citation metadata is available to export.');
    const content =
      format === 'bibtex'
        ? bibtex(sources)
        : `APA reference draft — check author family names, publication details and italics against the original papers. Missing metadata is not inferred.\n\n${apa(sources)}`;
    const objectURL = URL.createObjectURL(
      new Blob([content + '\n'], { type: 'text/plain;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = objectURL;
    anchor.download =
      format === 'bibtex'
        ? 'spacemind-references.bib'
        : 'spacemind-apa-references.txt';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
  }
  globalThis.SpaceMindCitations = Object.freeze({
    papers,
    bibtex,
    apa,
    download,
  });
})();
