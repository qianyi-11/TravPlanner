import { expect, test, type Locator, type Page } from "@playwright/test";

const TRIP_ID = process.env.DEMO_TRIP_ID ?? "trip-japan";
const configuredPause = Number.parseInt(process.env.DEMO_PAUSE_MS ?? "", 10);
const RECORDING = process.env.DEMO_RECORD === "1";
const startedAt = Date.now();

function tripRoute(suffix = "") {
  return `/trips/${TRIP_ID}${suffix}`;
}

function waitDuration(recordingMs: number) {
  if (Number.isFinite(configuredPause) && configuredPause > 0) return configuredPause;
  return RECORDING ? Math.round(recordingMs * 1.45) : 350;
}

async function pause(page: Page, message: string, recordingMs = 3_500) {
  console.log(`[DEMO +${((Date.now() - startedAt) / 1000).toFixed(1)}s] ${message}`);
  await page.waitForTimeout(waitDuration(recordingMs));
}

async function pointAt(page: Page, locator: Locator, recordingMs = 1_000) {
  await locator.scrollIntoViewIfNeeded();
  await locator.hover();
  await page.waitForTimeout(waitDuration(recordingMs));
}

async function openChapter(page: Page, suffix: string, title: string, recordingMs = 3_500) {
  const response = await page.goto(tripRoute(suffix), { waitUntil: "domcontentloaded" });
  if (response && !response.ok()) throw new Error(`${title} failed to load: HTTP ${response.status()}`);
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
  await pause(page, title, recordingMs);
}

