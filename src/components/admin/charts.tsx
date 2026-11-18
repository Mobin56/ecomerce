"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/core/money";
import { compactNumber } from "@/lib/utils";

type Point = Record<string, number | string>;
const axis = { fontSize: 11, fill: "#6f6e69" };

export function TrendChart({ data, dataKey, kind = "money", type = "area", height = 220 }: { data: Point[]; dataKey: string; kind?: "money" | "count" | "percent"; type?: "area" | "bar" | "line"; height?: number }) {
  const fmt = (v: number) => (kind === "money" ? formatMoney(v) : kind === "percent" ? `${(v * 100).toFixed(1)}%` : compactNumber(v));
  const tick = (v: number) => (kind === "money" ? `৳${compactNumber(v / 100)}` : kind === "percent" ? `${(v * 100).toFixed(0)}%` : compactNumber(v));
  const common = { data, margin: { top: 8, right: 8, left: 0, bottom: 0 } };
  const children = [
    <CartesianGrid key="g" stroke="#e7e5df" vertical={false} />,
    <XAxis key="x" dataKey="day" tick={axis} tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} minTickGap={20} />,
    <YAxis key="y" tick={axis} tickLine={false} axisLine={false} width={52} tickFormatter={tick} />,
    <Tooltip key="t" formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e7e5df", fontSize: 12 }} />,
  ];
  return (
    <div style={{ height }} role="img" aria-label={`${dataKey} chart`}>
      <ResponsiveContainer>
        {type === "bar" ? (
          <BarChart {...common}>{children}<Bar dataKey={dataKey} fill="#141414" radius={[4, 4, 0, 0]} /></BarChart>
        ) : type === "line" ? (
          <LineChart {...common}>{children}<Line dataKey={dataKey} stroke="#141414" strokeWidth={2} dot={false} /></LineChart>
        ) : (
          <AreaChart {...common}>
            <defs><linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#141414" stopOpacity={0.18} /><stop offset="100%" stopColor="#141414" stopOpacity={0} /></linearGradient></defs>
            {children}
            <Area dataKey={dataKey} stroke="#141414" strokeWidth={2} fill={`url(#g-${dataKey})`} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
