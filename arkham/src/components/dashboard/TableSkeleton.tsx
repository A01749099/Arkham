import { Skeleton } from "@/components/ui";

export function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl shadow-card">
      <div className="bg-muted/50 px-4 py-3"><div className="flex gap-8">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-3 w-20" />)}</div></div>
      {Array.from({ length: 6 }, (_, i) => <div key={i} className="flex gap-8 border-b border-border/50 px-4 py-3">{Array.from({ length: 8 }, (_, j) => <Skeleton key={j} className="h-4 w-20" />)}</div>)}
    </div>
  );
}