test("Trippy product walkthrough", async ({ page }) => {
  await openChapter(page, "", "Trip Setup — Japan Adventure", 3_500);
  await expect(page.getByText("Japan Adventure", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Tokyo · Kyoto · Osaka", { exact: true })).toBeVisible();

  await openChapter(page, "/preferences", "Preferences — every traveller has a different brief", 4_000);
  await expect(page.getByRole("heading", { name: "Your preferences" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Group preferences" })).toBeVisible();
  await pointAt(page, page.getByText("Personal budget", { exact: true }));

  await openChapter(page, "/vote", "Voting — the group narrows the options", 3_000);
  await expect(page.getByRole("heading", { name: "Where should we go?" })).toBeVisible();
  await expect(page.getByText(/votes used/)).toBeVisible();
  await pointAt(page, page.getByRole("button", { name: "Voted", exact: true }).first());

  await openChapter(page, "/vote/results", "Group Consensus — fairness at capacity 10", 1_000);
  const capacity = page.getByTestId("shortlist-capacity");
  const tradeoff = page.getByTestId("consensus-tradeoff");
  await capacity.fill("10");
  await expect(tradeoff).toBeVisible();
  await pointAt(page, tradeoff, 800);
  await pause(page, "Consensus trade-off at capacity 10", 5_000);
  await capacity.fill("11");
  await expect(tradeoff).toHaveCount(0);
  await pause(page, "Capacity 11 removes the trade-off", 2_500);
  await capacity.fill("10");
  await expect(tradeoff).toBeVisible();
  const confirmShortlist = page.getByTestId("confirm-shortlist");
  await pointAt(page, confirmShortlist, 800);
  await confirmShortlist.click();
  await expect(page).toHaveURL(new RegExp(`/trips/${TRIP_ID}/shortlist/?$`));

  await openChapter(page, "/itinerary", "Itinerary — the day-by-day plan", 3_500);
  await expect(page.getByRole("heading", { name: "Day-by-day itinerary" })).toBeVisible();
  await expect(page.getByText("teamLab Borderless", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Day 3.*teamLab & Skytree/i }).click();
  await expect(page.getByText("teamLab Borderless", { exact: true })).toBeVisible();
  await pointAt(page, page.getByText("teamLab Borderless", { exact: true }));

  await openChapter(page, "/plan", "Plan B — prepare a saved backup", 2_000);
  await page.getByRole("button", { name: /Day 3.*teamLab & Skytree/i }).click();
  const planBOpen = page.getByTestId("plan-b-open-d3-a2");
  await expect(planBOpen).toBeVisible();
  await planBOpen.click();
  const planBPicker = page.getByTestId("plan-b-picker");
  await expect(planBPicker).toBeVisible();
  await planBPicker.selectOption("jp-tmg-building");
  const planBSave = page.getByTestId("plan-b-save");
  await expect(planBSave).toBeEnabled();
  await planBSave.click();
  const planBSummary = page.getByTestId("plan-b-summary-d3-a2");
  await expect(planBSummary).toContainText("Tokyo Metropolitan Government Building");
  await pause(page, "Saved Plan B: Tokyo Metropolitan Government Building", 4_000);

  const checklist = page.getByTestId("checklist-card");
  await expect(checklist).toBeVisible();
  const hotelTask = page.getByTestId("checklist-item-checklist-japan-hotel");
  await pointAt(page, hotelTask, 700);
  const hotelToggle = page.getByTestId("checklist-toggle-checklist-japan-hotel");
  await hotelToggle.click();
  await expect(hotelToggle).toBeChecked();
  await pause(page, "Shared Checklist — Confirm Kyoto hotel is complete", 3_000);

  await openChapter(page, "/split-bill", "Split Bill — one shared expense, clearly divided", 2_000);
  const splitBill = page.getByTestId("split-bill-card");
  await expect(splitBill).toBeVisible();
  await expect(splitBill.locator('input[placeholder="Item name"]').first()).toHaveValue("Izakaya dinner");
  await expect(splitBill).toContainText("RM 240.00");
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(page.getByTestId("split-bill-breakdown")).toBeVisible();
  await expect(page.getByTestId("split-bill-save-status")).toHaveText("Saved");
  await pointAt(page, page.getByTestId("split-bill-breakdown"));
  await pause(page, "Split Bill breakdown and saved state", 4_000);

  await openChapter(page, "/live", "Trip Rescue — use the saved Plan B", 2_000);
  await expect(page.getByText("Trip Rescue", { exact: true })).toBeVisible();
  await expect(page.getByTestId("rescue-plan-b")).toContainText("Your saved Plan B");
  await expect(page.getByText("Tokyo Metropolitan Government Building", { exact: true })).toBeVisible();
  await pointAt(page, page.getByTestId("rescue-plan-b"), 1_000);
  const acceptRescue = page.getByTestId("accept-rescue");
  await acceptRescue.click();
  await expect(page.getByText("You accepted the new activity. Trip itinerary updated for everyone.")).toBeVisible();
  await pause(page, "Trip Rescue accepted", 3_500);

  await openChapter(page, "/itinerary", "Updated Plan — replacement accepted for everyone", 1_500);
  await page.getByRole("button", { name: /Day 3.*teamLab & Skytree/i }).click();
  await expect(page.getByText("Tokyo Metropolitan Government Building", { exact: true })).toBeVisible();
  await expect(page.getByText("teamLab Borderless", { exact: true })).toHaveCount(0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Day 3.*teamLab & Skytree/i }).click();
  await expect(page.getByText("Tokyo Metropolitan Government Building", { exact: true })).toBeVisible();
  await expect(page.getByText("teamLab Borderless", { exact: true })).toHaveCount(0);
  await pause(page, "Replacement persists after refresh", 2_500);

  await openChapter(page, "/plan", "Final Plan — ready to travel", 3_000);
  await expect(page.getByText("Shared checklist", { exact: true })).toBeVisible();
  await expect(page.getByTestId("checklist-toggle-checklist-japan-hotel")).toBeChecked();
  await pointAt(page, page.getByText("Shared checklist", { exact: true }), 1_000);
  await pause(page, "Final active plan", 5_000);
  console.log("[DEMO] Recording flow completed successfully");
});
