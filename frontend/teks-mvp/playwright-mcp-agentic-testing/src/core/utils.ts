import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface JsonValue {
  [key: string]: unknown;
}

export function readTextFile(filePath: string): string {
  const resolved = path.resolve(filePath);
  return fs.readFileSync(resolved, 'utf-8');
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function slugify(value: string, fallback = 'run'): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || fallback
  );
}

export function safeJsonParse<T>(input: string): T | undefined {
  try {
    return JSON.parse(input) as T;
  } catch (error) {
    return undefined;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function absoluteUrl(baseUrl: string, maybePath: string): string {
  if (/^https?:/i.test(maybePath)) {
    return maybePath;
  }
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const normalizedPath = maybePath.replace(/^\//, '');
  return `${normalizedBase}/${normalizedPath}`;
}

export function resolveDirname(metaUrl: string): string {
  return path.dirname(fileURLToPath(metaUrl));
}

export function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

export interface PollOptions<T> {
  timeoutMs: number;
  intervalMs?: number;
  onTick?: (result: T | undefined) => void;
}

export async function poll<T>(
  check: () => Promise<T | undefined | boolean>,
  options: PollOptions<T>
): Promise<T | boolean> {
  const interval = options.intervalMs ?? 500;
  const end = Date.now() + options.timeoutMs;
  while (Date.now() <= end) {
    const value = await check();
    if (value) {
      return value;
    }
    options.onTick?.(value as T | undefined);
    await sleep(interval);
  }
  throw new Error('Condition not met before timeout');
}
