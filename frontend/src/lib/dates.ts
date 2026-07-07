// Friendly relative form for tables and board cards (wireframes 1/4).
// Browser-local clock by design (spec-analysis); detail views show absolute UTC instead.
export function formatRelative(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "—";

  const diffMs = Date.now() - then.getTime();
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const startOfYesterday = new Date();
  startOfYesterday.setHours(0, 0, 0, 0);
  // setDate (not minus-24h) so DST-transition days keep the boundary at local midnight.
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (then >= startOfYesterday) return "Yesterday";

  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(then.getFullYear() !== new Date().getFullYear() && { year: "numeric" }),
  });
}
