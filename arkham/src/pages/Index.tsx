import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Activity, Server, Gauge, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { fetchOutages, refreshData, OutageFilters } from "@/lib/api";
import { Sidebar, DashboardView } from "@/components/dashboard/Sidebar";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { OutageTable } from "@/components/dashboard/OutageTable";
import { TableSkeleton } from "@/components/dashboard/TableSkeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ErrorState } from "@/components/dashboard/ErrorState";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const DEFAULT_FILTERS: Required<OutageFilters> = {
  startDate: "2023-01-01",
  endDate: "2023-12-31",
  minPercentOutage: 0,
  maxPercentOutage: 10,
  page: 1,
  limit: 100,
  sortBy: "date_id",
  order: "desc",
};

const SORT_OPTIONS = [
  { value: "date_id", label: "Date" },
  { value: "capacity_mw", label: "Capacity MW" },
  { value: "outage_mw", label: "Outage MW" },
  { value: "available_mw", label: "Available MW" },
  { value: "percent_outage", label: "% Outage" },
];

const ORDER_OPTIONS = [
  { value: "desc", label: "Descending" },
  { value: "asc", label: "Ascending" },
];

const LIMIT_OPTIONS = [25, 50, 100, 200];

const MONTH_PEAK_COLOR = "#f97316";
const MONTH_NORMAL_COLOR = "#3b82f6";
const YEAR_BAR_COLOR = "#10b981";

