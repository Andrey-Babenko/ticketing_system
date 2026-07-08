import { expect, type Page } from "@playwright/test";
import type { TicketState } from "../frontend/src/lib/labels";

const MAILPIT_URL = "http://localhost:8025";

// Timestamp + random suffix so parallel/repeated runs never collide on unique
// constraints (email, team name) and never need a DB wipe between runs (mirrors §9's
// "QA creates test data through the UI" — the E2E suite is just another such client).
export function unique(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Polls Mailpit's REST API for the verification email sent to `email` and extracts the
// token from its plain-text body. Polling (not a fixed wait) because mail delivery is
// async relative to the signup API response returning.
export async function mailpitVerifyLink(email: string): Promise<string> {
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`
        );
        const body = await res.json();
        return body.messages_count as number;
      },
      { message: `waiting for a verification email to ${email}`, timeout: 15_000 }
    )
    .toBeGreaterThan(0);

  const searchRes = await fetch(
    `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`
  );
  const { messages } = await searchRes.json();
  const latest = messages[0]; // one unique email per run → exactly one match in practice
  const msgRes = await fetch(`${MAILPIT_URL}/api/v1/message/${latest.ID}`);
  const msg = await msgRes.json();
  const match = (msg.Text as string).match(/https?:\/\/\S*\/verify\?token=\S+/);
  if (!match) throw new Error(`No verify link found in mail body: ${msg.Text}`);
  return match[0];
}

// dnd-kit uses pointer events (PointerSensor), not native HTML5 drag-and-drop — Playwright's
// built-in dragAndDrop() dispatches HTML5 drag events and does not trigger it (verified in
// Slice 6). Interpolated mouse moves reproduce real pointer-event sequences instead.
//
// The interpolation itself has no way to know whether dnd-kit actually recognized the
// gesture (PointerSensor requires 8px of movement past pointerdown before it activates —
// Board.tsx's activationConstraint) or whether onDragEnd has finished running by the time
// mouse.up() returns. Rather than guess at how many steps/ms that takes, wait on the
// DragOverlay's data-testid — it mounts exactly when activeTicket is set in onDragStart and
// unmounts when onDragEnd clears it, so its presence is a direct, non-transient proxy for
// "dnd-kit is mid-drag" (unlike the accessibility live region's text, which the very next
// onDragOver event overwrites before a poll can reliably observe "picked up").
export async function dragCardToColumn(page: Page, cardTestId: string, targetState: TicketState) {
  const card = page.getByTestId(cardTestId);
  const column = page.getByTestId(`column-${targetState}`);
  const overlay = page.getByTestId("drag-overlay");

  const cardBox = await card.boundingBox();
  const columnBox = await column.boundingBox();
  if (!cardBox || !columnBox) throw new Error("Card or column not visible for drag");

  const startX = cardBox.x + cardBox.width / 2;
  const startY = cardBox.y + cardBox.height / 2;
  const endX = columnBox.x + columnBox.width / 2;
  const endY = columnBox.y + 40;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      startX + ((endX - startX) * i) / steps,
      startY + ((endY - startY) * i) / steps
    );
    // Confirm the drag actually activated as soon as it's geometrically possible (past
    // the 8px activation distance) instead of finding out only after mouse.up().
    if (i === 1) await expect(overlay).toBeVisible({ timeout: 2000 });
  }
  await page.mouse.up();
  // Wait for onDragEnd to actually run (it clears activeTicket, unmounting the overlay) so
  // callers can rely on the drop — and any mutation/optimistic update it triggers — having
  // started, not just that the OS-level mouseup event was dispatched.
  await expect(overlay).not.toBeVisible({ timeout: 2000 });
}
