// src/dashboard.ts
import DatabaseCtor from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";

const REPORT_DIR = process.env.REPORT_DIR ?? "reports";
const DB_PATH = path.join(REPORT_DIR, "runs.db");
const OUT = path.join(REPORT_DIR, "index.html");

const db = new DatabaseCtor(DB_PATH, { readonly: false });

// Derive totals from steps so dashboard is accurate even if a run row had zeros.
const runs = db.prepare(`
  SELECT
    r.run_id, r.started_at, r.finished_at,
    r.base_url, r.model_id, r.region, r.reports_dir,
    COALESCE(t.total, 0)   AS total,
    COALESCE(t.passed, 0)  AS passed,
    COALESCE(t.failed, 0)  AS failed,
    COALESCE(t.skipped, 0) AS skipped
  FROM runs r
  LEFT JOIN (
    SELECT
      run_id,
      COUNT(*) AS total,
      SUM(CASE WHEN status='passed'  THEN 1 ELSE 0 END) AS passed,
      SUM(CASE WHEN status='failed'  THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END) AS skipped
    FROM steps
    GROUP BY run_id
  ) t ON t.run_id = r.run_id
  ORDER BY r.started_at DESC
`).all() as any[];

const html = `<!doctype html><meta charset="utf-8"><title>MCP Runs Dashboard</title>
<style>
  body{font-family:system-ui;margin:24px}
  table{border-collapse:collapse;width:100%}
  td,th{border:1px solid #ddd;padding:8px}
  .ok{color:green}.bad{color:#b00020}
  a{color:#0366d6;text-decoration:none}
  code{background:#f7f7f7;padding:1px 4px;border-radius:4px}
</style>
<h1>MCP Runs</h1>
<table>
  <tr><th>Run ID</th><th>Started</th><th>Finished</th><th>Totals</th><th>Base URL</th><th>Model/Region</th><th>Report</th></tr>
  ${runs.map(r => `
    <tr>
      <td><code>${r.run_id}</code></td>
      <td>${r.started_at}</td>
      <td>${r.finished_at ?? ""}</td>
      <td>${r.passed}/${r.total} passed ${r.failed?`<span class="bad">(${r.failed} failed)</span>`:""}</td>
      <td><code>${r.base_url}</code></td>
      <td><code>${r.model_id}</code> / <code>${r.region}</code></td>
      <td>${r.reports_dir ? `<a href="./${path.basename(r.reports_dir)}/run-report.html">open</a>` : ""}</td>
    </tr>
  `).join("")}
</table>
`;

fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`Dashboard written: ${OUT}`);
