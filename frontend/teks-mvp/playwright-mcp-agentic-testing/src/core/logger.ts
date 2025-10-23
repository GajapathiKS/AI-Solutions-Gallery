import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, formatTimestamp, writeJson } from './utils.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface LoggerOptions {
  filePath: string;
  level?: LogLevel;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export class RunLogger {
  private readonly filePath: string;
  private readonly level: LogLevel;
  private readonly entries: LogEntry[] = [];
  private stream?: fs.WriteStream;

  constructor(options: LoggerOptions) {
    this.filePath = options.filePath;
    this.level = options.level ?? 'info';
    ensureDir(path.dirname(this.filePath));
    this.stream = fs.createWriteStream(this.filePath, { flags: 'a' });
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.write('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.write('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.write('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.write('error', message, data);
  }

  getLogs(): LogEntry[] {
    return [...this.entries];
  }

  close(): void {
    this.stream?.end();
  }

  private write(level: LogLevel, message: string, data?: Record<string, unknown>) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) {
      return;
    }
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      data
    };
    this.entries.push(entry);
    const line = `${entry.timestamp} [${level.toUpperCase()}] ${message}${data ? ` ${JSON.stringify(data)}` : ''}\n`;
    if (level === 'error') {
      console.error(line.trim());
    } else if (level === 'warn') {
      console.warn(line.trim());
    } else {
      console.log(line.trim());
    }
    this.stream?.write(line);
  }
}

export interface StepRecord {
  index: number;
  action: string;
  description?: string;
  status: 'pending' | 'passed' | 'failed';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  observationPath?: string;
}

export interface RunSummary {
  runId: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  environment: string;
  plan: unknown;
  steps: StepRecord[];
  verification?: {
    status: 'passed' | 'failed';
    details?: string;
  };
}

export function persistSummary(filePath: string, summary: RunSummary): void {
  writeJson(filePath, summary);
}

export function createLogger(baseDir: string, runId: string, level: LogLevel = 'info') {
  const logFile = path.join(baseDir, 'run.log');
  const logger = new RunLogger({ filePath: logFile, level });
  logger.info('Run started', { runId, startedAt: formatTimestamp() });
  return logger;
}
