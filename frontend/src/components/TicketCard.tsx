import type { RefObject } from "react";
import { Link } from "react-router";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Ticket } from "../api/tickets";
import { TYPE_LABELS } from "../lib/labels";
import { formatRelative } from "../lib/dates";

const TYPE_BADGE: Record<Ticket["type"], string> = {
  bug: "bg-red-100 text-red-700",
  feature: "bg-blue-100 text-blue-700",
  fix: "bg-green-100 text-green-700",
};

// Shared visual body — used by the real (draggable, clickable) card AND by DragOverlay's
// floating copy, so the two can never drift apart (fieldClass-style rule, ui.tsx).
export function TicketCardBody({ ticket, epicName }: { ticket: Ticket; epicName?: string }) {
  return (
    <>
      <span
        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TYPE_BADGE[ticket.type]}`}
      >
        {TYPE_LABELS[ticket.type]}
      </span>
      <p className="mt-1.5 text-sm font-medium text-gray-900">{ticket.title}</p>
      {epicName && <p className="mt-1 text-xs text-gray-500">Epic: {epicName}</p>}
      <p className="mt-1 text-xs text-gray-400">{formatRelative(ticket.modifiedAt)}</p>
    </>
  );
}

interface TicketCardProps {
  ticket: Ticket;
  epicName?: string;
  /** True while this ticket's own drag-move PATCH is in flight (ADR-10). */
  disabled?: boolean;
  /** Set by Board's onDragEnd so a drag's pointerup doesn't also fire a navigation click. */
  justDraggedRef: RefObject<number | null>;
}

export default function TicketCard({ ticket, epicName, disabled, justDraggedRef }: TicketCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
    disabled,
  });

  return (
    <Link
      ref={setNodeRef}
      style={transform ? { transform: CSS.Translate.toString(transform) } : undefined}
      to={`/tickets/${ticket.id}`}
      data-testid={`card-${ticket.id}`}
      onClick={(e) => {
        if (justDraggedRef.current === ticket.id) e.preventDefault();
      }}
      className={`block touch-none rounded border border-gray-200 bg-white p-3 shadow-sm hover:border-blue-300 hover:shadow ${
        isDragging ? "opacity-40" : ""
      } ${disabled ? "cursor-wait" : ""}`}
      {...listeners}
      {...attributes}
    >
      <TicketCardBody ticket={ticket} epicName={epicName} />
    </Link>
  );
}
