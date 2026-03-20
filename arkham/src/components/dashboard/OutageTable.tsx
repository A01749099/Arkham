import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { OutageRecord } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

const COLS = [
  { key: "date_id", label: "Date" },
  { key: "capacity_mw", label: "Capacity (MW)" },
  { key: "outage_mw", label: "Outage (MW)" },
  { key: "available_mw", label: "Available (MW)" },
  { key: "percent_outage", label: "% Outage" },
];

export function OutageTable({ data, sortBy, sortOrder, onSort }: { data: OutageRecord[]; sortBy: string; sortOrder: "asc" | "desc"; onSort: (c: string) => void }) {
  const SortIcon = ({ c }: { c: string }) => sortBy !== c ? <ArrowUpDown className="h-3 w-3 opacity-40" /> : sortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  return (
    <div className="overflow-x-auto rounded-xl shadow-card">
      <table className="w-full text-sm">
        <thead><tr className="bg-muted/50">
          {COLS.map(c => <th key={c.key} onClick={() => onSort(c.key)} className="cursor-pointer whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"><div className="flex items-center gap-1.5">{c.label}<SortIcon c={c.key} /></div></th>)}
        </tr></thead>
        <tbody className="divide-y divide-border/50"><AnimatePresence>
          {data.map(r => (
            <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} layout className="h-11 transition-colors duration-150 hover:bg-muted/50">
              <td className="px-4 py-2 font-medium tabular-nums">{r.dateId}</td>
              <td className="px-4 py-2 tabular-nums">{r.capacityMW.toLocaleString()}</td>
              <td className="px-4 py-2 tabular-nums text-destructive">{r.outageMW.toLocaleString()}</td>
              <td className="px-4 py-2 tabular-nums text-success">{r.availableMW.toLocaleString()}</td>
              <td className="px-4 py-2 tabular-nums text-muted-foreground">{r.percentOutage.toFixed(2)}%</td>
            </motion.tr>
          ))}
        </AnimatePresence></tbody>
      </table>
    </div>
  );
}
