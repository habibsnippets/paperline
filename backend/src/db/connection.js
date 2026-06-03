import Database from 'better-sqlite3';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config.js';

const dbDir = dirname(config.dbPath);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = readFileSync(new URL('schema.sql', import.meta.url), 'utf-8');
db.exec(schema);

export default db;
