// jest.mock("./session") 用的替身：測試照舊用 getUserFromCookie 控制「誰登入了」，
// auth middleware 呼叫的 authenticateRequest 直接轉給它，不碰 Redis 和 cookie 續期。
// session 生命週期本身由 sessionLifecycle.test.ts 對真的 session.ts 測。
//
//   jest.mock("./session", () => jest.requireActual("./testUtils/mockSessionModule").mockSessionModule());
export function mockSessionModule() {
  const getUserFromCookie = jest.fn();
  return {
    getUserFromCookie,
    authenticateRequest: (req: unknown) => getUserFromCookie(req),
    updateUserSession: jest.fn(),
    RedisConnectionError: class RedisConnectionError extends Error {},
  };
}
