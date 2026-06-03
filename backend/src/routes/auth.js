import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../db/connection.js';
import { config } from '../config.js';
import { registerSchema, loginSchema } from '../utils/validation.js';
import { AppError } from '../utils/errors.js';
import { generateId } from '../utils/id.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

function createToken(user) {
  return jwt.sign(
    { sub: user.id, tier: user.tier, email: user.email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

router.post('/register', (req, res) => {
  const { email, password, name } = registerSchema.parse(req.body);

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    throw new AppError(409, 'Email already registered');
  }

  const id = generateId('u');
  const passwordHash = bcrypt.hashSync(password, 12);
  const stmt = db.prepare(
    `INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)`
  );
  stmt.run(id, email, passwordHash, name);

  const user = db.prepare('SELECT id, email, name, tier, created_at FROM users WHERE id = ?').get(id);
  const token = createToken(user);

  res.status(201).json({ user, token });
});

router.post('/login', (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    throw new AppError(401, 'Invalid email or password');
  }

  const { password_hash, ...safe } = user;
  const token = createToken(user);

  res.json({ user: safe, token });
});

router.get('/me', authenticate, (req, res) => {
  const user = db.prepare(
    'SELECT id, email, name, tier, trees_used, trees_limit, created_at FROM users WHERE id = ?'
  ).get(req.userId);
  if (!user) throw new AppError(404, 'User not found');
  res.json({ user });
});

export default router;
