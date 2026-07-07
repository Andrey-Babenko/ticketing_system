// §6: canonical API values ↔ human-readable labels. One shared mapping; screens that
// want uppercase (board column headers, card badges) apply CSS text-transform.
export type TicketType = "bug" | "feature" | "fix";
export type TicketState =
  | "new"
  | "ready_for_implementation"
  | "in_progress"
  | "ready_for_acceptance"
  | "done";

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

// Workflow order (§8) — the board renders columns in exactly this order.
export const STATE_ORDER: TicketState[] = [
  "new",
  "ready_for_implementation",
  "in_progress",
  "ready_for_acceptance",
  "done",
];

export const TYPE_ORDER: TicketType[] = ["bug", "feature", "fix"];
