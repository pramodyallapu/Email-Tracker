import { Badge } from "@/components/ui/Badge";
import { formatReplyTime } from "@/lib/metrics/reply-time";
import { AlertTriangle, Check, Clock } from "lucide-react";

export type InboxStatus = "replied" | "pending" | "breach";

export function StatusBadge({
  status,
  replyTimeSecs,
  waitingSecs,
}: {
  status: InboxStatus;
  replyTimeSecs?: number | null;
  waitingSecs?: number;
}) {
  if (status === "replied") {
    return (
      <Badge variant="success" className="gap-1">
        <Check className="h-3 w-3" aria-hidden />
        {replyTimeSecs != null ? formatReplyTime(replyTimeSecs) : "Replied"}
      </Badge>
    );
  }

  if (status === "breach") {
    return (
      <Badge variant="danger" className="gap-1">
        <AlertTriangle className="h-3 w-3" aria-hidden />
        SLA breach
        {waitingSecs != null && ` · ${formatReplyTime(waitingSecs)}`}
      </Badge>
    );
  }

  return (
    <Badge variant="warning" className="gap-1">
      <Clock className="h-3 w-3" aria-hidden />
      Pending
      {waitingSecs != null && ` · ${formatReplyTime(waitingSecs)}`}
    </Badge>
  );
}
