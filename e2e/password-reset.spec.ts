import { test, expect } from "@playwright/test";
import { unique, mailpitVerifyLink, mailpitResetLink } from "./helpers";

// S8.4, §14, ADR-17: the full password-reset journey through the real browser and
// Mailpit — signup/verify done via the API (already covered by happy.spec.ts) so this
// spends its time on the screens and mail round-trip unique to this feature.
test("forgot password → reset via emailed link → old password dead, new one works", async ({
  page,
}) => {
  const email = `${unique("e2e-reset")}@example.com`;
  const oldPassword = "password123";
  const newPassword = "new-password-456";

  await page.request.post("/api/auth/signup", { data: { email, password: oldPassword } });
  const verifyLink = await mailpitVerifyLink(email);
  const verifyToken = new URL(verifyLink).searchParams.get("token");
  await page.request.post("/api/auth/verify", { data: { token: verifyToken } });

  await test.step("request a reset link from the login screen", async () => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  });

  await test.step("open the emailed link and set a new password", async () => {
    const resetLink = await mailpitResetLink(email);
    await page.goto(resetLink);
    await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
    await page.getByLabel("New password").fill(newPassword);
    await page.getByLabel("Confirm password").fill(newPassword);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByRole("heading", { name: "Password reset" })).toBeVisible();
    await page.getByRole("link", { name: "Continue to login" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  await test.step("the old password no longer works", async () => {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(oldPassword);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Wrong email or password")).toBeVisible();
  });

  await test.step("the new password logs in", async () => {
    await page.getByLabel("Password").fill(newPassword);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/board/);
  });
});
