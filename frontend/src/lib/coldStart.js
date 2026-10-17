/** Retry only public reads. Never wrap paid AI submissions or other POST requests. */
export async function readAfterColdStart(read, { signal, onAttempt = () => {}, attempts = 6, timeoutMs = 20000, delayMs = 3000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    signal?.throwIfAborted();
    onAttempt(attempt);
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try { return await read(controller.signal); }
    catch (err) {
      signal?.throwIfAborted();
      if (attempt === attempts || !([0, 502, 503, 504].includes(err.status) || err.name === 'AbortError')) throw err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
    await new Promise((resolve, reject) => {
      const cancel = () => { clearTimeout(wait); reject(signal.reason); };
      const wait = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, delayMs);
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) { signal.removeEventListener('abort', cancel); cancel(); }
    });
  }
}
