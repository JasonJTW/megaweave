// In-memory stand-in for the cache Redis client, covering the commands
// session.ts uses. Keys expire against Date.now(), so a test that moves the
// clock (jest.spyOn(Date, "now")) sees Redis drop keys the way a real server
// would. `down = true` makes every command reject, like a lost connection.

import { COMPARE_AND_SET_SCRIPT } from "../utils/sessionScripts";

type Entry = { value: string | Set<string>; expiresAt: number | null };

export class FakeSessionRedis {
  isOpen = true;
  isReady = true;
  down = false;
  private store = new Map<string, Entry>();
  private pendingBeforeWrite: (() => Promise<void>) | null = null;

  /**
   * 下一次寫入 session 值之前先跑 fn（只跑一次），用來重現「讀完、還沒寫回」之間
   * 有別的請求改了同一筆 session 的競態。
   */
  beforeNextWrite(fn: () => Promise<void>) {
    this.pendingBeforeWrite = fn;
  }

  private async runBeforeWrite() {
    const fn = this.pendingBeforeWrite;
    this.pendingBeforeWrite = null;
    if (fn) await fn();
  }

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
    await this.runBeforeWrite();
    this.store.set(key, { value, expiresAt: this.setFromSeconds(seconds) });
    return "OK";
  }

  //* 只支援 session.ts 用到的 compare-and-set script，照它的語意在記憶體裡執行
  async eval(script: string, options: { keys: string[]; arguments: string[] }) {
    if (script !== COMPARE_AND_SET_SCRIPT) throw new Error("Unknown script");
    this.check();
    await this.runBeforeWrite();
    const [key] = options.keys;
    const [expected, next, ttlSeconds] = options.arguments;
    const current = this.entry(key);
    if (!current || current.value !== expected) return 0;
    const expiresAt =
      ttlSeconds === "" ? current.expiresAt : this.setFromSeconds(Number(ttlSeconds));
    this.store.set(key, { value: next, expiresAt });
    return 1;
  }

  async del(key: string) {
    this.check();
    const existed = this.entry(key) !== undefined;
    this.store.delete(key);
    return existed ? 1 : 0;
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
