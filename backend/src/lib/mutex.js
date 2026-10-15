/** Minimal FIFO async mutex. Serializes critical sections such as nonce allocation. */
export class Mutex {
  #tail = Promise.resolve();

  async run(fn) {
    let release;
    const next = new Promise((resolve) => (release = resolve));
    const previous = this.#tail;
    this.#tail = previous.then(() => next);
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
