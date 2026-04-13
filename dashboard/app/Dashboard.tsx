"use client";

import { type Order } from "@/lib/supabase";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";

type Props = { orders: Order[] };
type SortKey = keyof Order;
type SortDir = "asc" | "desc";

const STATUS_LABELS: Record<string, string> = {
  new: "Новый", complete: "Выполнен", "partially-completed": "Частично",
  "offer-analog": "Предложить замену", "client-confirmed": "Согласовано",
  prepayed: "Предоплата", assembling: "Комплектуется", delivering: "Доставляется",
  "no-call": "Недозвон", "cancel-other": "Отменён", return: "Возврат",
};
const STATUS_COLORS: Record<string, string> = {
  new: "#6366f1", complete: "#10b981", delivering: "#f59e0b",
  "cancel-other": "#ef4444", return: "#ef4444",
};
const SOURCE_COLORS: Record<string, string> = {
  instagram: "#E1306C", google: "#4285F4", facebook: "#1877F2",
  direct: "#6366f1", tiktok: "#010101", referral: "#10b981", other: "#94a3b8",
};
const ALL_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "id", label: "ID" }, { key: "first_name", label: "Клиент" },
  { key: "city", label: "Город" }, { key: "utm_source", label: "Источник" },
  { key: "status", label: "Статус" }, { key: "total", label: "Сумма" },
  { key: "created_at", label: "Дата" },
];
const PER_PAGE_OPTIONS = [10, 25, 50, 100];
const DATE_PRESETS = [
  { label: "7 дн", days: 7 },
  { label: "30 дн", days: 30 },
  { label: "90 дн", days: 90 },
  { label: "Всё", days: 0 },
];
const LS = {
  sortKey: "gbc_sortKey", sortDir: "gbc_sortDir",
  visibleCols: "gbc_visibleCols", perPage: "gbc_perPage",
  dateFrom: "gbc_dateFrom", dateTo: "gbc_dateTo",
  filterCity: "gbc_filterCity", filterSource: "gbc_filterSource",
  filterStatus: "gbc_filterStatus",
};

function ls<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; }
  catch { return fallback; }
}
function lsSet(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

const fmt = (n: number) =>
  new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 }).format(n);

function groupByDate(orders: Order[]) {
  const map: Record<string, { date: string; count: number }> = {};
  for (const o of orders) {
    const d = o.created_at?.slice(0, 10) ?? "unknown";
    if (!map[d]) map[d] = { date: d, count: 0 };
    map[d].count += 1;
  }
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}
function groupBySource(orders: Order[]) {
  const map: Record<string, number> = {};
  for (const o of orders) {
    const src = o.utm_source || "direct";
    map[src] = (map[src] ?? 0) + Number(o.total);
  }
  return Object.entries(map).map(([source, revenue]) => ({ source, revenue }))
    .sort((a, b) => b.revenue - a.revenue);
}

// ─── sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent, delta }: {
  label: string; value: string | number; sub?: string; accent?: boolean; delta?: number;
}) {
  return (
    <div className={`rounded-2xl p-5 border ${accent ? "bg-indigo-600 border-indigo-600" : "bg-white border-gray-100 shadow-sm"}`}>
      <p className={`text-sm mb-1 ${accent ? "text-indigo-200" : "text-gray-500"}`}>{label}</p>
      <p className={`text-2xl font-bold ${accent ? "text-white" : "text-gray-900"}`}>{value}</p>
      <div className="flex items-center gap-2 mt-1">
        {sub && <p className={`text-xs ${accent ? "text-indigo-300" : "text-gray-400"}`}>{sub}</p>}
        {delta !== undefined && delta !== 0 && (
          <span className={`text-xs font-medium ${delta > 0 ? "text-emerald-500" : "text-red-400"}`}>
            {delta > 0 ? "+" : ""}{delta}%
          </span>
        )}
      </div>
    </div>
  );
}

function SortIcon({ dir }: { dir: SortDir | null }) {
  return <span className={`ml-1 text-xs ${dir ? "text-indigo-500" : "text-gray-300"}`}>
    {dir === "asc" ? "↑" : dir === "desc" ? "↓" : "↕"}
  </span>;
}

