import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Skeleton } from "./ui/skeleton";

/**
 * Reusable server-side data table used across the admin console.
 *
 * Features:
 *  - Server-side pagination + sort. Caller provides a `load({offset, limit, sort, order, filters})`
 *    function that returns `{items, total}`.
 *  - Multi-condition filtering. Caller declares filter fields in `filters`. The
 *    table renders the filter bar and forwards the active values into `load()`.
 *  - Per-user persisted preferences (localStorage, scoped by `tableId`):
 *      - density (comfortable | compact)
 *      - column visibility (which optional columns are showing)
 *      - column pin (which column is sticky-left, max 1 in this iteration)
 *      - page size
 *  - Row selection with select-all-on-page semantics; caller can supply
 *    `bulkActions` and a `getRowId` to receive the selected IDs.
 *  - CSV / JSON export of the current page (selected items if any, else all visible).
 *  - Responsive: below `md` we render each row as a card stack instead of a
 *    horizontal table.
 *  - Skeleton row loaders during fetch.
 *
 * Column shape:
 *   {
 *     id: "name",                       // required, unique
 *     header: "Name",                   // string OR (() => node)
 *     accessor: (row) => row.full_name, // value extractor; used for export + card fallback
 *     cell?: (row) => node,             // optional custom cell render
 *     sortable?: boolean,               // enable sort header on this column
 *     sortKey?: string,                 // server-side sort key (defaults to id)
 *     optional?: boolean,               // user can hide/show via column-picker
 *     defaultHidden?: boolean,          // start hidden if optional
 *     pinnable?: boolean,               // user can pin this column left
 *     align?: "left" | "right" | "center",
 *     widthClass?: string,
 *     cardLabel?: string,               // override label in card-stack view
 *   }
 *
 * Filter shape:
 *   {
 *     id: "kyc",                        // required, becomes the load() key
 *     label: "KYC",
 *     type: "text" | "select" | "date",
 *     options?: [{value, label}],       // for select
 *     placeholder?: string,
 *     defaultValue?: string,
 *     widthClass?: string,
 *   }
 */
const STORAGE_PREFIX = "roobani.admin.table.";

function readPrefs(tableId) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + tableId);
    return raw ? JSON.parse(raw) : {};
  } catch (_e) {
    return {};
  }
}
function writePrefs(tableId, prefs) {
  try {
    localStorage.setItem(STORAGE_PREFIX + tableId, JSON.stringify(prefs));
  } catch (_e) { /* ignore quota / privacy mode */ }
}

