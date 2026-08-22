import { generatePostText, PostTextRendered } from "./generatePostText";

describe("generatePostText", () => {
  it("generates a complete natural-language text when all fields are provided", () => {
    const post: PostTextRendered = {
      title: "Used Biology Textbook",
      content: "Almost-new General Biology with answer book.",
      type: "share",
      category_name: "Books",
      condition_name: "Like New",
      tags: "textbook, biology, university",
      items: [
        { title: "General Biology", quantity: 2 },
        { title: "Answer Book", quantity: 1 },
      ],
      city: "Da'an District",
      province: "Taipei",
    };

    const result = generatePostText(post);

    expect(result).toBe(
      `[Share][Books] Used Biology Textbook (Like New)
Description: Almost-new General Biology with answer book.
Tags: textbook, biology, university
Items: General Biology x2, Answer Book x1
Location: Da'an District, Taipei`,
    );
  });

  it("handles missing optional fields cleanly without redundant labels or blank lines", () => {
    const post: PostTextRendered = {
      title: "Wooden Dining Table",
      content: "",
      type: "wish",
    };

    const result = generatePostText(post);

    expect(result).toBe("[Wish] Wooden Dining Table");
  });

  it("formats location correctly when only city or only province is provided", () => {
    const postWithCity: PostTextRendered = {
      title: "Coffee Mug",
      content: "",
      type: "commons",
      city: "Taipei City",
    };
    expect(generatePostText(postWithCity)).toContain("Location: Taipei City");

    const postWithProvince: PostTextRendered = {
      title: "Coffee Mug",
      content: "",
      type: "commons",
      province: "Taiwan",
    };
    expect(generatePostText(postWithProvince)).toContain("Location: Taiwan");
  });
});
