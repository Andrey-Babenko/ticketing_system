import type { ReactNode } from "react";
import type { TicketState } from "../lib/labels";
import { STATE_LABELS } from "../lib/labels";

export default function Column({
  state,
  count,
  children,
}: {
  state: TicketState;
  count: number;
  children: ReactNode;
}) {
  return (
    <div
      data-testid={`column-${state}`}
      className="flex min-w-64 flex-1 flex-col rounded bg-gray-100 p-2"
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          {STATE_LABELS[state]}
        </h2>
        <span className="text-xs font-medium text-gray-500">{count}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}
