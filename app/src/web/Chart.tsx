import * as echarts from "echarts";
import { useComputedColorScheme } from "@mantine/core";
import { useEffect, useRef } from "react";

import type { ChartKind, Dimension, Metric, QueryRow } from "./api";
import { TIME_DIMS } from "./api";
import { compactMoney, dimValue, metricValue } from "./format";

const LIGHT = {
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  surface: "#fcfcfb",
  ink: "#0b0b0b",
  ink2: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  other: "#c3c2b7",
};
const DARK = {
  series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
  surface: "#1a1a19",
  ink: "#f0efec",
  ink2: "#c3c2b7",
  muted: "#898781",
  grid: "#2c2c2a",
  axis: "#383835",
  other: "#52514e",
};
const MAX_SERIES = 8;

export interface ChartProps {
  rows: QueryRow[];
  dimensions: Dimension[];
  metric: Metric;
  kind: ChartKind;
  height?: number;
  horizontal?: boolean;
  onPick?: (values: Partial<Record<Dimension, string>>) => void;
}

export function resolveKind(kind: ChartKind, dims: Dimension[]): Exclude<ChartKind, "auto"> {
  if (kind !== "auto") return kind;
  if (dims.length === 0) return "table";
  const time = TIME_DIMS.includes(dims[0]);
  if (dims.length === 2) return time ? "stacked_bar" : "table";
  return time ? "line" : "bar";
}

