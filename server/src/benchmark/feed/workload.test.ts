import { createRandom } from "../fixture/random";
import {
  createVirtualUserScript,
  FeedPersona,
  FeedRequest,
  personaKindFor,
} from "./workload";

const catalog = { categoryIds: [1, 2, 3] };
const taipei = { lat: 25.033, lng: 121.565 };

function takeRequests(persona: FeedPersona, count: number, seed = 1): FeedRequest[] {
  const next = createVirtualUserScript(persona, catalog, createRandom(seed));
  return Array.from({ length: count }, () => next());
}

describe("feed workload", () => {
  it("assigns returning, cold-start, and anonymous users at a documented 5:2:3 ratio", () => {
    const kinds = Array.from({ length: 20 }, (_, index) => personaKindFor(index));
    const count = (kind: string) => kinds.filter((k) => k === kind).length;

    expect([count("returning"), count("cold-start"), count("anonymous")]).toEqual([10, 4, 6]);
    // 5 個虛擬使用者也涵蓋三種身分
    expect(new Set(kinds.slice(0, 5))).toEqual(new Set(["returning", "cold-start", "anonymous"]));
  });

  it("replays the same request sequence for the same seed", () => {
    const persona: FeedPersona = { kind: "returning", sessionId: "s1", coordinates: taipei };

    expect(takeRequests(persona, 50, 7)).toEqual(takeRequests(persona, 50, 7));
    expect(takeRequests(persona, 50, 7)).not.toEqual(takeRequests(persona, 50, 8));
  });

  it("sends the same query parameters as the browser home feed and tinder deck", () => {
    const requests = takeRequests({ kind: "returning", sessionId: "s1", coordinates: taipei }, 300);

    const home = requests.find((r) => r.requestClass === "home-personalized")!;
    expect(home.query).toMatchObject({ limit: "12", lat: "25.033", lng: "121.565" });
    expect(home.sessionId).toBe("s1");

    const tinder = requests.find((r) => r.requestClass === "tinder")!;
    expect(tinder.query).toMatchObject({ mode: "tinder", limit: "50", lat: "25.033" });

    const category = requests.find((r) => r.requestClass === "filter-category")!;
    expect(catalog.categoryIds.map(String)).toContain(category.query.category_id);

    const type = requests.find((r) => r.requestClass === "filter-type")!;
    expect(["share", "wish"]).toContain(type.query.type);
  });

  it("scrolls deeper pages of the same view before starting a new one", () => {
    const requests = takeRequests({ kind: "returning", sessionId: "s1", coordinates: taipei }, 300);

    for (let i = 1; i < requests.length; i++) {
      const page = Number(requests[i].query.page);
      if (page > 1) {
        expect(Number(requests[i - 1].query.page)).toBe(page - 1);
        expect({ ...requests[i].query, page: "" }).toEqual({ ...requests[i - 1].query, page: "" });
      }
    }
    expect(requests.some((r) => r.query.page === "3")).toBe(true);
    expect(requests.every((r) => Number(r.query.page) <= 5)).toBe(true);
  });

  it("sends anonymous browsing without location to the trending feed and never to tinder", () => {
    const requests = takeRequests({ kind: "anonymous" }, 300);

    expect(requests.every((r) => r.sessionId === undefined)).toBe(true);
    expect(requests.some((r) => r.requestClass === "home-trending")).toBe(true);
    expect(requests.some((r) => r.requestClass === "tinder")).toBe(false);
    expect(requests.every((r) => r.query.lat === undefined)).toBe(true);
  });

  it("labels logged-in users without an interest vector by the geo fallback they exercise", () => {
    const requests = takeRequests({ kind: "cold-start", sessionId: "s2", coordinates: taipei }, 100);

    expect(requests.some((r) => r.requestClass === "home-geo")).toBe(true);
    expect(requests.some((r) => r.requestClass === "home-personalized")).toBe(false);
  });
});
