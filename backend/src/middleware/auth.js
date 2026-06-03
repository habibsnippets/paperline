import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from '../utils/errors.js';

export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError(401, 'Missing or invalid authorization header');
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.userId = payload.sub;
    req.userTier = payload.tier || 'free';
    next();
  } catch {
    throw new AppError(401, 'Invalid or expired token');
  }
}