export default function Index() {
  const qc = useQueryClient();
  const [view, setView] = useState<DashboardView>("dashboard");
  const [filters, setFilters] = useState<Required<OutageFilters>>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<Required<OutageFilters>>(DEFAULT_FILTERS);

  const q = useQuery({ queryKey: ["outages", filters], queryFn: () => fetchOutages(filters) });
  const refresh = useMutation({
    mutationFn: refreshData,
    onSuccess: r => { toast.success(r.message); qc.invalidateQueries({ queryKey: ["outages"] }); },
    onError: () => toast.error("Failed to refresh data."),
  });

  const rows = q.data?.data || [];

  const avgPercentOutage = useMemo(() => {
    if (!rows.length) return 0;
    return rows.reduce((sum, r) => sum + r.percentOutage, 0) / rows.length;
  }, [rows]);

  const peakOutageMW = useMemo(() => {
    if (!rows.length) return 0;
    return rows.reduce((max, r) => Math.max(max, r.outageMW), 0);
  }, [rows]);

  const avgAvailableMW = useMemo(() => {
    if (!rows.length) return 0;
    return rows.reduce((sum, r) => sum + r.availableMW, 0) / rows.length;
  }, [rows]);

  const trendData = useMemo(() => (
    rows
      .slice()
      .sort((a, b) => a.dateId.localeCompare(b.dateId))
      .map(r => ({
        date: r.dateId.slice(0, 7),
        outageMW: r.outageMW,
      }))
  ), [rows]);

  const monthlyAvgOutageData = useMemo(() => {
    const byMonth = new Map<string, { sum: number; count: number }>();
    rows.forEach(r => {
      const month = r.dateId.slice(5, 7);
      if (!month) return;
      const prev = byMonth.get(month) ?? { sum: 0, count: 0 };
      byMonth.set(month, { sum: prev.sum + r.outageMW, count: prev.count + 1 });
    });

    return Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({
        month,
        avgOutageMW: v.count ? v.sum / v.count : 0,
        isPeakSeason: month === "03" || month === "04" || month === "05",
      }));
  }, [rows]);

  const yearlyAvgPercentData = useMemo(() => {
    const byYear = new Map<string, { sum: number; count: number }>();
    rows.forEach(r => {
      const year = r.dateId.slice(0, 4);
      if (!year) return;
      const prev = byYear.get(year) ?? { sum: 0, count: 0 };
      byYear.set(year, { sum: prev.sum + r.percentOutage, count: prev.count + 1 });
    });

    return Array.from(byYear.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([year, v]) => ({
        year,
        avgPercentOutage: v.count ? v.sum / v.count : 0,
      }));
  }, [rows]);

  const handleApplyFilters = () => {
    const min = Number(draftFilters.minPercentOutage);
    const max = Number(draftFilters.maxPercentOutage);
    if (Number.isNaN(min) || Number.isNaN(max) || min > max) {
      toast.error("Invalid outage range. Ensure min <= max.");
      return;
    }
    setFilters({ ...draftFilters, page: 1, minPercentOutage: min, maxPercentOutage: max });
  };

  const handleResetFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
  };

  const handleSort = (col: string) => {
    const sortBy = col as Required<OutageFilters>["sortBy"];
    if (!SORT_OPTIONS.some(s => s.value === sortBy)) return;
    const nextOrder = filters.sortBy === sortBy && filters.order === "asc" ? "desc" : "asc";
    setFilters(prev => ({ ...prev, sortBy, order: nextOrder }));
    setDraftFilters(prev => ({ ...prev, sortBy, order: nextOrder }));
  };

  const goToPage = (nextPage: number) => {
    setFilters(prev => ({ ...prev, page: nextPage }));
    setDraftFilters(prev => ({ ...prev, page: nextPage }));
  };

  const currentPage = q.data?.page ?? filters.page;
  const currentLimit = q.data?.limit ?? filters.limit;
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / currentLimit));

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar activeView={view} onChangeView={setView} />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold" style={{ letterSpacing: "-0.02em" }}>
              {view === "dashboard" ? "Nuclear Outages Dashboard" : "Nuclear Outages Graphics"}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {view === "dashboard" ? "EIA Open Data — Real-time outage monitoring" : "Visual analysis from filtered API data"}
            </p>
          </div>
          {view === "dashboard" && (
            <Button size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} strokeWidth={1.5} />
              {refresh.isPending ? "Refreshing…" : "Refresh Data"}
            </Button>
          )}
        </div>

        {view === "dashboard" ? (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard title="Total Records" value={q.data?.total ?? "—"} icon={Server} />
              <MetricCard title="Average % Outage" value={`${avgPercentOutage.toFixed(2)}%`} icon={Gauge} />
              <MetricCard title="Peak Outage" value={`${peakOutageMW.toLocaleString()} MW`} icon={Activity} />
              <MetricCard title="Avg Available" value={`${avgAvailableMW.toLocaleString(undefined, { maximumFractionDigits: 0 })} MW`} icon={TrendingUp} />
            </div>

            <Card className="mt-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Filters</CardTitle>
                <CardDescription>Apply API filters to request data from /data endpoint.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Start Date</label>
                    <Input type="date" value={draftFilters.startDate} onChange={e => setDraftFilters(prev => ({ ...prev, startDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">End Date</label>
                    <Input type="date" value={draftFilters.endDate} onChange={e => setDraftFilters(prev => ({ ...prev, endDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Min % Outage</label>
                    <Input type="number" min={0} max={100} step={0.1} value={draftFilters.minPercentOutage} onChange={e => setDraftFilters(prev => ({ ...prev, minPercentOutage: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Max % Outage</label>
                    <Input type="number" min={0} max={100} step={0.1} value={draftFilters.maxPercentOutage} onChange={e => setDraftFilters(prev => ({ ...prev, maxPercentOutage: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Sort By</label>
                    <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draftFilters.sortBy} onChange={e => setDraftFilters(prev => ({ ...prev, sortBy: e.target.value as Required<OutageFilters>["sortBy"] }))}>
                      {SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Order</label>
                    <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draftFilters.order} onChange={e => setDraftFilters(prev => ({ ...prev, order: e.target.value as Required<OutageFilters>["order"] }))}>
                      {ORDER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Limit</label>
                    <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draftFilters.limit} onChange={e => setDraftFilters(prev => ({ ...prev, limit: Number(e.target.value) }))}>
                      {LIMIT_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={handleApplyFilters}>Apply Filters</Button>
                  <Button size="sm" variant="outline" onClick={handleResetFilters}>Reset</Button>
                </div>
              </CardContent>
            </Card>

            <div className="mt-4">
              {q.isLoading ? <TableSkeleton /> : q.isError ? <ErrorState message={(q.error as Error)?.message || "Could not load data"} onRetry={() => q.refetch()} /> : rows.length === 0 ? <EmptyState /> : <OutageTable data={rows} sortBy={filters.sortBy || ""} sortOrder={filters.order || "asc"} onSort={handleSort} />}
            </div>

            {total > currentLimit && (
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Showing {(currentPage - 1) * currentLimit + 1}–{Math.min(currentPage * currentLimit, total)} of {total}
                  {` `}(Page {currentPage} of {totalPages})
                </span>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">1 — Tendencia diaria de outage (MW) — linea</CardTitle>
                <CardDescription>Muestra como varia el outage dia a dia a lo largo del tiempo.</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ left: 8, right: 8, top: 12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => Number(v).toLocaleString()} />
                    <Tooltip formatter={v => Number(v).toLocaleString()} />
                    <Area type="monotone" dataKey="outageMW" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.12} strokeWidth={2.5} name="Outage MW" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">2 — Promedio mensual de outage — barras</CardTitle>
                <CardDescription>Compara el outage promedio por mes y resalta meses pico.</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyAvgOutageData} margin={{ left: 8, right: 8, top: 12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => Number(v).toLocaleString()} />
                    <Tooltip formatter={v => Number(v).toLocaleString()} />
                    <Bar dataKey="avgOutageMW" name="Avg Outage MW" radius={[4, 4, 0, 0]}>
                      {monthlyAvgOutageData.map((entry, i) => (
                        <Cell key={`${entry.month}-${i}`} fill={entry.isPeakSeason ? MONTH_PEAK_COLOR : MONTH_NORMAL_COLOR} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">3 — % de outage promedio por año — barras horizontales</CardTitle>
                <CardDescription>Que tan alto fue el porcentaje de outage cada año en promedio.</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={yearlyAvgPercentData} layout="vertical" margin={{ left: 8, right: 8, top: 12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${Number(v).toFixed(0)}%`} />
                    <YAxis type="category" dataKey="year" tick={{ fontSize: 11 }} width={42} />
                    <Tooltip formatter={v => `${Number(v).toFixed(2)}%`} />
                    <Bar dataKey="avgPercentOutage" name="Avg % Outage" radius={[0, 4, 4, 0]}>
                      {yearlyAvgPercentData.map((entry, i) => <Cell key={`${entry.year}-${i}`} fill={YEAR_BAR_COLOR} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {rows.length === 0 && (
              <Card className="lg:col-span-2">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No chart data available for the current filters.
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
