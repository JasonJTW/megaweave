// In-memory stand-in for the cache Redis client, covering the commands
// session.ts uses. Keys expire against Date.now(), so a test that moves the
// clock (jest.spyOn(Date, "now")) sees Redis drop keys the way a real server
// would. `down = true` makes every command reject, like a lost connection.

type Entry = { value: string | Set<string>; expiresAt: number | null };

export class FakeSessionRedis {
  isOpen = true;
  isReady = true;
  down = false;
  private store = new Map<string, Entry>();

  private check() {
    if (this.down) throw new Error("Redis connection lost");
  }

  private entry(key: string): Entry | undefined {
    const e = this.store.get(key);
    if (e && e.expiresAt !== null && e.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return e;
  }

  private setFromSeconds(seconds: number) {
    return Date.now() + seconds * 1000;
  }

  /** Test helper: is the key still alive (not expired, not deleted)? */
  has(key: string) {
    return this.entry(key) !== undefined;
  }

  /** Test helper: keys matching a prefix, for assertions only. */
  keys(prefix: string) {
    return [...this.store.keys()].filter((k) => k.startsWith(prefix) && this.has(k));
  }

  async get(key: string): Promise<string | null> {
    this.check();
    const e = this.entry(key);
    if (!e) return null;
    if (typeof e.value !== "string") throw new Error("WRONGTYPE");
    return e.value;
  }

  async setEx(key: string, seconds: number, value: string) {
    this.check();
    this.store.set(key, { value, expiresAt: this.setFromSeconds(seconds) });
    return "OK";
  }

  async set(key: string, value: string, options?: { KEEPTTL?: boolean; EX?: number }) {
    this.check();
    const prev = this.entry(key);
    let expiresAt: number | null = null;
    if (options?.EX !== undefined) expiresAt = this.setFromSeconds(options.EX);
    else if (options?.KEEPTTL) expiresAt = prev?.expiresAt ?? null;
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async del(key: string) {
    this.check();
    const existed = this.entry(key) !== undefined;
    this.store.delete(key);
    return existed ? 1 : 0;
  }

  async ttl(key: string) {
    this.check();
    const e = this.entry(key);
    if (!e) return -2;
    if (e.expiresAt === null) return -1;
    return Math.ceil((e.expiresAt - Date.now()) / 1000);
  }

  async expire(key: string, seconds: number) {
    this.check();
    const e = this.entry(key);
    if (!e) return 0;
    e.expiresAt = this.setFromSeconds(seconds);
    return 1;
  }

  async sAdd(key: string, member: string) {
    this.check();
    const e = this.entry(key);
    if (e && typeof e.value === "string") throw new Error("WRONGTYPE");
    const set = (e?.value as Set<string> | undefined) ?? new Set<string>();
    const added = set.has(member) ? 0 : 1;
    set.add(member);
    this.store.set(key, { value: set, expiresAt: e?.expiresAt ?? null });
    return added;
  }

  async sRem(key: string, member: string) {
    this.check();
    const e = this.entry(key);
    if (!e || typeof e.value === "string") return 0;
    const removed = e.value.delete(member) ? 1 : 0;
    if (e.value.size === 0) this.store.delete(key);
    return removed;
  }

  async sMembers(key: string): Promise<string[]> {
    this.check();
    const e = this.entry(key);
    if (!e) return [];
    if (typeof e.value === "string") throw new Error("WRONGTYPE");
    return [...e.value];
  }
}
