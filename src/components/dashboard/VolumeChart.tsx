"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

export interface VolumeChartProps {
  data: { date: string; received: number; sent: number }[];
}

export function VolumeChart({ data }: VolumeChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Email volume</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#6b7280" }}
              stroke="#d1d5db"
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis tick={{ fill: "#6b7280" }} stroke="#d1d5db" />
            <Tooltip
              formatter={(value: number, name: string) => [
                value,
                name === "received" ? "Received" : "Sent",
              ]}
              labelFormatter={(label) => `Date: ${label}`}
            />
            <Legend wrapperStyle={{ color: "#374151" }} />
            <Bar dataKey="received" stackId="a" fill="#93c5fd" name="Received" />
            <Bar dataKey="sent" stackId="a" fill="#6366f1" name="Sent" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
