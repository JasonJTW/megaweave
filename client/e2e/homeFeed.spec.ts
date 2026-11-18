import { test, expect } from "./fixtures/base";

// The home feed loads once without a location, then again with it when geolocation
// answers. The second load must update the feed in place: unmounting it for the loading
// spinner remounted every card (a visible flash, and a test holding a card saw it
// detach from the DOM).
test("the home feed stays mounted when the location arrives after the first load", async ({
  page,
}) => {
  // Hold the geolocation answer until the location-less feed has rendered its cards
  await page.addInitScript(() => {
    const geo = navigator.geolocation;
    const real = geo.getCurrentPosition.bind(geo);
    geo.getCurrentPosition = (success, error, options) => {
      const waitForCards = () => {
        if (document.querySelector("#tour-feed [data-index]")) {
          real(success, error, options);
        } else {
          setTimeout(waitForCards, 50);
        }
      };
      waitForCards();
    };
  });
  const located = page.waitForResponse(
    (res) =>
      res.url().includes("/api/posts/feed") && res.url().includes("lat="),
  );

  await page.goto("/");
  const feed = page.locator("#tour-feed");
  await expect(feed.locator("[data-index]").first()).toBeAttached();
  await feed.locator("[data-index]").evaluateAll((cards) => {
    for (const card of cards)
      (card as HTMLElement).dataset.firstRender = "true";
  });

  await located;
  // Cards in both lists are the same elements: the feed was never torn down
  await expect(
    feed.locator('[data-first-render="true"]').first(),
  ).toBeAttached();
});
