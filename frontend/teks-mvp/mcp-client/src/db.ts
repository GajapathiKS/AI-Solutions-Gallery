// src/db.ts
import DatabaseCtor from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";

export type RunRow = {
  run_id: string;
  started_at: string;
  finished_at: string;
  base_url: string;
  model_id: string;
  region: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  reports_dir: string;
};

export type StepRow = {
  run_id: string;
  idx: number;
  action: string;
  selector?: string | null;
  url?: string | null;
  status: string;
  duration_ms: number;
  error?: string | null;
  screenshot?: string | null;
};

type DB = InstanceType<typeof DatabaseCtor>;

export function openDb(dbPath = path.join("reports", "runs.db")): DB {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseCtor(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      base_url TEXT NOT NULL,
      model_id TEXT NOT NULL,
      region TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      passed INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      reports_dir TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS steps (
      run_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      action TEXT NOT NULL,
      selector TEXT,
      url TEXT,
      status TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      error TEXT,
      screenshot TEXT,
      PRIMARY KEY (run_id, idx),
      FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE
    );
  `);

  return db;
}

export function upsertRun(db: DB, r: RunRow) {
  const stmt = db.prepare(`
    INSERT INTO runs (
      run_id, started_at, finished_at, base_url, model_id, region,
      total, passed, failed, skipped, reports_dir
    ) VALUES (
      @run_id, @started_at, @finished_at, @base_url, @model_id, @region,
      @total, @passed, @failed, @skipped, @reports_dir
    )
    ON CONFLICT(run_id) DO UPDATE SET
      finished_at = excluded.finished_at,
      total       = excluded.total,
      passed      = excluded.passed,
      failed      = excluded.failed,
      skipped     = excluded.skipped,
      reports_dir = excluded.reports_dir
  `);
  stmt.run(r);
}

export function insertSteps(db: DB, rows: StepRow[]) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO steps (
      run_id, idx, action, selector, url, status, duration_ms, error, screenshot
    ) VALUES (
      @run_id, @idx, @action, @selector, @url, @status, @duration_ms, @error, @screenshot
    )
  `);
  const tx = db.transaction((data: StepRow[]) => {
    for (const row of data) stmt.run(row);
  });
  tx(rows);
}
