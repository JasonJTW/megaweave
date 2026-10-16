import { classifyLalamoveHttpStatus } from "./lalamoveErrors";

describe("classifyLalamoveHttpStatus", () => {
  it.each([400, 401, 402, 404, 409, 422, 429])(
    "HTTP %s → REJECTED (Lalamove definitely did not create the order)",
    (status) => expect(classifyLalamoveHttpStatus(status)).toBe("REJECTED"),
  );

  it.each([undefined, 0, 408, 500, 502, 503])(
    "HTTP %s → UNKNOWN (order may exist; never refund on this alone)",
    (status) => expect(classifyLalamoveHttpStatus(status)).toBe("UNKNOWN"),
  );
});
