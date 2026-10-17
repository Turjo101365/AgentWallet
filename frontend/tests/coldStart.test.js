import { describe, it, expect, vi } from 'vitest';
import { readAfterColdStart } from '../src/lib/coldStart.js';

describe('free-backend public read recovery (no paid requests)', () => {
  it('recovers from cold-start HTML/proxy failures and reports bounded attempts', async () => {
    const attempts = [];
    const read = vi.fn().mockRejectedValueOnce({ status: 503 }).mockRejectedValueOnce({ status: 0 }).mockResolvedValue({ historical: true });
    expect(await readAfterColdStart(read, { delayMs: 0, onAttempt: (n) => attempts.push(n) })).toEqual({ historical: true });
    expect(attempts).toEqual([1, 2, 3]);
  });
  it('stops after its bounded retry count and never retries a quota/auth/validation failure', async () => {
    const unavailable = vi.fn().mockRejectedValue({ status: 503 });
    await expect(readAfterColdStart(unavailable, { delayMs: 0, attempts: 2 })).rejects.toEqual({ status: 503 });
    expect(unavailable).toHaveBeenCalledTimes(2);
    for (const status of [400, 401, 403, 429]) {
      const read = vi.fn().mockRejectedValue({ status });
      await expect(readAfterColdStart(read, { delayMs: 0 })).rejects.toEqual({ status });
      expect(read).toHaveBeenCalledTimes(1);
    }
  });
  it('aborts during retry delay when the page unmounts', async () => {
    const c = new AbortController();
    const read = vi.fn().mockRejectedValue({ status: 0 });
    const pending = readAfterColdStart(read, { signal: c.signal, delayMs: 10000 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    c.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(read).toHaveBeenCalledTimes(1);
  });
});
