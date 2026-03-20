import { Atom, BarChart3, LineChart } from "lucide-react";

export type DashboardView = "dashboard" | "graphics";

const NAV = [
  { key: "dashboard" as const, label: "Dashboard", icon: BarChart3 },
  { key: "graphics" as const, label: "Graphics", icon: LineChart },
];

interface SidebarProps {
  activeView: DashboardView;
  onChangeView: (view: DashboardView) => void;
}

export function Sidebar({ activeView, onChangeView }: SidebarProps) {
  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-sidebar">
      <div className="flex items-center gap-2.5 px-6 py-5">
        <Atom className="h-5 w-5 text-primary" strokeWidth={1.5} />
        <span className="text-sm font-semibold tracking-tight">Nuclear Outages</span>
      </div>
      <nav className="mt-2 flex-1 px-3">
        {NAV.map(n => {
          const isActive = activeView === n.key;
          return (
          <button key={n.label} onClick={() => onChangeView(n.key)} className={`relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${isActive ? "bg-primary/10 font-medium text-primary before:absolute before:left-0 before:top-1/2 before:h-5 before:-translate-y-1/2 before:w-0.5 before:rounded-full before:bg-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
            <n.icon className="h-4 w-4" strokeWidth={1.5} />{n.label}
          </button>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border px-6 py-4">
        <p className="text-xs text-muted-foreground">EIA Data Pipeline</p>
        <p className="text-xs text-muted-foreground/60">v1.0.0 — Demo Mode</p>
      </div>
    </aside>
  );
}
