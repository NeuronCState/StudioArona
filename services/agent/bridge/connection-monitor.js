/**
 * Connection Monitor — continuously check MiniMax API reachability.
 *
 * Logic:
 *   - Ping https://api.minimaxi.com every 10s
 *   - Success → immediately switch to online
 *   - Failure → immediately switch to offline
 *   - No debounce, no delay threshold
 *
 * Usage:
 *   const monitor = new ConnectionMonitor();
 *   monitor.onChange((state) => { ... });
 *   monitor.start();
 */

const MINIMAX_URL = "https://api.minimaxi.com/v1/chat/completions";

export class ConnectionMonitor {
  #state = "unknown";
  #timer = null;
  #listeners = [];
  #interval = 10_000; // 10s

  get state() {
    return this.#state;
  }

  onChange(fn) {
    this.#listeners.push(fn);
    return () => {
      this.#listeners = this.#listeners.filter((f) => f !== fn);
    };
  }

  async check() {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(MINIMAX_URL, {
        method: "HEAD",
        signal: ctrl.signal,
      });
      clearTimeout(t);

      if (res.ok || res.status === 401 || res.status === 403) {
        // 401/403 = API is reachable, just auth issue
        this.#setState("online");
      } else {
        this.#setState("offline");
      }
    } catch {
      this.#setState("offline");
    }
  }

  #setState(newState) {
    if (this.#state !== newState) {
      const prev = this.#state;
      this.#state = newState;
      console.log(`[connection] ${prev} → ${newState}`);
      for (const fn of this.#listeners) {
        fn(newState);
      }
    }
  }

  start() {
    this.check();
    this.#timer = setInterval(() => this.check(), this.#interval);
  }

  stop() {
    clearInterval(this.#timer);
    this.#timer = null;
  }
}
