import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {cleanPaperFields} from '../../supabase/functions/embed-paper/clean-text.js';

test('PDF NUL bytes survive JSON parsing but require cleaning before PostgreSQL JSONB', async () => {
  const db = new PGlite();
  try {
    const original = {id:'original-chunk-hash', doc_id:'arxiv:2609.37293v1', content:'Flux\u0000density α = 1.2\nμm', title:'Star\u0000formation', authors:['A\u0000B'], year:2026};
    await assert.rejects(db.query('select $1::jsonb', [JSON.stringify(original)]));
    const cleaned = cleanPaperFields(original);
    const result = await db.query('select $1::jsonb as paper', [JSON.stringify(cleaned)]);
    assert.deepEqual(result.rows[0].paper, cleaned);
    assert.equal(cleaned.content, 'Flux density α = 1.2\nμm');
    assert.equal(cleaned.id, original.id);
    assert.equal(original.content.includes('\u0000'), true);
    assert.deepEqual(cleanPaperFields(cleaned), cleaned);
  } finally { await db.close(); }
});