function Select({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: string[]; placeholder: string;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={`text-sm border rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-colors ${
        value ? "border-indigo-300 text-gray-800" : "border-gray-200 text-gray-400"
      }`}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function ColumnsDropdown({ columns, visible, onToggle }: {
  columns: { key: SortKey; label: string }[];
  visible: Set<SortKey>; onToggle: (k: SortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl transition-colors">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 6h18M3 14h10" />
        </svg>
        Столбцы
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 bg-white border border-gray-100 shadow-xl rounded-xl p-3 z-20 w-44">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2 px-1">Показать</p>
          {columns.map(col => (
            <label key={col.key} className="flex items-center gap-2 px-1 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer">
              <input type="checkbox" checked={visible.has(col.key)} onChange={() => onToggle(col.key)} className="accent-indigo-600 w-3.5 h-3.5" />
              <span className="text-sm text-gray-700">{col.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Pagination({ page, total, perPage, onPage, onPerPage }: {
  page: number; total: number; perPage: number;
  onPage: (p: number) => void; onPerPage: (n: number) => void;
}) {
  const totalPages = Math.ceil(total / perPage);
  if (total === 0) return null;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  const pages: (number | "…")[] = [];
  if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
  else {
    pages.push(1);
    if (page > 3) pages.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t border-gray-50">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span>Показывать по</span>
        <select value={perPage} onChange={e => { onPerPage(Number(e.target.value)); onPage(1); }}
          className="border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
          {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <span className="text-gray-400">{from}–{to} из {total}</span>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(page - 1)} disabled={page === 1}
          className="px-2.5 py-1.5 text-sm text-gray-500 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">←</button>
        {pages.map((p, i) => p === "…"
          ? <span key={`e${i}`} className="px-2 text-gray-400">…</span>
          : <button key={p} onClick={() => onPage(p as number)}
              className={`w-8 h-8 text-sm rounded-lg transition-colors ${p === page ? "bg-indigo-600 text-white font-semibold" : "text-gray-600 hover:bg-gray-100"}`}>{p}</button>
        )}
        <button onClick={() => onPage(page + 1)} disabled={page === totalPages || totalPages === 0}
          className="px-2.5 py-1.5 text-sm text-gray-500 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">→</button>
      </div>
    </div>
  );
}

const ChartTooltip = ({ active, payload, label, money }: {
  active?: boolean; payload?: { value: number }[]; label?: string; money?: boolean;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 shadow-lg rounded-xl px-3 py-2 text-sm">
      <p className="text-gray-400 text-xs mb-0.5">{label}</p>
      <p className="font-semibold text-gray-900">{money ? fmt(payload[0].value) : payload[0].value}</p>
    </div>
  );
};

// ─── main ────────────────────────────────────────────────────────────────────

export default function Dashboard({ orders }: Props) {
  const [sortKey, _setSortKey] = useState<SortKey>("id");
  const [sortDir, _setSortDir] = useState<SortDir>("desc");
  const [visibleCols, _setVisibleCols] = useState<Set<SortKey>>(new Set(ALL_COLUMNS.map(c => c.key)));
  const [perPage, _setPerPage] = useState<number>(25);
  const [page, setPage] = useState(1);

  // filters
  const [dateFrom, _setDateFrom] = useState("");
  const [dateTo, _setDateTo] = useState("");
  const [filterCity, _setFilterCity] = useState("");
  const [filterSource, _setFilterSource] = useState("");
  const [filterStatus, _setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [activePreset, setActivePreset] = useState(0);

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    _setSortKey(ls(LS.sortKey, "id") as SortKey);
    _setSortDir(ls(LS.sortDir, "desc") as SortDir);
    _setVisibleCols(new Set(ls<SortKey[]>(LS.visibleCols, ALL_COLUMNS.map(c => c.key))));
    _setPerPage(ls(LS.perPage, 25));
    _setDateFrom(ls(LS.dateFrom, ""));
    _setDateTo(ls(LS.dateTo, ""));
    _setFilterCity(ls(LS.filterCity, ""));
    _setFilterSource(ls(LS.filterSource, ""));
    _setFilterStatus(ls(LS.filterStatus, ""));
    setHydrated(true);
  }, []);

  const setSortKey = useCallback((k: SortKey) => { _setSortKey(k); lsSet(LS.sortKey, k); }, []);
  const setSortDir = useCallback((d: SortDir) => { _setSortDir(d); lsSet(LS.sortDir, d); }, []);
  const setVisibleCols = useCallback((s: Set<SortKey>) => { _setVisibleCols(s); lsSet(LS.visibleCols, [...s]); }, []);
  const setPerPage = useCallback((n: number) => { _setPerPage(n); lsSet(LS.perPage, n); }, []);
  const setDateFrom = useCallback((v: string) => { _setDateFrom(v); lsSet(LS.dateFrom, v); setPage(1); }, []);
  const setDateTo = useCallback((v: string) => { _setDateTo(v); lsSet(LS.dateTo, v); setPage(1); }, []);
  const setFilterCity = useCallback((v: string) => { _setFilterCity(v); lsSet(LS.filterCity, v); setPage(1); }, []);
  const setFilterSource = useCallback((v: string) => { _setFilterSource(v); lsSet(LS.filterSource, v); setPage(1); }, []);
  const setFilterStatus = useCallback((v: string) => { _setFilterStatus(v); lsSet(LS.filterStatus, v); setPage(1); }, []);

  function applyPreset(days: number, idx: number) {
    setActivePreset(idx);
    if (days === 0) { setDateFrom(""); setDateTo(""); return; }
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setDateFrom(from.toISOString().slice(0, 10));
    setDateTo(to.toISOString().slice(0, 10));
  }

  function resetFilters() {
    setDateFrom(""); setDateTo("");
    setFilterCity(""); setFilterSource(""); setFilterStatus("");
    setSearch(""); setActivePreset(3);
  }

  // ── filter options (unique values from data) ──
  const cities = useMemo(() => [...new Set(orders.map(o => o.city).filter(Boolean))].sort(), [orders]);
  const sources = useMemo(() => [...new Set(orders.map(o => o.utm_source || "direct"))].sort(), [orders]);
  const statuses = useMemo(() => [...new Set(orders.map(o => o.status).filter(Boolean))].sort(), [orders]);

  // ── apply filters ──
  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (dateFrom && o.created_at && o.created_at.slice(0, 10) < dateFrom) return false;
      if (dateTo && o.created_at && o.created_at.slice(0, 10) > dateTo) return false;
      if (filterCity && o.city !== filterCity) return false;
      if (filterSource && (o.utm_source || "direct") !== filterSource) return false;
      if (filterStatus && o.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = `${o.first_name} ${o.last_name}`.toLowerCase();
        if (!name.includes(q) && !String(o.phone ?? "").includes(q)) return false;
      }
      return true;
    });
  }, [orders, dateFrom, dateTo, filterCity, filterSource, filterStatus, search]);

  const activeFiltersCount = [dateFrom || dateTo, filterCity, filterSource, filterStatus, search].filter(Boolean).length;

  // ── stats ──
  const totalRevenue = filtered.reduce((s, o) => s + Number(o.total), 0);
  const avgCheck = filtered.length ? Math.round(totalRevenue / filtered.length) : 0;
  const bigOrders = filtered.filter(o => Number(o.total) > 50000).length;

  const cityMap: Record<string, number> = {};
  for (const o of filtered) { if (o.city) cityMap[o.city] = (cityMap[o.city] ?? 0) + 1; }

  const byDate = useMemo(() => groupByDate(filtered), [filtered]);
  const bySource = useMemo(() => groupBySource(filtered), [filtered]);

  // ── sort & paginate ──
  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  }

  function toggleCol(key: SortKey) {
    const next = new Set(visibleCols);
    if (next.has(key)) { if (next.size > 2) next.delete(key); } else next.add(key);
    setVisibleCols(next);
  }

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? ""; const bv = b[sortKey] ?? "";
    const cmp = typeof av === "number" && typeof bv === "number"
      ? av - bv : String(av).localeCompare(String(bv), "ru");
    return sortDir === "asc" ? cmp : -cmp;
  }), [filtered, sortKey, sortDir]);

  const paginated = sorted.slice((page - 1) * perPage, page * perPage);

  if (!hydrated) return null;

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-baseline gap-3">
          <h1 className="text-xl font-bold text-gray-900">GBC Analytics</h1>
          <span className="text-sm text-gray-400">Tomyris · заказы</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6 space-y-5">

        {/* ── Filter bar ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Date presets */}
            <div className="flex rounded-xl overflow-hidden border border-gray-200">
              {DATE_PRESETS.map((p, i) => (
                <button key={p.label} onClick={() => applyPreset(p.days, i)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    activePreset === i ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-50"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom date range */}
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePreset(-1); }}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <span className="text-gray-400 text-sm">—</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePreset(-1); }}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300" />

            {activeFiltersCount > 0 && (
              <button onClick={resetFilters}
                className="ml-auto flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Сбросить ({activeFiltersCount})
              </button>
            )}
          </div>

          {/* Dropdowns + search */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-40">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Поиск по клиенту..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 text-gray-700 placeholder-gray-400" />
            </div>
            <Select value={filterCity} onChange={setFilterCity} options={cities} placeholder="Все города" />
            <Select value={filterSource} onChange={setFilterSource} options={sources} placeholder="Все источники" />
            <Select value={filterStatus} onChange={setFilterStatus}
              options={statuses}
              placeholder="Все статусы" />
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Заказов" value={filtered.length}
            sub={filtered.length !== orders.length ? `из ${orders.length} всего` : undefined} accent />
          <StatCard label="Выручка" value={fmt(totalRevenue)} />
          <StatCard label="Средний чек" value={fmt(avgCheck)} sub="за заказ" />
          <StatCard label="Крупные заказы" value={bigOrders} sub="> 50 000 ₸" />
        </div>

        {/* ── Charts ── */}
        <div className="grid md:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Заказы по дням</h2>
              <span className="text-xs text-gray-400">{byDate.length} дн.</span>
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={byDate} barSize={10}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={v => v.slice(5)}
                  axisLine={false} tickLine={false} interval={Math.floor(byDate.length / 6)} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f3f4f6" }} />
                <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Выручка по источнику</h2>
              <span className="text-xs text-gray-400">utm_source</span>
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={bySource} layout="vertical" barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={v => `${Math.round(v / 1000)}k`}
                  axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="source" tick={{ fontSize: 11, fill: "#6b7280" }} width={72} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip money />} cursor={{ fill: "#f3f4f6" }} />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                  {bySource.map(e => <Cell key={e.source} fill={SOURCE_COLORS[e.source] ?? SOURCE_COLORS.other} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Cities ── */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Топ города</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(cityMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([city, count]) => (
              <button key={city} onClick={() => setFilterCity(filterCity === city ? "" : city)}
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 transition-colors ${
                  filterCity === city ? "bg-indigo-100 text-indigo-700 border border-indigo-200" : "bg-gray-50 hover:bg-gray-100"
                }`}>
                <span className="text-sm font-medium">{city}</span>
                <span className="text-xs text-gray-400">{count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Заказы</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {filtered.length !== orders.length
                  ? `${filtered.length} из ${orders.length}`
                  : `всего ${orders.length}`}
              </p>
            </div>
            <ColumnsDropdown columns={ALL_COLUMNS} visible={visibleCols} onToggle={toggleCol} />
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-2">🔍</p>
              <p className="text-sm">Нет заказов по заданным фильтрам</p>
              <button onClick={resetFilters} className="mt-3 text-xs text-indigo-500 hover:underline">Сбросить фильтры</button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {ALL_COLUMNS.filter(c => visibleCols.has(c.key)).map(col => (
                        <th key={col.key} onClick={() => handleSort(col.key)}
                          className={`px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700 transition-colors ${col.key === "total" ? "text-right" : "text-left"}`}>
                          {col.label}<SortIcon dir={sortKey === col.key ? sortDir : null} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(o => {
                      const isBig = Number(o.total) > 50000;
                      const sc = STATUS_COLORS[o.status] ?? "#94a3b8";
                      return (
                        <tr key={o.id} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
                          {visibleCols.has("id") && <td className="px-4 py-3 text-gray-400 font-mono text-xs">#{o.id}</td>}
                          {visibleCols.has("first_name") && <td className="px-4 py-3 font-medium text-gray-800">{o.first_name} {o.last_name}</td>}
                          {visibleCols.has("city") && <td className="px-4 py-3 text-gray-500">{o.city || "—"}</td>}
                          {visibleCols.has("utm_source") && (
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                                style={{ background: (SOURCE_COLORS[o.utm_source] ?? "#94a3b8") + "18", color: SOURCE_COLORS[o.utm_source] ?? "#64748b" }}>
                                {o.utm_source || "direct"}
                              </span>
                            </td>
                          )}
                          {visibleCols.has("status") && (
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                                style={{ background: sc + "18", color: sc }}>
                                {STATUS_LABELS[o.status] ?? o.status}
                              </span>
                            </td>
                          )}
                          {visibleCols.has("total") && (
                            <td className={`px-4 py-3 text-right font-semibold ${isBig ? "text-indigo-600" : "text-gray-900"}`}>
                              {fmt(o.total)}{isBig && <span className="ml-1 text-indigo-400 text-xs">↑</span>}
                            </td>
                          )}
                          {visibleCols.has("created_at") && <td className="px-4 py-3 text-gray-400 text-xs">{o.created_at?.slice(0, 10) ?? "—"}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} total={sorted.length} perPage={perPage}
                onPage={setPage} onPerPage={n => { setPerPage(n); setPage(1); }} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
