const DEFAULT_API_BASE = "https://arkham-256168003105.us-central1.run.app";
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE).trim();

export interface OutageRecord {
  id: string;
  dateId: string;
  capacityMW: number;
  outageMW: number;
  availableMW: number;
  percentOutage: number;
  extractedAt: string | null;
}

export interface ApiResponse<T> {
  data: T;
  total: number;
  page: number;
  limit: number;
}

export interface OutageFilters {
  startDate?: string;
  endDate?: string;
  minPercentOutage?: number;
  maxPercentOutage?: number;
  page?: number;
  limit?: number;
  sortBy?: "date_id" | "capacity_mw" | "outage_mw" | "available_mw" | "percent_outage";
  order?: "asc" | "desc";
}

const MOCK: OutageRecord[] = [
  { id: "2023-01-01", dateId: "2023-01-01", capacityMW: 100032.4, outageMW: 10743.3, availableMW: 89289.1, percentOutage: 10.74, extractedAt: null },
  { id: "2023-02-01", dateId: "2023-02-01", capacityMW: 100013.0, outageMW: 3173.1, availableMW: 96839.9, percentOutage: 3.17, extractedAt: null },
  { id: "2023-03-01", dateId: "2023-03-01", capacityMW: 100013.0, outageMW: 14543.6, availableMW: 85469.4, percentOutage: 14.54, extractedAt: null },
  { id: "2023-04-01", dateId: "2023-04-01", capacityMW: 100013.0, outageMW: 13153.7, availableMW: 86859.3, percentOutage: 13.15, extractedAt: null },
  { id: "2023-05-01", dateId: "2023-05-01", capacityMW: 100013.0, outageMW: 6793.2, availableMW: 93219.8, percentOutage: 6.79, extractedAt: null },
  { id: "2023-06-01", dateId: "2023-06-01", capacityMW: 100013.0, outageMW: 5202.7, availableMW: 94810.3, percentOutage: 5.20, extractedAt: null },
  { id: "2023-07-01", dateId: "2023-07-01", capacityMW: 100013.0, outageMW: 10365.2, availableMW: 89647.8, percentOutage: 10.36, extractedAt: null },
  { id: "2023-08-01", dateId: "2023-08-01", capacityMW: 100013.0, outageMW: 12213.6, availableMW: 87799.4, percentOutage: 12.21, extractedAt: null },
  { id: "2023-09-01", dateId: "2023-09-01", capacityMW: 100013.0, outageMW: 9389.8, availableMW: 90623.2, percentOutage: 9.39, extractedAt: null },
  { id: "2023-10-01", dateId: "2023-10-01", capacityMW: 100013.0, outageMW: 13111.2, availableMW: 86901.8, percentOutage: 13.11, extractedAt: null },
  { id: "2023-11-01", dateId: "2023-11-01", capacityMW: 100013.0, outageMW: 13438.7, availableMW: 86574.3, percentOutage: 13.44, extractedAt: null },
  { id: "2023-12-01", dateId: "2023-12-01", capacityMW: 100013.0, outageMW: 14599.6, availableMW: 85413.4, percentOutage: 14.60, extractedAt: null },
];

export async function fetchOutages(f: OutageFilters): Promise<ApiResponse<OutageRecord[]>> {
  try {
    const p = new URLSearchParams();
    if (f.startDate) p.set("start_date", f.startDate);
    if (f.endDate) p.set("end_date", f.endDate);
    if (typeof f.minPercentOutage === "number") p.set("min_percent_outage", String(f.minPercentOutage));
    if (typeof f.maxPercentOutage === "number") p.set("max_percent_outage", String(f.maxPercentOutage));
    if (f.page) p.set("page", String(f.page));
    if (f.limit) p.set("limit", String(f.limit));
    if (f.sortBy) p.set("sort_by", f.sortBy);
    if (f.order) p.set("order", f.order);

    const res = await fetch(`${API_BASE}/data?${p}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    return normalizeOutagesResponse(payload, f);
  } catch {
    return mockFetch(f);
  }
}

export async function refreshData(): Promise<{ message: string }> {
  try {
    const res = await fetch(`${API_BASE}/refresh`, { method: "POST", signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = (await res.json()) as Record<string, unknown>;
    return { message: String(payload.message ?? "Pipeline executed successfully") };
  } catch {
    return { message: "Refresh failed or unavailable. Showing latest available data." };
  }
}

function normalizeOutagesResponse(payload: unknown, f: OutageFilters): ApiResponse<OutageRecord[]> {
  const p = payload as Record<string, unknown>;
  const m = (p.meta ?? {}) as Record<string, unknown>;
  const sourceRows = Array.isArray(p.data) ? (p.data as Array<Record<string, unknown>>) : [];

  const data = sourceRows.map((row, i) => ({
    id: String(row.date_id ?? i),
    dateId: String(row.date_id ?? ""),
    capacityMW: Number(row.capacity_mw ?? 0),
    outageMW: Number(row.outage_mw ?? 0),
    availableMW: Number(row.available_mw ?? 0),
    percentOutage: Number(row.percent_outage ?? 0),
    extractedAt: row.extracted_at == null ? null : String(row.extracted_at),
  }));

  return {
    data,
    total: Number(m.total_records ?? data.length),
    page: Number(m.page ?? f.page ?? 1),
    limit: Number(m.limit ?? f.limit ?? 100),
  };
}

function mockFetch(f: OutageFilters): ApiResponse<OutageRecord[]> {
  let rows = [...MOCK];

  if (f.startDate) rows = rows.filter(r => r.dateId >= f.startDate!);
  if (f.endDate) rows = rows.filter(r => r.dateId <= f.endDate!);
  if (typeof f.minPercentOutage === "number") rows = rows.filter(r => r.percentOutage >= f.minPercentOutage!);
  if (typeof f.maxPercentOutage === "number") rows = rows.filter(r => r.percentOutage <= f.maxPercentOutage!);

  const sortBy = f.sortBy ?? "date_id";
  const direction = f.order === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const va = pickSortValue(a, sortBy);
    const vb = pickSortValue(b, sortBy);
    return va > vb ? direction : va < vb ? -direction : 0;
  });

  const page = f.page ?? 1;
  const limit = f.limit ?? 100;
  const start = (page - 1) * limit;

  return {
    data: rows.slice(start, start + limit),
    total: rows.length,
    page,
    limit,
  };
}

function pickSortValue(row: OutageRecord, sortBy: NonNullable<OutageFilters["sortBy"]>) {
  if (sortBy === "date_id") return row.dateId;
  if (sortBy === "capacity_mw") return row.capacityMW;
  if (sortBy === "outage_mw") return row.outageMW;
  if (sortBy === "available_mw") return row.availableMW;
  return row.percentOutage;
}
