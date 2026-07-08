import { useRef } from "react";
import type { RefObject } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { TicketState } from "../lib/labels";
import { STATE_LABELS } from "../lib/labels";
import type { Ticket } from "../api/tickets";
import TicketCard from "./TicketCard";

// S8.3/ADR-16: windows the card list so DOM size stays bounded regardless of ticket
// count (verified at 1,000/team). `data-testid="column-<state>"` keeps its original
// meaning — the whole column shell (header + cards), still the sole droppable region —
// so existing tests (text lookups, drop-target bounding box) are untouched. A second
// `column-scroll-<state>` testid identifies the actual scrollable element for tests
// that need to scroll it. Estimated row height only seeds the initial layout;
// `measureElement` corrects it to each card's real (variable) height immediately.
export default function Column({
  state,
  tickets,
  epicName,
  disabledIds,
  justDraggedRef,
}: {
  state: TicketState;
  tickets: Ticket[];
  epicName: (epicId: number | null) => string | undefined;
  disabledIds: ReadonlySet<number>;
  justDraggedRef: RefObject<number | null>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: state });
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: tickets.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 90,
    overscan: 5,
  });

  return (
    <div
      ref={setNodeRef}
      data-testid={`column-${state}`}
      className={`flex min-w-64 flex-1 flex-col rounded p-2 ${
        isOver ? "bg-blue-50 ring-2 ring-blue-200" : "bg-gray-100"
      }`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          {STATE_LABELS[state]}
        </h2>
        <span className="text-xs font-medium text-gray-500">{tickets.length}</span>
      </div>
      <div
        ref={scrollRef}
        data-testid={`column-scroll-${state}`}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const ticket = tickets[virtualRow.index];
            return (
              <div
                key={ticket.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="pb-2"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <TicketCard
                  ticket={ticket}
                  epicName={epicName(ticket.epicId)}
                  disabled={disabledIds.has(ticket.id)}
                  justDraggedRef={justDraggedRef}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
