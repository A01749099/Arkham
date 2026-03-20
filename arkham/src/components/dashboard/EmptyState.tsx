import { DatabaseZap } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-card py-16 shadow-card">
      <DatabaseZap className="h-10 w-10 text-muted-foreground/50" strokeWidth={1.5} />
      <h3 className="mt-4 text-sm font-medium">No outage data found</h3>
      <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters or refresh the data.</p>
    </div>
  );
}
