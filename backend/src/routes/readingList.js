import { Router } from 'express';
import db from '../db/connection.js';
import { saveReadingItemSchema } from '../utils/validation.js';
import { AppError } from '../utils/errors.js';
import { generateId } from '../utils/id.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', (req, res) => {
  const items = db.prepare(
    'SELECT * FROM reading_list WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.userId);
  res.json({ items: items.map(formatItem) });
});

router.post('/', (req, res) => {
  const data = saveReadingItemSchema.parse(req.body);

  const existing = db.prepare(
    'SELECT id FROM reading_list WHERE user_id = ? AND paper_id = ?'
  ).get(req.userId, data.paperId);
  if (existing) {
    throw new AppError(409, 'Paper already in reading list');
  }

  const id = generateId('r');
  db.prepare(
    `INSERT INTO reading_list (id, user_id, paper_id, title, authors, year, venue, arxiv_or_doi, summary, saved_from)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, req.userId, data.paperId, data.title,
    JSON.stringify(data.authors), data.year, data.venue,
    data.arxivOrDoi, data.summary, data.savedFrom
  );

  const item = db.prepare('SELECT * FROM reading_list WHERE id = ?').get(id);
  res.status(201).json({ item: formatItem(item) });
});

router.delete('/:paperId', (req, res) => {
  const result = db.prepare(
    'DELETE FROM reading_list WHERE user_id = ? AND paper_id = ?'
  ).run(req.userId, req.params.paperId);
  if (result.changes === 0) throw new AppError(404, 'Paper not found in reading list');
  res.json({ ok: true });
});

function formatItem(row) {
  return {
    ...row,
    authors: JSON.parse(row.authors),
  };
}

export default router;
