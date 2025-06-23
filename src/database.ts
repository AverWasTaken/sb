import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

export async function openDb() {
  const db = await open({
    filename: './farm.db',
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      last_farmed BIGINT DEFAULT 0
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      user_id TEXT,
      item TEXT,
      quantity INTEGER,
      PRIMARY KEY (user_id, item),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS loans (
      user_id TEXT PRIMARY KEY,
      amount INTEGER DEFAULT 0,
      interest_rate REAL DEFAULT 0.15,
      due_date BIGINT DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS gambo_scores (
      user_id TEXT PRIMARY KEY,
      score INTEGER DEFAULT 500,
      total_bets INTEGER DEFAULT 0,
      total_winnings INTEGER DEFAULT 0,
      total_losses INTEGER DEFAULT 0,
      loans_repaid INTEGER DEFAULT 0,
      loans_defaulted INTEGER DEFAULT 0,
      last_updated BIGINT DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  return db;
} 