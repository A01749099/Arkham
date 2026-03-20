import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface Props { title: string; value: string | number; change?: string; changeType?: "positive" | "negative" | "neutral"; icon: LucideIcon }

export function MetricCard({ title, value, change, changeType = "neutral", icon: Icon }: Props) {
  const color = changeType === "positive" ? "text-success" : changeType === "negative" ? "text-destructive" : "text-muted-foreground";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-card p-6 shadow-card transition-shadow hover:shadow-card-hover">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <h3 className="text-2xl font-semibold tracking-tight tabular-nums">{value}</h3>
        {change && <span className={`text-xs font-medium ${color}`}>{change}</span>}
      </div>
    </motion.div>
  );
}
