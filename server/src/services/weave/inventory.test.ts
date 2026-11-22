import { isWholePostRequest } from "./inventory";

//* inventory.ts 會 import utils/db；這個純函式的測試不連資料庫
jest.mock("../../utils/db", () => ({}));

describe("isWholePostRequest", () => {
  const chair = { id: 123, quantity: 5 };
  const desk = { id: 124, quantity: 2 };

  it("counts a weave with no specific item as the whole post", () => {
    expect(isWholePostRequest([], [chair])).toBe(true);
    expect(isWholePostRequest([{ itemId: null, quantity: 1 }], [chair])).toBe(true);
  });

  it("does not count part of the only item as the whole post", () => {
    expect(isWholePostRequest([{ itemId: 123, quantity: 2 }], [chair])).toBe(false);
  });

  it("counts every unit of the only item as the whole post", () => {
    expect(isWholePostRequest([{ itemId: 123, quantity: 5 }], [chair])).toBe(true);
  });

  it("needs every item at full quantity when the post has several", () => {
    expect(
      isWholePostRequest(
        [
          { itemId: 123, quantity: 5 },
          { itemId: 124, quantity: 1 },
        ],
        [chair, desk],
      ),
    ).toBe(false);
    expect(
      isWholePostRequest(
        [
          { itemId: 123, quantity: 5 },
          { itemId: 124, quantity: 2 },
        ],
        [chair, desk],
      ),
    ).toBe(true);
    expect(isWholePostRequest([{ itemId: 123, quantity: 5 }], [chair, desk])).toBe(false);
  });
});
