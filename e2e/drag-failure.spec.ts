import { test, expect } from "@playwright/test";
import { unique, mailpitVerifyLink, dragCardToColumn } from "./helpers";

// §8: "If a drag-and-drop update fails, the card must return to its previous column and
// the UI must display an error." Setup goes through the real API via page.request (which
// shares the browser context's cookie jar with `page`) so the test spends its time on the
// one thing it actually verifies — the failure/revert behavior — not re-driving forms
// already covered by happy.spec.ts.
test("a failed drag reverts the card and shows an error (§8, ADR-10)", async ({ page }) => {
  const email = `${unique("e2e-fail")}@example.com`;
  const password = "password123";

  await page.request.post("/api/auth/signup", { data: { email, password } });
  const link = await mailpitVerifyLink(email);
  const token = new URL(link).searchParams.get("token");
  await page.request.post("/api/auth/verify", { data: { token } });
  await page.request.post("/api/auth/login", { data: { email, password } });

  const team = await (
    await page.request.post("/api/teams", { data: { name: unique("Fail Team") } })
  ).json();
  const ticketTitle = unique("Fail Ticket");
  const ticket = await (
    await page.request.post("/api/tickets", {
      data: { teamId: team.id, type: "bug", state: "new", title: ticketTitle, body: "b" },
    })
  ).json();

  await page.goto(`/board/${team.id}`);
  await expect(page.getByTestId("column-new").getByText(ticketTitle)).toBeVisible();

  await test.step("PATCH fails → card returns to its column + error shown", async () => {
    await page.route("**/api/tickets/*", (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "INTERNAL", message: "Internal server error" } }),
      });
    });

    await dragCardToColumn(page, `card-${ticket.id}`, "in_progress");

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByTestId("column-new").getByText(ticketTitle)).toBeVisible();
    await expect(page.getByTestId("column-in_progress").getByText(ticketTitle)).not.toBeVisible();
  });

  await test.step("unrouted, the same drag now succeeds (proves the route caused the failure)", async () => {
    await page.unroute("**/api/tickets/*");
    await dragCardToColumn(page, `card-${ticket.id}`, "in_progress");
    await expect(page.getByTestId("column-in_progress").getByText(ticketTitle)).toBeVisible();
  });
});
