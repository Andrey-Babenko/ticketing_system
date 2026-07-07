import { Link } from "react-router";
import type { Ticket } from "../api/tickets";
import { TYPE_LABELS } from "../lib/labels";
import { formatRelative } from "../lib/dates";

const TYPE_BADGE: Record<Ticket["type"], string> = {
  bug: "bg-red-100 text-red-700",
  feature: "bg-blue-100 text-blue-700",
  fix: "bg-green-100 text-green-700",
};

export default function TicketCard({ ticket, epicName }: { ticket: Ticket; epicName?: string }) {
  return (
    <Link
      to={`/tickets/${ticket.id}`}
      data-testid={`card-${ticket.id}`}
      className="block rounded border border-gray-200 bg-white p-3 shadow-sm hover:border-blue-300 hover:shadow"
    >
      <span
        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TYPE_BADGE[ticket.type]}`}
      >
        {TYPE_LABELS[ticket.type]}
      </span>
      <p className="mt-1.5 text-sm font-medium text-gray-900">{ticket.title}</p>
      {epicName && <p className="mt-1 text-xs text-gray-500">Epic: {epicName}</p>}
      <p className="mt-1 text-xs text-gray-400">{formatRelative(ticket.modifiedAt)}</p>
    </Link>
  );
}
