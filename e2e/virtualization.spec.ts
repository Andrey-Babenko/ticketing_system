import { test, expect } from "@playwright/test";
import { unique, mailpitVerifyLink, dragCardToColumn } from "./helpers";

// §8/§14, ADR-16: large boards must stay usable — verified here at 300 tickets in one
// column (the 1,000-ticket smoothness bar is checked manually, see README). The
// discriminating assertion is the bounded-DOM one below; it fails today because every
// card renders unconditionally (Column.tsx maps the full array with no windowing).
const TICKET_COUNT = 300;
const MAX_RENDERED_CARDS = 60; // generous — a real window is ~15-25 rows at this viewport

test("large boards render a bounded window of cards (§8, §14, ADR-16)", async ({ page }) => {
  const email = `${unique("e2e-virt")}@example.com`;
  const password = "password123";

  await page.request.post("/api/auth/signup", { data: { email, password } });
  const link = await mailpitVerifyLink(email);
  const token = new URL(link).searchParams.get("token");
  await page.request.post("/api/auth/verify", { data: { token } });
  await page.request.post("/api/auth/login", { data: { email, password } });

  const team = await (
    await page.request.post("/api/teams", { data: { name: unique("Virt Team") } })
  ).json();

  const titlePrefix = unique("Virt Ticket");
  const tickets: { id: number }[] = [];
  for (let i = 0; i < TICKET_COUNT; i++) {
    const res = await page.request.post("/api/tickets", {
      data: { teamId: team.id, type: "bug", state: "new", title: `${titlePrefix} ${i}`, body: "b" },
    });
    tickets.push(await res.json());
  }

  await page.goto(`/board/${team.id}`);
  const column = page.getByTestId("column-new");

  await test.step("column count and filter total reflect the FULL set, not the rendered window", async () => {
    await expect(column.getByText(String(TICKET_COUNT))).toBeVisible();
    await expect(page.getByText(`${TICKET_COUNT} tickets`)).toBeVisible();
  });

  await test.step("DOM stays bounded — not all 300 cards are mounted at once", async () => {
    const renderedCount = await column.locator('[data-testid^="card-"]').count();
    expect(renderedCount).toBeGreaterThan(0);
    expect(renderedCount).toBeLessThanOrEqual(MAX_RENDERED_CARDS);
  });

  await test.step("scrolling the column reveals the oldest card (bottom of modifiedAt-desc)", async () => {
    const oldestTitle = `${titlePrefix} 0`;
    await expect(column.getByText(oldestTitle)).not.toBeVisible();
    await page.getByTestId("column-scroll-new").evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await expect(column.getByText(oldestTitle)).toBeVisible();
  });

  await test.step("a card in the initial render window still drags between columns", async () => {
    // The previous step scrolled to the bottom — scroll back so the most-recently-created
    // ticket (sorts to the top, modifiedAt desc) is inside the render window again.
    await page.getByTestId("column-scroll-new").evaluate((el) => el.scrollTo({ top: 0 }));
    const newestTicket = tickets[tickets.length - 1];
    await dragCardToColumn(page, `card-${newestTicket.id}`, "in_progress");
    await expect(
      page.getByTestId("column-in_progress").getByText(`${titlePrefix} ${TICKET_COUNT - 1}`)
    ).toBeVisible();
  });
});
