import { Router } from 'express';
import { normalizeSearchText } from '../catalog.js';

const MAX_RESULTS = 20;
const MIN_QUERY_LENGTH = 2;
const MAX_TERMS = 6;

function escapeLike(term) {
  return term.replace(/[\\%_]/g, '\\$&');
}

export function catalogRouter(db) {
  const router = Router();

  const countAll = db.prepare('SELECT COUNT(*) FROM catalog_products').pluck();

  router.get('/search', (req, res) => {
    const total = countAll.get();
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean).slice(0, MAX_TERMS);
    if (query.trim().length < MIN_QUERY_LENGTH) return res.json({ total, results: [] });

    // Every term has to match, and the most complete entries come first.
    const conditions = terms.map(() => "search_text LIKE ? ESCAPE '\\'").join(' AND ');
    const results = db
      .prepare(`
        SELECT code, name, brand, category, ingredients, image_url
        FROM catalog_products
        WHERE ${conditions}
        ORDER BY ingredients != '' DESC, image_url IS NOT NULL DESC, name COLLATE NOCASE, code
        LIMIT ${MAX_RESULTS}
      `)
      .all(terms.map((term) => `%${escapeLike(term)}%`));

    res.json({ total, results });
  });

  return router;
}
