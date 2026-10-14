/**
 * Rate limiter with a pluggable backend.
 *
 * The default implementation is an in-memory sliding-window counter.
 * To switch to Redis (or any other store) implement `RateLimitStore` and
 * pass it to the constructor.
 */

// ── Public interface ─────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export interface RateLimitStore {
  /**
   * Increment hit count for `key` within the current window.
   * Returns the number of hits so far (inclusive of this call).
   */
  increment(key: string, windowMs: number): Promise<{ hits: number; resetMs: number }>;
}

// ── In-memory implementation ─────────────────────────────────────────

interface WindowEntry {
  hits: number;
  expiresAt: number;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private windows = new Map<string, WindowEntry>();
  private gcTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Periodic garbage collection of expired windows (every 60 s)
    this.gcTimer = setInterval(() => this.gc(), 60_000);
    // Allow the Node process to exit even if the timer is active
    if (this.gcTimer && typeof this.gcTimer === 'object' && 'unref' in this.gcTimer) {
      this.gcTimer.unref();
    }
  }

  async increment(key: string, windowMs: number): Promise<{ hits: number; resetMs: number }> {
    const now = Date.now();
    const entry = this.windows.get(key);

    if (!entry || now >= entry.expiresAt) {
      // Start a new window
      const newEntry: WindowEntry = { hits: 1, expiresAt: now + windowMs };
      this.windows.set(key, newEntry);
      return { hits: 1, resetMs: windowMs };
    }

    entry.hits += 1;
    return { hits: entry.hits, resetMs: entry.expiresAt - now };
  }

  /** Remove expired entries to bound memory usage. */
  private gc(): void {
    const now = Date.now();
    for (const [key, entry] of this.windows) {
      if (now >= entry.expiresAt) {
        this.windows.delete(key);
      }
    }
  }

  /** Exposed for testing — force-clear all state. */
  reset(): void {
    this.windows.clear();
  }

  destroy(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
    this.windows.clear();
  }
}

// ── Rate limiter ─────────────────────────────────────────────────────

export class RateLimiter {
  private store: RateLimitStore;

  constructor(store?: RateLimitStore) {
    this.store = store ?? new InMemoryRateLimitStore();
  }

  /**
   * Check whether a request identified by `key` is within the allowed
   * rate.  Call this at the top of your route handler.
   *
   * @param key       Unique identifier (e.g. userId, IP, userId+route)
   * @param limit     Maximum number of requests per window
   * @param windowMs  Window duration in milliseconds
   */
  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const { hits, resetMs } = await this.store.increment(key, windowMs);
    return {
      allowed: hits <= limit,
      remaining: Math.max(0, limit - hits),
      resetMs,
    };
  }
}

// ── Singleton for app-wide use ───────────────────────────────────────

let _globalLimiter: RateLimiter | null = null;

export function getGlobalRateLimiter(): RateLimiter {
  if (!_globalLimiter) {
    _globalLimiter = new RateLimiter();
  }
  return _globalLimiter;
}

// ── Defaults per route category ──────────────────────────────────────

/** Upload: 10 requests per 60 s per user */
export const UPLOAD_LIMIT = { limit: 10, windowMs: 60_000 };

/** Process / re-process: 10 requests per 60 s per user */
export const PROCESS_LIMIT = { limit: 10, windowMs: 60_000 };

/** AI-intensive routes (summarize, explain, compare): 5 per 60 s */
export const AI_ROUTE_LIMIT = { limit: 5, windowMs: 60_000 };
