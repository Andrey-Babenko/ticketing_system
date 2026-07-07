import { test, expect } from "@playwright/test";
import { unique, mailpitVerifyLink, dragCardToColumn } from "./helpers";

// One serial journey covering §13 checkboxes 1, 2, 3, 4, 5, 6, 10 — the §11 "frontend
// flow" automated test. Each phase is a test.step so a failure's trace pinpoints exactly
// where the journey broke instead of just "the test failed".
test("full journey: signup through verify, teams, epics, tickets, drag, comments", async ({
  page,
}) => {
  const email = `${unique("e2e")}@example.com`;
  const password = "password123";
  const teamName = unique("E2E Team");
  const epicTitle = unique("E2E Epic");
  const ticketTitle = unique("E2E Ticket");

  await test.step("sign up", async () => {
    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  });

  await test.step("verify via the real mail delivered to Mailpit", async () => {
    const link = await mailpitVerifyLink(email);
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
    await page.getByRole("link", { name: "Continue to login" }).click();
  });

  await test.step("log in", async () => {
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/board/);
  });

  let teamId: number;
  await test.step("create a team (§4)", async () => {
    await page.goto("/teams");
    await page.getByRole("button", { name: "+ Create team" }).click();
    // Scoped to the modal: "Create" alone is ambiguous against the page's own
    // "+ Create team" trigger button (substring match).
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Team name").fill(teamName);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/api/teams")),
      dialog.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    teamId = (await response.json()).id;
    await expect(page.getByText(teamName)).toBeVisible();
  });

  await test.step("create an epic scoped to that team (§5)", async () => {
    await page.goto(`/epics?team=${teamId}`);
    await page.getByRole("button", { name: "+ Create epic" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill(epicTitle);
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByText(epicTitle)).toBeVisible();
  });

  await test.step("create a ticket from the board (§6)", async () => {
    await page.goto(`/board/${teamId}`);
    await page.getByRole("link", { name: "+ New ticket" }).click();
    await expect(page).toHaveURL(/\/tickets\/new/);
    await page.getByLabel("Epic").selectOption({ label: epicTitle });
    await page.getByLabel("Title").fill(ticketTitle);
    await page.getByLabel("Body").fill("Body for the E2E happy path.");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(new RegExp(`/board/${teamId}$`));
  });

  const card = page.getByText(ticketTitle).locator("xpath=ancestor::a[@data-testid]");
  let cardTestId: string;

  await test.step("card appears in NEW with the epic name (wireframe 1)", async () => {
    await expect(page.getByTestId("column-new").getByText(ticketTitle)).toBeVisible();
    await expect(page.getByTestId("column-new").getByText(`Epic: ${epicTitle}`)).toBeVisible();
    cardTestId = (await card.getAttribute("data-testid"))!;
  });

  await test.step("drag to In progress persists immediately (§6, ADR-10)", async () => {
    await dragCardToColumn(page, cardTestId, "in_progress");
    await expect(page.getByTestId("column-in_progress").getByText(ticketTitle)).toBeVisible();
    await expect(page.getByTestId("column-new").getByText(ticketTitle)).not.toBeVisible();
  });

  await test.step("survives a refresh (§13 checkbox 6, verbatim)", async () => {
    await page.reload();
    await expect(page.getByTestId("column-in_progress").getByText(ticketTitle)).toBeVisible();
  });

  let modifiedStampBefore: string;
  await test.step("open the ticket and note its Modified stamp", async () => {
    await page.getByTestId(cardTestId).click();
    await expect(page).toHaveURL(/\/tickets\/\d+$/);
    const meta = page.getByText(/Modified .* UTC/);
    await expect(meta).toBeVisible();
    modifiedStampBefore = (await meta.textContent())!;
  });

  await test.step("post a comment — author + timestamp visible (§13 checkbox 4)", async () => {
    await page.getByLabel("Add a comment").fill("A comment from the E2E suite.");
    await page.getByRole("button", { name: "Post comment" }).click();
    await expect(page.getByText("A comment from the E2E suite.")).toBeVisible();
    await expect(page.getByText(email, { exact: false }).last()).toBeVisible();
  });

  await test.step("commenting never touches the ticket's Modified stamp (§7)", async () => {
    const meta = page.getByText(/Modified .* UTC/);
    await expect(meta).toHaveText(modifiedStampBefore);
  });

  // Only one comment exists at this point in the journey — scope by role, not by text,
  // since editing swaps the body text for a textarea (the text locator would go stale).
  const commentItem = page.getByRole("listitem");

  await test.step("edit own comment — marks it (edited) (S8.1, §14)", async () => {
    await commentItem.getByRole("button", { name: "Edit" }).click();
    await commentItem.getByLabel("Edit comment").fill("Edited by the E2E suite.");
    await commentItem.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Edited by the E2E suite.")).toBeVisible();
    await expect(commentItem.getByText("(edited)")).toBeVisible();
    await expect(page.getByText(/Modified .* UTC/)).toHaveText(modifiedStampBefore);
  });

  await test.step("delete own comment (S8.1, §14)", async () => {
    await commentItem.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText("Edited by the E2E suite.")).not.toBeVisible();
    await expect(page.getByText("Comments (0)")).toBeVisible();
    await expect(page.getByText(/Modified .* UTC/)).toHaveText(modifiedStampBefore);
  });

  await test.step("back to the board", async () => {
    await page.getByRole("link", { name: /Back to/ }).click();
    await expect(page).toHaveURL(new RegExp(`/board/${teamId}$`));
  });
});