export function Chart({ rows, dimensions, metric, kind, height = 320, horizontal, onPick }: ChartProps) {
  const el = useRef<HTMLDivElement>(null);
  const dark = useComputedColorScheme("light") === "dark";
  const t = dark ? DARK : LIGHT;

  useEffect(() => {
    if (!el.current) return;
    const chart = echarts.init(el.current, undefined, { renderer: "svg" });
    const resolved = resolveKind(kind, dimensions);
    const [dim0, dim1] = dimensions;
    const fmt = (v: number) => metricValue(metric, v);
    const axisFmt = (v: number) =>
      metric === "count" ? String(v) : metric === "pct_of_total" ? `${v}%` : compactMoney(v);
    const tooltip = {
      backgroundColor: t.surface,
      borderColor: t.grid,
      textStyle: { color: t.ink, fontSize: 12 },
      valueFormatter: (v: unknown) => fmt(Number(v)),
    };
    const base = {
      animationDuration: 200,
      textStyle: { fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: t.ink2 },
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    };

    let option: echarts.EChartsOption;
    if (resolved === "treemap") {
      option = {
        ...base,
        tooltip: { ...tooltip, formatter: (p: any) => `${p.name}<br/><b>${fmt(p.value)}</b>` },
        series: [
          {
            type: "treemap",
            roam: false,
            nodeClick: false,
            breadcrumb: { show: false },
            itemStyle: { borderColor: t.surface, borderWidth: 2, gapWidth: 2, borderRadius: 4 },
            label: {
              color: "#ffffff",
              fontSize: 12,
              overflow: "truncate",
              formatter: (p: any) => `${p.name}\n${fmt(p.value)}`,
            },
            data: (() => {
              const pos = rows.filter((r) => (r.value ?? 0) > 0).sort((a, b) => b.value! - a.value!);
              const top = pos.slice(0, MAX_SERIES - 1).map((r, i) => ({
                name: dimValue(dim0, r.d0),
                value: r.value,
                raw: r.d0,
                itemStyle: { color: t.series[i] },
              }));
              const rest = pos.slice(MAX_SERIES - 1).reduce((s, r) => s + r.value!, 0);
              return rest > 0
                ? [...top, { name: "Other", value: rest, raw: undefined, itemStyle: { color: t.other } }]
                : top;
            })(),
          },
        ],
      };
    } else if (dim1 && (resolved === "stacked_bar" || resolved === "line" || resolved === "area" || resolved === "bar")) {
      const xs = [...new Set(rows.map((r) => r.d0!))];
      if (TIME_DIMS.includes(dim0) || dim0 === "month_of_year") xs.sort();
      const totals = new Map<string, number>();
      rows.forEach((r) => totals.set(r.d1!, (totals.get(r.d1!) ?? 0) + Math.abs(r.value ?? 0)));
      const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
      const keep = ranked.slice(0, MAX_SERIES - 1);
      const hasOther = ranked.length > keep.length;
      const names = hasOther ? [...keep, "Other"] : keep;
      const grid = new Map<string, number>();
      rows.forEach((r) => {
        const s = keep.includes(r.d1!) ? r.d1! : "Other";
        const k = `${r.d0}|${s}`;
        grid.set(k, (grid.get(k) ?? 0) + (r.value ?? 0));
      });
      const stacked = resolved === "stacked_bar" || resolved === "area";
      option = {
        ...base,
        color: names.map((n, i) => (n === "Other" ? t.other : t.series[i])),
        legend: { top: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: t.ink2 } },
        grid: { ...base.grid, top: 40 },
        tooltip: { ...tooltip, trigger: "axis" },
        xAxis: {
          type: "category",
          data: xs,
          axisLabel: { color: t.ink2, formatter: (v: string) => dimValue(dim0, v) },
          axisLine: { lineStyle: { color: t.axis } },
          axisTick: { show: false },
        },
        yAxis: {
          type: "value",
          axisLabel: { color: t.ink2, formatter: axisFmt },
          splitLine: { lineStyle: { color: t.grid } },
        },
        series: names.map((name) => ({
          name: name === "Other" ? name : dimValue(dim1, name),
          type: resolved === "line" || resolved === "area" ? "line" : "bar",
          stack: stacked ? "s" : undefined,
          barMaxWidth: 24,
          symbolSize: 8,
          showSymbol: false,
          lineStyle: { width: 2 },
          areaStyle: resolved === "area" ? { opacity: 0.1 } : undefined,
          itemStyle: stacked ? { borderColor: t.surface, borderWidth: 2 } : { borderRadius: [4, 4, 0, 0] },
          emphasis: { focus: "series" },
          data: xs.map((x) => ({ value: grid.get(`${x}|${name}`) ?? 0, raw: [x, name === "Other" ? undefined : name] })),
        })),
      };
    } else {
      const isTime = dim0 && TIME_DIMS.includes(dim0);
      const ordered = isTime ? [...rows].sort((a, b) => (a.d0! < b.d0! ? -1 : 1)) : rows;
      const flip = horizontal ?? (!isTime && resolved === "bar");
      const shown = flip ? [...ordered].reverse() : ordered;
      const cat = {
        type: "category" as const,
        data: shown.map((r) => r.d0 ?? ""),
        axisLabel: { color: t.ink2, formatter: (v: string) => dimValue(dim0, v), width: 160, overflow: "truncate" as const },
        axisLine: { lineStyle: { color: t.axis } },
        axisTick: { show: false },
      };
      const val = {
        type: "value" as const,
        axisLabel: { color: t.ink2, formatter: axisFmt },
        splitLine: { lineStyle: { color: t.grid } },
      };
      const line = resolved === "line" || resolved === "area";
      option = {
        ...base,
        grid: { ...base.grid, right: flip ? 64 : base.grid.right },
        color: [t.series[0]],
        tooltip: { ...tooltip, trigger: line ? "axis" : "item", axisPointer: { type: line ? "line" : "shadow" } },
        xAxis: flip ? val : cat,
        yAxis: flip ? cat : val,
        series: [
          {
            type: line ? "line" : "bar",
            name: "Value",
            barMaxWidth: 24,
            symbolSize: 8,
            showSymbol: shown.length < 40,
            lineStyle: { width: 2 },
            itemStyle: {
              borderRadius: flip ? [0, 4, 4, 0] : [4, 4, 0, 0],
              borderColor: line ? t.surface : undefined,
              borderWidth: line ? 2 : 0,
            },
            areaStyle: resolved === "area" ? { opacity: 0.1 } : undefined,
            label: flip
              ? { show: shown.length <= 15, position: "right", color: t.ink2, formatter: (p: any) => fmt(p.value) }
              : undefined,
            data: shown.map((r) => ({ value: r.value ?? 0, raw: [r.d0] })),
          },
        ],
      };
    }

    chart.setOption(option);
    chart.on("click", (p: any) => {
      if (!onPick) return;
      const raw = p.data?.raw;
      const values: Partial<Record<Dimension, string>> = {};
      if (Array.isArray(raw)) {
        if (dim0 && raw[0] != null) values[dim0] = raw[0];
        if (dim1 && raw[1] != null) values[dim1] = raw[1];
      } else if (dim0 && raw != null) {
        values[dim0] = raw;
      }
      onPick(values);
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      chart.dispose();
    };
  }, [rows, dimensions, metric, kind, horizontal, onPick, t]);

  return <div ref={el} style={{ height, width: "100%", cursor: onPick ? "pointer" : undefined }} />;
}
