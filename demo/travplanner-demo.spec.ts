import { expect, test, type Locator, type Page } from "@playwright/test";

const TRIP_ID = process.env.DEMO_TRIP_ID ?? "trip-japan";
const parsedPause = Number.parseInt(process.env.DEMO_PAUSE_MS ?? "", 10);
const DEFAULT_PAUSE_MS = Number.isFinite(parsedPause) && parsedPause > 0 ? parsedPause : 3_500;

function tripRoute(suffix = "") {
  return `/trips/${TRIP_ID}${suffix}`;
}

async function pause(page: Page, message: string, duration = DEFAULT_PAUSE_MS) {
  console.log(`[DEMO] ${message}`);
  await page.waitForTimeout(duration);
}

async function pointAt(page: Page, locator: Locator, duration = 1_500) {
  await locator.scrollIntoViewIfNeeded();
  await locator.hover();
  await page.waitForTimeout(duration);
}

async function openChapter(page: Page, suffix: string, title: string, duration = DEFAULT_PAUSE_MS) {
  console.log(`\n[DEMO] ${title}`);
  const response = await page.goto(tripRoute(suffix), { waitUntil: "domcontentloaded" });
  if (response && !response.ok()) throw new Error(`${title} failed to load: HTTP ${response.status()}`);
  const heading = page.locator("h1").first();
  await expect(heading).toBeVisible({ timeout: 30_000 });
  await pointAt(page, heading, 300);
  await pause(page, title, duration);
}

test("TravPlanner CodeNection MVP demo", async ({ page }) => {
  await openChapter(page, "", "1. Japan Adventure — group trip overview", 4_500);
  await expect(page.locator("body")).toContainText("Japan Adventure");

  await openChapter(page, "/preferences", "2. Individual traveller preferences", 4_500);
  await openChapter(page, "/places", "3. Candidate places and group suggestions", 4_500);

  await openChapter(page, "/vote", "4. Positive group voting", 2_000);
  await expect(page.getByRole("heading", { name: "Where should we go?" })).toBeVisible();
  const existingVote = page.getByRole("button", { name: "Voted", exact: true }).first();
  if (await existingVote.isVisible()) await pointAt(page, existingVote, 2_500);
  await pause(page, "Each member supports a limited number of candidate places", 2_500);

  await openChapter(page, "/vote/results", "5. Deterministic Group Consensus", 1_500);
  const capacitySlider = page.getByTestId("shortlist-capacity");
  const tradeoffCard = page.getByTestId("consensus-tradeoff");
  await capacitySlider.fill("10");
  await expect(tradeoffCard).toBeVisible();
  await pointAt(page, tradeoffCard, 1_000);
  await pause(page, "Capacity 10 — explain the fairness trade-off", 5_500);

  await capacitySlider.fill("11");
  await expect(tradeoffCard).toHaveCount(0);
  await pause(page, "Capacity 11 — enough room, so no fairness trade-off is required", 4_000);
  await capacitySlider.fill("10");
  await expect(tradeoffCard).toBeVisible();
  await pause(page, "Return shortlist capacity to 10", 1_500);

  const confirmShortlist = page.getByTestId("confirm-shortlist");
  await pointAt(page, confirmShortlist, 1_200);
  await confirmShortlist.click();
  await expect(page).toHaveURL(new RegExp(`/trips/${TRIP_ID}/shortlist/?$`));
  await pause(page, "7. Confirmed fair shortlist", 3_500);

  await openChapter(page, "/validate", "8. Place information review", 4_000);
  await openChapter(page, "/route", "9. Planned route sequence and map", 4_500);
  await openChapter(page, "/itinerary", "10. Day-by-day itinerary", 4_500);
  await openChapter(page, "/plan", "11. Final shared trip plan", 5_000);

  await openChapter(page, "/live", "12. Trip Rescue — unsuitable planned activity", 1_200);
  await expect(page.getByText("Trip Rescue", { exact: true })).toBeVisible();
  await expect(page.getByText("Recommended Alternative", { exact: true })).toBeVisible({ timeout: 8_000 });
  await pause(page, "Compare original and replacement Group Match", 5_000);

  const acceptRescue = page.getByTestId("accept-rescue");
  await pointAt(page, acceptRescue, 2_000);
  await acceptRescue.click();
  await expect(page.getByText("You accepted the new activity. Trip itinerary updated for everyone.")).toBeVisible();
  await pause(page, "Trip Rescue accepted", 4_000);

  await openChapter(page, "/itinerary", "13. Verify the updated itinerary", 1_200);
  await page.getByRole("button", { name: /Day 3/i }).click();
  const replacement = page.getByText("Tokyo Metropolitan Government Building", { exact: true }).first();
  const original = page.getByText("teamLab Borderless", { exact: true });
  await expect(replacement).toBeVisible();
  await expect(original).toHaveCount(0);
  await pause(page, "Day 3 now contains the replacement activity", 4_500);

  console.log("[DEMO] Refreshing page to prove persistence");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Day 3/i }).click();
  await expect(replacement).toBeVisible();
  await expect(original).toHaveCount(0);
  await pause(page, "14. Rescue survives refresh", 4_500);

  await openChapter(page, "/plan", "15. TravPlanner — final active plan", 6_000);
  console.log("[DEMO] MVP demo completed successfully");
});
