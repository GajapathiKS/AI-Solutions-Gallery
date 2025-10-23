// src/core/utils.ts
export async function poll<T>(
  fn: () => Promise<boolean>,
  opts: { timeoutMs: number; intervalMs: number }
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < opts.timeoutMs) {
    try {
      const ok = await fn();
      if (ok) return;
    } catch {
      // ignore iteration error
    }
    await new Promise(r => setTimeout(r, opts.intervalMs));
  }
  throw new Error(`Timeout after ${opts.timeoutMs}ms`);
}
