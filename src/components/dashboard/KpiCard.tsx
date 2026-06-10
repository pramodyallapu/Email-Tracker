import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import type { Trend } from "@/types/email";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

export interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: Trend;
  trendLabel?: string;
  loading?: boolean;
}

const trendStyles: Record<Trend, { icon: typeof ArrowUp; className: string }> = {
  up: { icon: ArrowUp, className: "text-green-600" },
  down: { icon: ArrowDown, className: "text-red-600" },
  flat: { icon: Minus, className: "text-gray-400" },
};

export function KpiCard({
  title,
  value,
  subtitle,
  trend = "flat",
  trendLabel,
  loading,
}: KpiCardProps) {
  const TrendIcon = trendStyles[trend].icon;

  return (
    <Card className="border border-gray-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-500">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <div className="mt-2 flex items-center gap-2">
              {trendLabel && (
                <>
                  <TrendIcon
                    className={cn("h-4 w-4", trendStyles[trend].className)}
                    aria-hidden
                  />
                  <span
                    className={cn("text-xs font-medium", trendStyles[trend].className)}
                  >
                    {trendLabel}
                  </span>
                </>
              )}
              {subtitle && (
                <span className="text-xs text-gray-500">{subtitle}</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
