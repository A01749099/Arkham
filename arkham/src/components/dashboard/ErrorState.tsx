import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-card py-16 shadow-card">
      <AlertTriangle className="h-10 w-10 text-destructive/60" strokeWidth={1.5} />
      <h3 className="mt-4 text-sm font-medium">Something went wrong</h3>
      <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      <Button size="sm" className="mt-4" onClick={onRetry}>Try Again</Button>
    </div>
  );
}