function ColumnPicker({ columns, hidden, onToggle, pinnedId, onPin }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const optional = columns.filter((c) => c.optional);
  const pinnable = columns.filter((c) => c.pinnable);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        data-testid="dt-columns-toggle"
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
        aria-haspopup="true"
        className="px-3 py-2 text-[11px] tracking-[0.2em] uppercase font-mono border border-[#E0DDD5] text-[#1A1F3D] hover:border-[#1A1F3D] transition-colors"
      >
        Columns
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-64 bg-white border border-[#E0DDD5] shadow-md z-30 p-3 text-xs"
        >
          {optional.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B] mb-2">Visibility</div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {optional.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-[#FAFAF8] px-1 py-0.5">
                    <input
                      type="checkbox"
                      data-testid={`dt-col-toggle-${c.id}`}
                      checked={!hidden.includes(c.id)}
                      onChange={() => onToggle(c.id)}
                    />
                    <span className="text-[#1C1C1E]">{typeof c.header === "string" ? c.header : c.id}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {pinnable.length > 0 && (
            <div className="mt-2 pt-2 border-t border-[#E0DDD5]">
              <div className="text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B] mb-2">Pin left</div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer hover:bg-[#FAFAF8] px-1 py-0.5">
                  <input type="radio" name="dt-pin" checked={!pinnedId} onChange={() => onPin(null)} />
                  <span className="text-[#6B6B6B]">None</span>
                </label>
                {pinnable.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-[#FAFAF8] px-1 py-0.5">
                    <input
                      type="radio"
                      name="dt-pin"
                      checked={pinnedId === c.id}
                      onChange={() => onPin(c.id)}
                      data-testid={`dt-pin-${c.id}`}
                    />
                    <span className="text-[#1C1C1E]">{typeof c.header === "string" ? c.header : c.id}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DataTable({
  tableId,
  columns,
  filters = [],
  defaultSort = "created_at",
  defaultOrder = "desc",
  defaultPageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  load,                  // async ({offset, limit, sort, order, filters}) => {items, total}
  reloadSignal = 0,      // bump to force a reload externally
  getRowId,              // (row) => unique id
  bulkActions = [],      // [{id, label, variant?: "default"|"danger", onRun: (selectedRows, selectedIds) => Promise}]
  emptyMessage = "No results match these filters.",
  initialFilters = {},   // {filterId: value}
  rowKey,                // alias for getRowId for back-compat
  cardTitle,             // (row) => string for card-stack view title
  cardSubtitle,          // (row) => string for card-stack view subtitle
  exportName = "export",
}) {
  const prefs = useMemo(() => readPrefs(tableId), [tableId]);
  const [density, setDensity] = useState(prefs.density || "comfortable");
  const [hiddenCols, setHiddenCols] = useState(() => {
    if (Array.isArray(prefs.hiddenCols)) return prefs.hiddenCols;
    return columns.filter((c) => c.optional && c.defaultHidden).map((c) => c.id);
  });
  const [pinnedCol, setPinnedCol] = useState(prefs.pinnedCol || null);
  const [pageSize, setPageSize] = useState(prefs.pageSize || defaultPageSize);

  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState(defaultSort);
  const [order, setOrder] = useState(defaultOrder);

  const [filterValues, setFilterValues] = useState(() => {
    const seed = {};
    filters.forEach((f) => { seed[f.id] = initialFilters[f.id] ?? f.defaultValue ?? ""; });
    return seed;
  });
  const [pendingFilters, setPendingFilters] = useState(filterValues);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [reloadKey, setReloadKey] = useState(0);

  const resolveId = getRowId || rowKey || ((row, idx) => row.id ?? row._id ?? idx);

  useEffect(() => { writePrefs(tableId, { density, hiddenCols, pinnedCol, pageSize }); }, [tableId, density, hiddenCols, pinnedCol, pageSize]);

  const visibleColumns = useMemo(() => columns.filter((c) => !hiddenCols.includes(c.id)), [columns, hiddenCols]);
  const orderedColumns = useMemo(() => {
    if (!pinnedCol) return visibleColumns;
    const pinned = visibleColumns.find((c) => c.id === pinnedCol);
    if (!pinned) return visibleColumns;
    return [pinned, ...visibleColumns.filter((c) => c.id !== pinnedCol)];
  }, [visibleColumns, pinnedCol]);

  const runLoad = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await load({ offset, limit: pageSize, sort, order, filters: filterValues });
      setItems(r.items || []);
      setTotal(typeof r.total === "number" ? r.total : (r.items || []).length);
      // Prune selections that are no longer on the page (server reshuffled).
      setSelectedIds((prev) => {
        if (prev.size === 0) return prev;
        const pageIds = new Set((r.items || []).map((it, i) => String(resolveId(it, i))));
        const next = new Set();
        prev.forEach((id) => { if (pageIds.has(id)) next.add(id); });
        return next;
      });
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || "Failed to load data.");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, pageSize, sort, order, filterValues, reloadKey, reloadSignal]);

  useEffect(() => { runLoad(); }, [runLoad]);

  const onSort = (col) => {
    if (!col.sortable) return;
    const key = col.sortKey || col.id;
    if (sort === key) setOrder(order === "asc" ? "desc" : "asc");
    else { setSort(key); setOrder("desc"); }
    if (offset !== 0) setOffset(0); else setReloadKey((k) => k + 1);
  };

  const applyFilters = (e) => {
    if (e) e.preventDefault();
    setFilterValues(pendingFilters);
    if (offset !== 0) setOffset(0);
  };
  const resetFilters = () => {
    const cleared = {};
    filters.forEach((f) => { cleared[f.id] = f.defaultValue ?? ""; });
    setPendingFilters(cleared);
    setFilterValues(cleared);
    if (offset !== 0) setOffset(0);
  };

  const pageIds = useMemo(() => items.map((it, i) => String(resolveId(it, i))), [items, resolveId]);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const someSelected = pageIds.some((id) => selectedIds.has(id));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const toggleRow = (id) => {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const selectedRows = useMemo(() => items.filter((it, i) => selectedIds.has(String(resolveId(it, i)))), [items, selectedIds, resolveId]);
  const selectedIdList = useMemo(() => Array.from(selectedIds), [selectedIds]);

  // -- exports
  const exportRows = (fmt) => {
    const rows = selectedRows.length > 0 ? selectedRows : items;
    if (rows.length === 0) return;
    const exportCols = visibleColumns.filter((c) => c.id !== "_actions" && c.id !== "actions");
    if (fmt === "json") {
      const data = rows.map((r) => Object.fromEntries(exportCols.map((c) => [c.id, c.accessor ? c.accessor(r) : r[c.id]])));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${exportName}-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
    } else {
      const header = exportCols.map((c) => (typeof c.header === "string" ? c.header : c.id));
      const lines = [header.join(",")];
      rows.forEach((r) => {
        lines.push(exportCols.map((c) => {
          const v = c.accessor ? c.accessor(r) : r[c.id];
          const s = v === null || v === undefined ? "" : String(v);
          return `"${s.replace(/"/g, '""')}"`;
        }).join(","));
      });
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${exportName}-${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url);
    }
  };

  const padY = density === "compact" ? "py-2" : "py-4";
  const padX = density === "compact" ? "px-3" : "px-4";

  const pageInfo = (() => {
    if (total === 0) return { start: 0, end: 0 };
    return { start: offset + 1, end: Math.min(offset + items.length, total) };
  })();

  // ----------- render -----------
  return (
    <div data-testid={`dt-${tableId}`}>
      {/* Filter bar */}
      {filters.length > 0 && (
        <form onSubmit={applyFilters} className="border border-[#E0DDD5] bg-white p-4 flex flex-wrap gap-3 mb-4" aria-label="Filters">
          {filters.map((f) => (
            <div key={f.id} className={f.widthClass || "min-w-[10rem] flex-1 md:flex-none md:w-48"}>
              <label htmlFor={`dt-filter-${f.id}`} className="block text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B] mb-1">{f.label}</label>
              {f.type === "select" ? (
                <select
                  id={`dt-filter-${f.id}`}
                  data-testid={`dt-filter-${f.id}`}
                  value={pendingFilters[f.id] || ""}
                  onChange={(e) => setPendingFilters({ ...pendingFilters, [f.id]: e.target.value })}
                  className="w-full px-3 py-2 border border-[#E0DDD5] focus:border-[#1A1F3D] outline-none text-sm bg-white"
                >
                  {(f.options || []).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={`dt-filter-${f.id}`}
                  data-testid={`dt-filter-${f.id}`}
                  type={f.type === "date" ? "date" : "text"}
                  value={pendingFilters[f.id] || ""}
                  onChange={(e) => setPendingFilters({ ...pendingFilters, [f.id]: e.target.value })}
                  placeholder={f.placeholder || ""}
                  className="w-full px-3 py-2 border border-[#E0DDD5] focus:border-[#1A1F3D] outline-none text-sm"
                />
              )}
            </div>
          ))}
          <div className="flex items-end gap-2 ml-auto">
            <button type="button" onClick={resetFilters} data-testid={`dt-${tableId}-reset`} className="px-3 py-2 text-[11px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B] hover:text-[#1A1F3D] transition-colors">Reset</button>
            <button type="submit" data-testid={`dt-${tableId}-apply`} disabled={loading} aria-busy={loading} className="px-4 py-2 text-[11px] tracking-[0.2em] uppercase font-mono text-white disabled:opacity-60 transition-colors" style={{ background: "#1A1F3D" }}>
              {loading ? "Loading..." : "Apply"}
            </button>
          </div>
        </form>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="text-xs font-mono text-[#6B6B6B]" data-testid={`dt-${tableId}-summary`}>
          {loading ? "Loading…" : `${pageInfo.start}–${pageInfo.end} of ${total}${selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}`}
        </div>
        <div className="flex-1" />
        <select
          value={density}
          onChange={(e) => setDensity(e.target.value)}
          data-testid={`dt-${tableId}-density`}
          aria-label="Row density"
          className="px-3 py-2 border border-[#E0DDD5] text-[11px] tracking-[0.18em] uppercase font-mono bg-white text-[#1A1F3D]"
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </select>
        <select
          value={pageSize}
          onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setOffset(0); }}
          data-testid={`dt-${tableId}-page-size`}
          aria-label="Rows per page"
          className="px-3 py-2 border border-[#E0DDD5] text-[11px] tracking-[0.18em] uppercase font-mono bg-white text-[#1A1F3D]"
        >
          {pageSizeOptions.map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
        {(columns.some((c) => c.optional) || columns.some((c) => c.pinnable)) && (
          <ColumnPicker
            columns={columns}
            hidden={hiddenCols}
            pinnedId={pinnedCol}
            onToggle={(id) => setHiddenCols((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])}
            onPin={(id) => setPinnedCol(id)}
          />
        )}
        <button
          type="button"
          data-testid={`dt-${tableId}-export-csv`}
          onClick={() => exportRows("csv")}
          disabled={items.length === 0}
          className="px-3 py-2 text-[11px] tracking-[0.2em] uppercase font-mono border border-[#E0DDD5] text-[#1A1F3D] hover:border-[#1A1F3D] disabled:opacity-40 transition-colors"
        >
          CSV
        </button>
        <button
          type="button"
          data-testid={`dt-${tableId}-export-json`}
          onClick={() => exportRows("json")}
          disabled={items.length === 0}
          className="px-3 py-2 text-[11px] tracking-[0.2em] uppercase font-mono border border-[#E0DDD5] text-[#1A1F3D] hover:border-[#1A1F3D] disabled:opacity-40 transition-colors"
        >
          JSON
        </button>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && bulkActions.length > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          data-testid={`dt-${tableId}-bulk-bar`}
          className="border border-[#1A1F3D] bg-[#1A1F3D] text-white p-3 mb-3 flex items-center gap-3 flex-wrap"
        >
          <span className="text-[11px] tracking-[0.2em] uppercase font-mono">{selectedIds.size} selected</span>
          <button type="button" onClick={clearSelection} className="text-[11px] tracking-[0.2em] uppercase font-mono opacity-80 hover:opacity-100">Clear</button>
          <div className="flex-1" />
          {bulkActions.map((a) => (
            <button
              key={a.id}
              type="button"
              data-testid={`dt-${tableId}-bulk-${a.id}`}
              onClick={async () => {
                if (a.confirm && !window.confirm(a.confirm.replace("{n}", String(selectedIds.size)))) return;
                await a.onRun(selectedRows, selectedIdList);
                clearSelection();
                setReloadKey((k) => k + 1);
              }}
              className={`px-4 py-2 text-[11px] tracking-[0.2em] uppercase font-mono transition-colors ${a.variant === "danger" ? "bg-[#C0392B] hover:bg-[#a52f23]" : "bg-white text-[#1A1F3D] hover:bg-[#F0EDE6]"}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div role="alert" data-testid={`dt-${tableId}-error`} className="border border-[#C0392B] bg-[#FDECEA] text-[#C0392B] text-sm p-3 mb-3 font-mono">
          {error}
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block border border-[#E0DDD5] bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E0DDD5]">
              {bulkActions.length > 0 && (
                <th className={`${padY} ${padX} w-10 ${pinnedCol ? "sticky left-0 bg-white z-10" : ""}`}>
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    data-testid={`dt-${tableId}-select-all`}
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                    onChange={toggleSelectAll}
                  />
                </th>
              )}
              {orderedColumns.map((c, ci) => {
                const isPinned = pinnedCol && c.id === pinnedCol;
                const isActiveSort = sort === (c.sortKey || c.id);
                return (
                  <th
                    key={c.id}
                    scope="col"
                    className={`text-left ${padY} ${padX} text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B] ${c.widthClass || ""} ${isPinned ? "sticky bg-white z-10" : ""} ${isPinned ? (bulkActions.length > 0 ? "left-10" : "left-0") : ""}`}
                    aria-sort={isActiveSort ? (order === "asc" ? "ascending" : "descending") : "none"}
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        onClick={() => onSort(c)}
                        data-testid={`dt-${tableId}-sort-${c.id}`}
                        className="inline-flex items-center gap-1 hover:text-[#1A1F3D] transition-colors"
                      >
                        {typeof c.header === "function" ? c.header() : c.header}
                        <span aria-hidden="true" className="text-[10px]">{isActiveSort ? (order === "asc" ? "▲" : "▼") : "↕"}</span>
                      </button>
                    ) : (
                      typeof c.header === "function" ? c.header() : c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(Math.min(pageSize, 6))].map((_, i) => (
                <tr key={i} className="border-b border-[#E0DDD5] last:border-0">
                  {bulkActions.length > 0 && <td className={`${padY} ${padX}`}><Skeleton className="h-3 w-3" /></td>}
                  {orderedColumns.map((c) => (
                    <td key={c.id} className={`${padY} ${padX}`}><Skeleton className="h-3 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={(bulkActions.length > 0 ? 1 : 0) + orderedColumns.length} className="p-10 text-center text-[#6B6B6B] font-mono text-xs">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              items.map((row, idx) => {
                const id = String(resolveId(row, idx));
                const selected = selectedIds.has(id);
                return (
                  <tr key={id} className={`border-b border-[#E0DDD5] last:border-0 ${selected ? "bg-[#F0EDE6]" : "hover:bg-[#FAFAF8]"} transition-colors`}>
                    {bulkActions.length > 0 && (
                      <td className={`${padY} ${padX} ${pinnedCol ? "sticky left-0 z-10 " + (selected ? "bg-[#F0EDE6]" : "bg-white") : ""}`}>
                        <input
                          type="checkbox"
                          aria-label={`Select row ${id}`}
                          data-testid={`dt-${tableId}-row-${id}`}
                          checked={selected}
                          onChange={() => toggleRow(id)}
                        />
                      </td>
                    )}
                    {orderedColumns.map((c, ci) => {
                      const isPinned = pinnedCol && c.id === pinnedCol;
                      const content = c.cell ? c.cell(row, { selected }) : (c.accessor ? c.accessor(row) : row[c.id]);
                      return (
                        <td
                          key={c.id}
                          className={`${padY} ${padX} text-sm ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""} ${isPinned ? "sticky z-10 " + (selected ? "bg-[#F0EDE6]" : "bg-white") : ""} ${isPinned ? (bulkActions.length > 0 ? "left-10" : "left-0") : ""}`}
                        >
                          {content ?? "-"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card stack */}
      <div className="md:hidden space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="border border-[#E0DDD5] bg-white p-4">
              <Skeleton className="h-4 w-2/3 mb-2" />
              <Skeleton className="h-3 w-1/2 mb-3" />
              <Skeleton className="h-3 w-full mb-1" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))
        ) : items.length === 0 ? (
          <div className="border border-[#E0DDD5] bg-white p-6 text-center text-[#6B6B6B] font-mono text-xs">{emptyMessage}</div>
        ) : (
          items.map((row, idx) => {
            const id = String(resolveId(row, idx));
            const selected = selectedIds.has(id);
            return (
              <article key={id} className={`border ${selected ? "border-[#1A1F3D] bg-[#F0EDE6]" : "border-[#E0DDD5] bg-white"} p-4`}>
                <header className="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-[#E0DDD5]">
                  <div className="min-w-0">
                    {cardTitle && <div className="text-sm font-medium text-[#1C1C1E] truncate">{cardTitle(row)}</div>}
                    {cardSubtitle && <div className="text-[11px] font-mono text-[#6B6B6B] truncate">{cardSubtitle(row)}</div>}
                  </div>
                  {bulkActions.length > 0 && (
                    <input
                      type="checkbox"
                      aria-label={`Select row ${id}`}
                      data-testid={`dt-${tableId}-card-${id}`}
                      checked={selected}
                      onChange={() => toggleRow(id)}
                      className="mt-1"
                    />
                  )}
                </header>
                <dl className="space-y-2">
                  {orderedColumns.map((c) => (
                    <div key={c.id} className="flex justify-between items-start gap-3 text-xs">
                      <dt className="text-[10px] tracking-[0.2em] uppercase font-mono text-[#6B6B6B] flex-shrink-0">{c.cardLabel || (typeof c.header === "string" ? c.header : c.id)}</dt>
                      <dd className="text-right text-[#1C1C1E] min-w-0">{c.cell ? c.cell(row, { selected }) : (c.accessor ? c.accessor(row) : row[c.id]) ?? "-"}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            );
          })
        )}
      </div>

      {/* Pagination */}
      <nav aria-label="Pagination" className="flex flex-wrap justify-between items-center mt-4 gap-3 text-xs font-mono text-[#6B6B6B]">
        <div data-testid={`dt-${tableId}-page-info`}>
          {total === 0 ? "0 results" : `Showing ${pageInfo.start}–${pageInfo.end} of ${total}`}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid={`dt-${tableId}-prev`}
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - pageSize))}
            className="px-4 py-2 border border-[#E0DDD5] hover:border-[#1A1F3D] hover:text-[#1A1F3D] disabled:opacity-40 transition-colors"
          >
            Previous
          </button>
          <button
            type="button"
            data-testid={`dt-${tableId}-next`}
            disabled={offset + items.length >= total || loading}
            onClick={() => setOffset(offset + pageSize)}
            className="px-4 py-2 border border-[#E0DDD5] hover:border-[#1A1F3D] hover:text-[#1A1F3D] disabled:opacity-40 transition-colors"
          >
            Next
          </button>
        </div>
      </nav>
    </div>
  );
}
