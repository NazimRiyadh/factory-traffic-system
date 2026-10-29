/**
 * JunctionLock — Serializes all state-changing operations per junction.
 *
 * Ensures sensor events, operator commands, controller ACKs/events,
 * and timer callbacks run in strict sequence against consistent state.
 */

class JunctionLockManager {
  constructor() {
    this.queues = new Map();
  }

  /**
   * Run an asynchronous function exclusively for a given junction.
   *
   * @param {string} junctionId
   * @param {function(): Promise<any>} fn
   * @returns {Promise<any>}
   */
  async runExclusive(junctionId, fn) {
    if (!this.queues.has(junctionId)) {
      this.queues.set(junctionId, Promise.resolve());
    }

    const currentChain = this.queues.get(junctionId);
    let release;
    const nextWait = new Promise(resolve => {
      release = resolve;
    });

    // Advance the chain so next caller waits for nextWait to be settled
    this.queues.set(junctionId, currentChain.then(() => nextWait, () => nextWait));

    await currentChain.catch(() => {});
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

const junctionLock = new JunctionLockManager();

export default junctionLock;
export { JunctionLockManager };
