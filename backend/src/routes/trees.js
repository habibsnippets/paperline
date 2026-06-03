import { Router } from 'express';
import db from '../db/connection.js';
import { saveTreeSchema, updateTreeSchema } from '../utils/validation.js';
import { AppError } from '../utils/errors.js';
import { generateId } from '../utils/id.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.post('/', (req, res) => {
  const { topic, rootPaper, treeData, depth } = saveTreeSchema.parse(req.body);

  const user = db.prepare('SELECT trees_used, trees_limit FROM users WHERE id = ?').get(req.userId);
  if (!user) throw new AppError(404, 'User not found');
  if (user.trees_used >= user.trees_limit) {
    throw new AppError(403, 'Tree limit reached. Upgrade your plan.');
  }

  const id = generateId('t');
  db.prepare(
    `INSERT INTO trees (id, user_id, topic, root_paper, tree_data, depth)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, req.userId, topic, JSON.stringify(rootPaper), JSON.stringify(treeData), depth);

  db.prepare('UPDATE users SET trees_used = trees_used + 1 WHERE id = ?').run(req.userId);

  const tree = db.prepare('SELECT * FROM trees WHERE id = ?').get(id);
  res.status(201).json({ tree: formatTree(tree) });
});

router.get('/', (req, res) => {
  const trees = db.prepare(
    'SELECT * FROM trees WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(req.userId);
  res.json({ trees: trees.map(formatTree) });
});

router.get('/:id', (req, res) => {
  const tree = db.prepare('SELECT * FROM trees WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!tree) throw new AppError(404, 'Tree not found');
  res.json({ tree: formatTree(tree) });
});

router.put('/:id', (req, res) => {
  const { topic, treeData } = updateTreeSchema.parse(req.body);

  const existing = db.prepare('SELECT id FROM trees WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!existing) throw new AppError(404, 'Tree not found');

  const updates = [];
  const values = [];
  if (topic !== undefined) { updates.push('topic = ?'); values.push(topic); }
  if (treeData !== undefined) { updates.push('tree_data = ?'); values.push(JSON.stringify(treeData)); }
  if (updates.length === 0) throw new AppError(400, 'No fields to update');

  updates.push("updated_at = datetime('now')");
  values.push(req.params.id, req.userId);

  db.prepare(
    `UPDATE trees SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
  ).run(...values);

  const tree = db.prepare('SELECT * FROM trees WHERE id = ?').get(req.params.id);
  res.json({ tree: formatTree(tree) });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM trees WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.userId);
  if (result.changes === 0) throw new AppError(404, 'Tree not found');
  res.json({ ok: true });
});

function formatTree(row) {
  return {
    ...row,
    root_paper: JSON.parse(row.root_paper),
    tree_data: JSON.parse(row.tree_data),
  };
}

export default router;
