// session 的 compare-and-set：只有 key 的值仍然等於 ARGV[1]（讀到的那一版）時才寫入 ARGV[2]。
// key 已被別的請求改過、或已過期消失時不寫入，所以不會蓋掉同時進行的更新，也不會把過期的 key 寫回來。
// ARGV[3]：新的 TTL 秒數；空字串代表沿用原本的 TTL（KEEPTTL，需要 Redis 6+）。
// 回傳 1 = 已寫入，0 = 沒寫入（呼叫端重讀後再試，或放棄）。
export const COMPARE_AND_SET_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
if ARGV[3] == '' then
  redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
else
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
end
return 1
`;
