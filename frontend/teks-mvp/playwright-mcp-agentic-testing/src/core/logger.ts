// src/core/logger.ts
import fs from "fs";
import path from "path";

export class RunLogger {
  constructor(private readonly runId: string, private readonly runDir: string) {
    fs.mkdirSync(runDir, { recursive: true });
  }

  private line(level: "INFO"|"WARN"|"ERROR"|"DEBUG", msg: string, data?: Record<string, unknown>) {
    const ts = new Date().toISOString();
    const entry = { ts, level, msg, ...(data || {}) };
    const text = `${ts} [${level}] ${msg} ${data ? JSON.stringify(data) : ""}\n`;
    process.stdout.write(text);
    fs.appendFileSync(path.join(this.runDir, "run.log"), JSON.stringify(entry) + "\n");
  }

  info(msg: string, data?: Record<string, unknown>) { this.line("INFO", msg, data); }
  warn(msg: string, data?: Record<string, unknown>) { this.line("WARN", msg, data); }
  error(msg: string, data?: Record<string, unknown>) { this.line("ERROR", msg, data); }
  debug(msg: string, data?: Record<string, unknown>) { this.line("DEBUG", msg, data); }
}
export const logger = {
  info: (...args: any[]) => console.log("[INFO]", ...args),
  error: (...args: any[]) => console.error("[ERROR]", ...args),
};
