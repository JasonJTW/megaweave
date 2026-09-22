// server/src/benchmark/fixture/random.ts
// 可重現的亂數產生器：同一個 seed 永遠產生同一串數字，確保 fixture 在不同機器、不同 commit 間完全一致。

export interface Random {
  /** [0, 1) 的均勻分佈 */
  next(): number;
  /** [min, max] 的整數 */
  int(min: number, max: number): number;
  /** 以機率 p 回傳 true */
  chance(p: number): boolean;
  pick<T>(values: readonly T[]): T;
  weighted<T>(entries: readonly (readonly [T, number])[]): T;
  /** 標準常態分佈 (Box-Muller) */
  gaussian(): number;
}

/** 由字串或數字衍生 32-bit seed (FNV-1a)，讓每個實體可以擁有獨立且穩定的亂數序列。 */
export function deriveSeed(...parts: (string | number)[]): number {
  let hash = 0x811c9dc5;
  for (const char of parts.join(":")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32：快速、分佈良好且完全確定性的 32-bit PRNG。 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (values) => values[Math.floor(next() * values.length)],
    weighted: (entries) => {
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      let threshold = next() * total;
      for (const [value, weight] of entries) {
        threshold -= weight;
        if (threshold < 0) return value;
      }
      return entries[entries.length - 1][0];
    },
    gaussian: () => {
      const u = 1 - next();
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
}

/** 以 PRNG 產生符合 UUID v4 格式的穩定識別碼。 */
export function deterministicUuid(random: Random): string {
  const hex = Array.from({ length: 32 }, () =>
    Math.floor(random.next() * 16).toString(16),
  );
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
