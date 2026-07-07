// §6: canonical API values ↔ human-readable labels. The ORDER arrays are the single
// source of truth — the union types derive from them, so a new value cannot be added
// to the type without also getting a board column / dropdown position, and the
// Record types force a label for every value.

// Workflow order (§8) — the board renders columns in exactly this order.
export const STATE_ORDER = [
  "new",
  "ready_for_implementation",
  "in_progress",
  "ready_for_acceptance",
  "done",
] as const;

export const TYPE_ORDER = ["bug", "feature", "fix"] as const;

export type TicketState = (typeof STATE_ORDER)[number];
export type TicketType = (typeof TYPE_ORDER)[number];

export const TYPE_LABELS: Record<TicketType, string> = {
  bug: "Bug",
  feature: "Feature",
  fix: "Fix",
};

export const STATE_LABELS: Record<TicketState, string> = {
  new: "New",
  ready_for_implementation: "Ready for implementation",
  in_progress: "In progress",
  ready_for_acceptance: "Ready for acceptance",
  done: "Done",
};

// Screens that want uppercase (board column headers, card badges) apply CSS text-transform.
