import type { Filters } from "../lib/boardFilters";
import { TYPE_LABELS, TYPE_ORDER } from "../lib/labels";
import type { Epic } from "../api/epics";
import { Button } from "./ui";

const EMPTY_FILTERS: Filters = { search: "", type: null, epic: null };

interface FilterBarProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  epics: Epic[];
  /** Count AFTER filtering — the readout describes what's visible, not the team total. */
  visibleCount: number;
}

export default function FilterBar({ filters, onChange, epics, visibleCount }: FilterBarProps) {
  const isDefault =
    filters.search === "" && filters.type === null && filters.epic === null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        type="search"
        placeholder="Search titles…"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="w-48 rounded border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
      <select
        value={filters.type ?? ""}
        onChange={(e) => onChange({ ...filters, type: (e.target.value || null) as Filters["type"] })}
        className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
      >
        <option value="">All types</option>
        {TYPE_ORDER.map((t) => (
          <option key={t} value={t}>
            {TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      <select
        value={filters.epic === null ? "" : String(filters.epic)}
        onChange={(e) => {
          const v = e.target.value;
          onChange({ ...filters, epic: v === "" ? null : v === "none" ? "none" : Number(v) });
        }}
        className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
      >
        <option value="">All epics</option>
        <option value="none">No epic</option>
        {epics.map((e) => (
          <option key={e.id} value={e.id}>
            {e.title}
          </option>
        ))}
      </select>
      {!isDefault && (
        <Button type="button" variant="secondary" onClick={() => onChange(EMPTY_FILTERS)}>
          Clear
        </Button>
      )}
      <span className="ml-auto text-sm text-gray-500">
        {visibleCount} {visibleCount === 1 ? "ticket" : "tickets"}
      </span>
    </div>
  );
}
