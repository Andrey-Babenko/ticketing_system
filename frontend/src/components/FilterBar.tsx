import { EMPTY_FILTERS } from "../lib/boardFilters";
import type { Filters } from "../lib/boardFilters";
import { TYPE_LABELS, TYPE_ORDER } from "../lib/labels";
import type { Epic } from "../api/epics";
import { Button, FIELD_SHELL, FIELD_SHELL_DEFAULT } from "./ui";

// Shares ui.tsx's border/focus treatment (FIELD_SHELL*) but not its `w-full` — this is
// a horizontal toolbar, not a vertical form (Slice 6 review finding).
const TOOLBAR_FIELD = `${FIELD_SHELL} ${FIELD_SHELL_DEFAULT}`;

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
        className={`w-48 ${TOOLBAR_FIELD}`}
      />
      <select
        value={filters.type ?? ""}
        onChange={(e) => onChange({ ...filters, type: (e.target.value || null) as Filters["type"] })}
        className={`bg-white ${TOOLBAR_FIELD}`}
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
        className={`bg-white ${TOOLBAR_FIELD}`}
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
