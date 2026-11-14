"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const axis = { stroke: "#8b98a9", fontSize: 11, tickLine: false, axisLine: false } as const;
const tip = { contentStyle: { background: "#121821", border: "1px solid #1e2632", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "#8b98a9" } };

export function EquityChart({ data, height = 240 }: { data: { t: string; equity: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <defs><linearGradient id="eq" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4cc38a" stopOpacity={0.35} /><stop offset="100%" stopColor="#4cc38a" stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid stroke="#1e2632" vertical={false} />
        <XAxis dataKey="t" {...axis} minTickGap={40} />
        <YAxis {...axis} domain={["auto", "auto"]} width={64} />
        <Tooltip {...tip} />
        <Area type="monotone" dataKey="equity" stroke="#4cc38a" strokeWidth={2} fill="url(#eq)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
export function DrawdownChart({ data }: { data: { t: string; dd: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data}><CartesianGrid stroke="#1e2632" vertical={false} /><XAxis dataKey="t" {...axis} minTickGap={40} /><YAxis {...axis} width={48} unit="%" /><Tooltip {...tip} />
        <Area type="monotone" dataKey="dd" stroke="#ef5f5f" fill="#ef5f5f" fillOpacity={0.15} isAnimationActive={false} /></AreaChart>
    </ResponsiveContainer>
  );
}
export function PnlBars({ data }: { data: { t: string; pnl: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data}><CartesianGrid stroke="#1e2632" vertical={false} /><XAxis dataKey="t" {...axis} /><YAxis {...axis} width={56} /><Tooltip {...tip} />
        <Bar dataKey="pnl" isAnimationActive={false}>{data.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? "#4cc38a" : "#ef5f5f"} />)}</Bar></BarChart>
    </ResponsiveContainer>
  );
}
export function PriceChart({ data }: { data: { t: string; close: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}><CartesianGrid stroke="#1e2632" vertical={false} /><XAxis dataKey="t" {...axis} minTickGap={50} /><YAxis {...axis} domain={["auto", "auto"]} width={64} /><Tooltip {...tip} />
        <Line type="monotone" dataKey="close" stroke="#6aa8ff" dot={false} strokeWidth={1.5} isAnimationActive={false} /></LineChart>
    </ResponsiveContainer>
  );
}
const COLORS = ["#4cc38a", "#6aa8ff", "#e5b454", "#c08cff", "#ef5f5f", "#8b98a9"];
export function AllocationPie({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} stroke="#0d1117" isAnimationActive={false}>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip {...tip} /></PieChart>
    </ResponsiveContainer>
  );
}
