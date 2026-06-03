import { randomBytes } from 'crypto';

export function generateId(prefix = '') {
  const bytes = randomBytes(12);
  const id = Array.from(bytes)
    .map(b => b.toString(36).padStart(2, '0'))
    .join('');
  return `${prefix}${id}`;
}
