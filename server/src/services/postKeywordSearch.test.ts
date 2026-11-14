import { buildPostKeywordSearchCondition } from "./postKeywordSearch";

const MATCH = "MATCH(p.title, p.content, p.tags) AGAINST(? IN BOOLEAN MODE)";
const LIKE = "(p.title LIKE ? OR p.content LIKE ? OR p.tags LIKE ?)";

describe("buildPostKeywordSearchCondition", () => {
  it("returns null for an empty or blank query", () => {
    expect(buildPostKeywordSearchCondition("")).toBeNull();
    expect(buildPostKeywordSearchCondition("   ")).toBeNull();
  });

  it("uses the ngram index as a required phrase for a term of two or more characters", () => {
    expect(buildPostKeywordSearchCondition(" 沙發椅 ")).toEqual({
      sql: `(${MATCH})`,
      params: ['+"沙發椅"'],
    });
  });

  it("requires every whitespace-separated term in one MATCH", () => {
    expect(buildPostKeywordSearchCondition("IKEA  沙發")).toEqual({
      sql: `(${MATCH})`,
      params: ['+"IKEA" +"沙發"'],
    });
  });

  it("falls back to LIKE for a one-character term, which ngram cannot find", () => {
    expect(buildPostKeywordSearchCondition("椅")).toEqual({
      sql: `(${LIKE})`,
      params: ["%椅%", "%椅%", "%椅%"],
    });
  });

  it("falls back to LIKE for a term with punctuation, so no boolean operator reaches MATCH", () => {
    expect(buildPostKeywordSearchCondition('iPhone-15 "x')).toEqual({
      sql: `(${LIKE} AND ${LIKE})`,
      params: ["%iPhone-15%", "%iPhone-15%", "%iPhone-15%", '%"x%', '%"x%', '%"x%'],
    });
  });

  it("combines MATCH and LIKE terms with AND", () => {
    expect(buildPostKeywordSearchCondition("書桌 椅")).toEqual({
      sql: `(${MATCH} AND ${LIKE})`,
      params: ['+"書桌"', "%椅%", "%椅%", "%椅%"],
    });
  });

  it("escapes LIKE wildcards in a fallback term", () => {
    expect(buildPostKeywordSearchCondition("100%_\\")?.params[0]).toBe("%100\\%\\_\\\\%");
  });
});
