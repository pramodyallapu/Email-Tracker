"use client";

import {
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatReplyTime } from "@/lib/metrics/reply-time";

export interface ReplyTimeChartProps {
  data: { date: string; avgSecs: number; replyRate: number }[];
}

export function ReplyTimeChart({ data }: ReplyTimeChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reply time & rate</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              stroke="#d1d5db"
            />
            <YAxis
              yAxisId="left"
              tickFormatter={(v) => formatReplyTime(v)}
              tick={{ fill: "#6b7280" }}
              stroke="#d1d5db"
              width={70}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(v) => `${v}%`}
              tick={{ fill: "#6b7280" }}
              stroke="#d1d5db"
              domain={[0, 100]}
            />
            <Tooltip
              formatter={(value: number, name: string) =>
                name === "avgSecs"
                  ? formatReplyTime(value)
                  : `${value.toFixed(1)}%`
              }
            />
            <Legend wrapperStyle={{ color: "#374151" }} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="avgSecs"
              name="Avg reply time"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="replyRate"
              name="Reply rate %"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
