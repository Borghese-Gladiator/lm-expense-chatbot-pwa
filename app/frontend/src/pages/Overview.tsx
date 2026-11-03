import { useState } from "react";

import type { AnalyticsQuery, Measure, QueryResult } from "../api";
import { runQuery } from "../api";
import { Chart } from "../Chart";
import type { Preset } from "../format";
import { dimValue, iso, money, pct, PRESETS, presetRange, signedMoney } from "../format";
import { Status, useApp, useAsync } from "../shared";

const base = (measure: Measure, start: string, end: string, extra: Partial<AnalyticsQuery> = {}): AnalyticsQuery => ({
  measure,
  metric: "total",
  dimensions: [],
  filters: { start, end },
  compare: "previous_period",
  ...extra,
});

function Kpi({ label, value, previous, upIsGood }: { label: string; value: number; previous: number; upIsGood: boolean }) {
  const diff = value - previous;
  const change = previous ? (diff / Math.abs(previous)) * 100 : null;
  const good = diff === 0 ? null : diff > 0 === upIsGood;
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value">{label === "Savings rate" ? `${value.toFixed(1)}%` : money(value)}</div>
      <div className={`delta ${good === null ? "" : good ? "good" : "bad"}`}>
        {diff === 0 ? "No change" : (
          <>
            <span aria-hidden>{diff > 0 ? "▲" : "▼"}</span>{" "}
            {label === "Savings rate" ? `${diff > 0 ? "+" : ""}${diff.toFixed(1)} pts` : `${signedMoney(diff)} (${pct(change)})`}
          </>
        )}
        <span className="muted"> vs previous period</span>
      </div>
    </div>
  );
}

export function Overview() {
  const { openDrill, version, meta } = useApp();
  const [preset, setPreset] = useState<Preset>("last_month");
  const [custom, setCustom] = useState({ start: "", end: "" });
  const range = preset === "custom" ? custom : presetRange(preset);
  const start = range.start ?? meta?.date_bounds.start ?? "2000-01-01";
  const end = range.end ?? meta?.date_bounds.end ?? iso(new Date());

  const { data, error, loading } = useAsync(async () => {
    const [spend, income, trend, cats, merchants, change] = await Promise.all([
      runQuery(base("spending", start, end)),
      runQuery(base("income", start, end)),
      runQuery({ ...base("spending", start, end), compare: "none", dimensions: ["month"],
        filters: { start: iso(new Date(new Date(end).getFullYear(), new Date(end).getMonth() - 11, 1)), end } }),
      runQuery(base("spending", start, end, { compare: "none", dimensions: ["category"], limit: 12 })),
      runQuery(base("spending", start, end, { compare: "none", dimensions: ["merchant"], limit: 10 })),
      runQuery(base("spending", start, end, { dimensions: ["category"], limit: 6 })),
    ]);
    return { spend, income, trend, cats, merchants, change };
  }, [start, end, version]);

  const largest = useAsync(
    () =>
      fetch("/api/analytics/drilldown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: base("spending", start, end, { compare: "none" }), limit: 8 }),
      }).then((r) => r.json()),
    [start, end, version],
  );

  const totals = (r: QueryResult) => r.totals ?? { current: 0, previous: 0, n: 0 };
  const s = data && totals(data.spend);
  const i = data && totals(data.income);
  const rate = (inc: number, sp: number) => (inc > 0 ? ((inc - sp) / inc) * 100 : 0);

  return (
    <div className="page">
      <div className="toolbar">
        <h1>Overview</h1>
        <div className="row">
          <select aria-label="Date range" value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {preset === "custom" && (
            <>
              <input type="date" aria-label="Start" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} />
              <input type="date" aria-label="End" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} />
            </>
          )}
          <span className="muted">{start} → {end}</span>
        </div>
      </div>
      <Status loading={loading && !data} error={error} empty={meta?.date_bounds.start == null} />
      {data && s && i && (
        <>
          <div className="kpis">
            <Kpi label="Income" value={i.current!} previous={i.previous!} upIsGood />
            <Kpi label="Spending" value={s.current!} previous={s.previous!} upIsGood={false} />
            <Kpi label="Net cash flow" value={i.current! - s.current!} previous={i.previous! - s.previous!} upIsGood />
            <Kpi label="Savings rate" value={rate(i.current!, s.current!)} previous={rate(i.previous!, s.previous!)} upIsGood />
          </div>
          <div className="grid2">
            <section className="card">
              <h2>Spending, last 12 months</h2>
              <Chart
                rows={data.trend.rows}
                dimensions={["month"]}
                metric="total"
                kind="bar"
                horizontal={false}
                height={260}
                onPick={(v) => openDrill({ title: `Spending · ${dimValue("month", v.month)}`, query: base("spending", "1900-01-01", end, { compare: "none", dimensions: ["month"] }), values: v })}
              />
            </section>
            <section className="card">
              <h2>Spending by category</h2>
              <Chart
                rows={data.cats.rows}
                dimensions={["category"]}
                metric="total"
                kind="bar"
                height={260}
                onPick={(v) => openDrill({ title: `Spending · ${v.category}`, query: base("spending", start, end, { compare: "none", dimensions: ["category"] }), values: v })}
              />
            </section>
            <section className="card">
              <h2>What changed vs the previous period</h2>
              <ChangeTable result={data.change} onPick={(cat) => openDrill({ title: `${cat} · this period`, query: base("spending", start, end, { dimensions: ["category"] }), values: { category: cat } })} />
            </section>
            <section className="card">
              <h2>Top merchants</h2>
              <Chart
                rows={data.merchants.rows}
                dimensions={["merchant"]}
                metric="total"
                kind="bar"
                height={260}
                onPick={(v) => openDrill({ title: `Spending · ${v.merchant}`, query: base("spending", start, end, { compare: "none", dimensions: ["merchant"] }), values: v })}
              />
            </section>
          </div>
          <section className="card">
            <h2>Largest expenses</h2>
            {largest.data && (
              <ul className="list">
                {largest.data.transactions.map((t: { id: number; date: string; merchant: string; category: string; value: number }) => (
                  <li key={t.id}>
                    <span className="nowrap muted">{t.date}</span>
                    <span>{t.merchant} <span className="muted">· {t.category}</span></span>
                    <span className="num">{money(t.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function ChangeTable({ result, onPick, label = "Category" }: { result: QueryResult; onPick: (v: string) => void; label?: string }) {
  if (!result.rows.length) return <div className="state">No spending in either period.</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{label}</th>
            <th className="right">Previous</th>
            <th className="right">Current</th>
            <th className="right">Change</th>
            <th className="right">Share of change</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r) => (
            <tr key={r.d0} className="clickable" onClick={() => onPick(r.d0!)}>
              <td>{r.d0}</td>
              <td className="right num">{money(r.previous)}</td>
              <td className="right num">{money(r.current)}</td>
              <td className={`right num ${r.diff! > 0 ? "up" : r.diff! < 0 ? "down" : ""}`}>
                {signedMoney(r.diff!)} <span className="muted">{pct(r.pct)}</span>
              </td>
              <td className="right num">{r.contribution == null ? "—" : `${r.contribution.toFixed(0)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
