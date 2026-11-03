import { useEffect, useMemo, useState } from "react";

import type { AnalyticsQuery, ChartKind, Compare, Dimension, Measure, Metric, QueryRow } from "../api";
import { api, DIM_LABEL, MEASURE_LABEL, METRIC_LABEL, runQuery, TIME_DIMS } from "../api";
import { Chart, resolveKind } from "../Chart";
import type { Preset } from "../format";
import { dimValue, metricValue, money, pct, PRESETS, presetRange, signedMoney } from "../format";
import { Status, useApp, useAsync } from "../shared";
import { ChangeTable } from "./Overview";

interface Saved {
  id: number;
  name: string;
  query: AnalyticsQuery;
}

const DEFAULT: AnalyticsQuery = {
  measure: "spending",
  metric: "total",
  dimensions: ["month"],
  filters: presetRange("last_12"),
  compare: "none",
  chart: "auto",
  limit: 100,
};

const fromHash = (): AnalyticsQuery => {
  const m = location.hash.match(/[?&]q=([^&]+)/);
  if (!m) return DEFAULT;
  try {
    return { ...DEFAULT, ...JSON.parse(decodeURIComponent(m[1])) };
  } catch {
    return DEFAULT;
  }
};

function Multi<T extends string | number>({
  label, options, value, onChange,
}: { label: string; options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())).slice(0, 200);
  return (
    <div className="multi">
      <button className={`chip ${value.length ? "on" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        {label}{value.length ? ` · ${value.length}` : ""} ▾
      </button>
      {open && (
        <div className="popover" onMouseLeave={() => setOpen(false)}>
          <input autoFocus placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="options">
            {shown.map((o) => (
              <label key={String(o.value)} className="check">
                <input
                  type="checkbox"
                  checked={value.includes(o.value)}
                  onChange={() => onChange(value.includes(o.value) ? value.filter((x) => x !== o.value) : [...value, o.value])}
                />
                {o.label}
              </label>
            ))}
          </div>
          {value.length > 0 && <button className="small ghost" onClick={() => onChange([])}>Clear</button>}
        </div>
      )}
    </div>
  );
}

export function Explore() {
  const { meta, openDrill, version } = useApp();
  const [q, setQ] = useState<AnalyticsQuery>(fromHash);
  const [preset, setPreset] = useState<Preset>("custom");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [saved, setSaved] = useState<Saved[]>([]);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [askState, setAskState] = useState<{ busy?: boolean; error?: string; note?: string }>({});

  const merchants = useAsync(
    () => runQuery({ ...DEFAULT, dimensions: ["merchant"], filters: {}, limit: 2000 }).then((r) => r.rows.map((x) => x.d0!)),
    [version],
  );

  const loadSaved = () => api<Saved[]>("/saved-queries").then(setSaved);
  useEffect(() => {
    loadSaved();
  }, []);

  useEffect(() => {
    history.replaceState(null, "", `#explore?q=${encodeURIComponent(JSON.stringify(q))}`);
  }, [q]);
  useEffect(() => {
    const on = () => setQ((prev) => {
      const next = fromHash();
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const key = JSON.stringify(q);
  const { data, error, loading } = useAsync(() => runQuery(q), [key, version]);

  const set = (patch: Partial<AnalyticsQuery>) => setQ((prev) => ({ ...prev, ...patch }));
  const setF = (patch: Partial<AnalyticsQuery["filters"]>) => setQ((prev) => ({ ...prev, filters: { ...prev.filters, ...patch } }));

  const setDim = (i: 0 | 1, d: Dimension | "") => {
    const dims = [...q.dimensions];
    if (d === "") dims.splice(i);
    else dims[i] = d;
    const patch: Partial<AnalyticsQuery> = { dimensions: dims.filter(Boolean) as Dimension[] };
    if (q.compare !== "none" && dims.some((x) => TIME_DIMS.includes(x))) patch.compare = "none";
    if (q.metric === "cumulative" && !TIME_DIMS.includes(dims[0])) patch.metric = "total";
    set(patch);
  };

  const compareAllowed = q.filters.start && q.filters.end && !q.dimensions.some((d) => TIME_DIMS.includes(d));
  const metricOptions = (Object.keys(METRIC_LABEL) as Metric[]).filter((m) => {
    if (q.compare !== "none") return ["total", "count", "avg", "median"].includes(m);
    if (m === "cumulative") return TIME_DIMS.includes(q.dimensions[0]);
    return true;
  });

  const drill = (values: Partial<Record<Dimension, string>>, prev = false) => {
    const label = Object.entries(values).map(([d, v]) => dimValue(d as Dimension, v)).join(" · ") || "All";
    openDrill({
      title: `${MEASURE_LABEL[q.measure]} · ${label}${prev ? " (comparison period)" : ""}`,
      query: q,
      values,
      use_compare_range: prev,
      onExclude: (id) =>
        setQ((p) => ({ ...p, filters: { ...p.filters, exclude_ids: [...(p.filters.exclude_ids ?? []), id] } })),
    });
  };

  const save = async () => {
    const current = saved.find((s) => s.id === savedId);
    const name = prompt("Name this analysis", current?.name ?? "");
    if (!name) return;
    if (current && name === current.name) {
      await api(`/saved-queries/${current.id}`, { name, query: q }, "PUT");
    } else {
      const res = await api<{ id: number }>("/saved-queries", { name, query: q });
      setSavedId(res.id);
    }
    loadSaved();
  };

  const ask = async () => {
    setAskState({ busy: true });
    try {
      const res = await api<{ query: AnalyticsQuery; explanation: string }>("/ask", { question });
      setQ({ ...DEFAULT, ...res.query });
      setPreset("custom");
      setAskState({ note: res.explanation });
    } catch (e) {
      setAskState({ error: (e as Error).message });
    }
  };

  const kind = resolveKind(q.chart ?? "auto", q.dimensions);
  const chartable = q.compare === "none" && q.dimensions.length > 0 && !(q.dimensions.length === 2 && kind === "table");

  const catOptions = useMemo(
    () => (meta?.categories ?? []).map((c) => ({ value: c.id, label: c.group_name ? `${c.group_name} › ${c.name}` : c.name })),
    [meta],
  );

  return (
    <div className="page">
      <div className="toolbar">
        <h1>Explore</h1>
        <div className="row">
          <select aria-label="Saved analyses" value={savedId ?? ""} onChange={(e) => {
            const s = saved.find((x) => x.id === Number(e.target.value));
            setSavedId(s?.id ?? null);
            if (s) { setQ({ ...DEFAULT, ...s.query }); setPreset("custom"); }
          }}>
            <option value="">Saved analyses…</option>
            {saved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={save}>Save</button>
          {savedId && (
            <button className="ghost" onClick={async () => {
              if (!confirm("Delete this saved analysis?")) return;
              await api(`/saved-queries/${savedId}`, undefined, "DELETE");
              setSavedId(null);
              loadSaved();
            }}>Delete</button>
          )}
          <button className="ghost" onClick={() => { setQ(DEFAULT); setSavedId(null); }}>Reset</button>
        </div>
      </div>

      {meta?.ask_configured && (
        <form className="card ask" onSubmit={(e) => { e.preventDefault(); if (question.trim().length > 2) ask(); }}>
          <input
            aria-label="Ask a question"
            placeholder="Ask: why did restaurant spending go up last month?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button disabled={askState.busy}>{askState.busy ? "Thinking…" : "Build query"}</button>
          {askState.note && <p className="muted">{askState.note} Check the controls below before you rely on it.</p>}
          {askState.error && <p className="error">{askState.error}</p>}
        </form>
      )}

      <section className="card builder">
        <div className="row wrap">
          <label>Measure
            <select value={q.measure} onChange={(e) => set({ measure: e.target.value as Measure })}>
              {(Object.keys(MEASURE_LABEL) as Measure[]).map((m) => <option key={m} value={m}>{MEASURE_LABEL[m]}</option>)}
            </select>
          </label>
          <label>Metric
            <select value={q.metric} onChange={(e) => set({ metric: e.target.value as Metric })}>
              {metricOptions.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
            </select>
          </label>
          <label>Group by
            <select value={q.dimensions[0] ?? ""} onChange={(e) => setDim(0, e.target.value as Dimension)}>
              <option value="">Nothing (one total)</option>
              {(Object.keys(DIM_LABEL) as Dimension[]).map((d) => <option key={d} value={d}>{DIM_LABEL[d]}</option>)}
            </select>
          </label>
          {q.dimensions.length > 0 && (
            <label>Then by
              <select value={q.dimensions[1] ?? ""} onChange={(e) => setDim(1, e.target.value as Dimension)}>
                <option value="">—</option>
                {(Object.keys(DIM_LABEL) as Dimension[]).filter((d) => d !== q.dimensions[0]).map((d) => (
                  <option key={d} value={d}>{DIM_LABEL[d]}</option>
                ))}
              </select>
            </label>
          )}
          <label>Period
            <select value={preset} onChange={(e) => {
              const p = e.target.value as Preset;
              setPreset(p);
              if (p !== "custom") setF(presetRange(p));
            }}>
              {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label>From<input type="date" value={q.filters.start ?? ""} onChange={(e) => { setPreset("custom"); setF({ start: e.target.value || null }); }} /></label>
          <label>To<input type="date" value={q.filters.end ?? ""} onChange={(e) => { setPreset("custom"); setF({ end: e.target.value || null }); }} /></label>
          <label>Compare to
            <select
              value={q.compare}
              disabled={!compareAllowed && q.compare === "none"}
              title={compareAllowed ? "" : "Set a date range and remove time grouping to compare"}
              onChange={(e) => {
                const c = e.target.value as Compare;
                set({ compare: c, metric: c !== "none" && ["pct_of_total", "cumulative"].includes(q.metric) ? "total" : q.metric });
              }}
            >
              <option value="none">Nothing</option>
              <option value="previous_period">Previous period</option>
              <option value="same_period_last_year">Same period last year</option>
              <option value="custom">Custom period</option>
            </select>
          </label>
          {q.compare === "custom" && (
            <>
              <label>Compare from<input type="date" value={q.compare_start ?? ""} onChange={(e) => set({ compare_start: e.target.value })} /></label>
              <label>Compare to<input type="date" value={q.compare_end ?? ""} onChange={(e) => set({ compare_end: e.target.value })} /></label>
            </>
          )}
        </div>
        <div className="row wrap filters">
          <Multi label="Accounts" options={(meta?.accounts ?? []).map((a) => ({ value: a.id, label: a.name }))} value={q.filters.account_ids ?? []} onChange={(v) => setF({ account_ids: v })} />
          <Multi label="Categories" options={catOptions} value={q.filters.category_ids ?? []} onChange={(v) => setF({ category_ids: v })} />
          <Multi label="Groups" options={(meta?.groups ?? []).map((g) => ({ value: g, label: g }))} value={q.filters.category_groups ?? []} onChange={(v) => setF({ category_groups: v })} />
          <Multi label="Merchants" options={(merchants.data ?? []).map((m) => ({ value: m, label: m }))} value={q.filters.merchants ?? []} onChange={(v) => setF({ merchants: v })} />
          <Multi label="Tags" options={(meta?.tags ?? []).map((t) => ({ value: t, label: t }))} value={q.filters.tags ?? []} onChange={(v) => setF({ tags: v })} />
          <input className="small-input" type="number" min={0} placeholder="Min $" aria-label="Minimum amount" value={q.filters.amount_min ?? ""} onChange={(e) => setF({ amount_min: e.target.value ? Number(e.target.value) : null })} />
          <input className="small-input" type="number" min={0} placeholder="Max $" aria-label="Maximum amount" value={q.filters.amount_max ?? ""} onChange={(e) => setF({ amount_max: e.target.value ? Number(e.target.value) : null })} />
          <input placeholder="Search payee or notes" aria-label="Search" value={q.filters.search ?? ""} onChange={(e) => setF({ search: e.target.value || null })} />
          <label className="check"><input type="checkbox" checked={q.filters.include_pending ?? false} onChange={(e) => setF({ include_pending: e.target.checked })} />Include pending</label>
          {(q.filters.exclude_ids?.length ?? 0) > 0 && (
            <button className="chip on" onClick={() => setF({ exclude_ids: [] })} title="Bring excluded transactions back">
              {q.filters.exclude_ids!.length} excluded ✕
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <div className="toolbar small">
          <Summary rows={data?.rows} totals={data?.totals} metric={q.metric} compareRange={data?.compare_range} />
          {q.compare === "none" && q.dimensions.length > 0 && (
            <div className="row">
              <div className="segmented" role="tablist">
                <button className={view === "chart" ? "on" : ""} onClick={() => setView("chart")} disabled={!chartable}>Chart</button>
                <button className={view === "table" ? "on" : ""} onClick={() => setView("table")}>Table</button>
              </div>
              {view === "chart" && (
                <select aria-label="Chart type" value={q.chart ?? "auto"} onChange={(e) => set({ chart: e.target.value as ChartKind })}>
                  <option value="auto">Auto chart</option>
                  <option value="bar">Bar</option>
                  <option value="line">Line</option>
                  <option value="area">Area</option>
                  <option value="stacked_bar">Stacked bar</option>
                  {q.dimensions.length === 1 && <option value="treemap">Treemap</option>}
                </select>
              )}
            </div>
          )}
        </div>
        <Status loading={loading && !data} error={error} empty={data?.rows.length === 0} />
        {data && data.rows.length > 0 && (
          q.compare !== "none" ? (
            <>
              <ChangeTable result={data} label={q.dimensions[0] ? DIM_LABEL[q.dimensions[0]] : "Total"} onPick={(v) => drill(q.dimensions[0] ? { [q.dimensions[0]]: v } : {})} />
              <p className="muted small">Click a row to see the transactions in the current period. Exclude one-off purchases from the drawer to recalculate.</p>
            </>
          ) : view === "chart" && chartable ? (
            <Chart rows={data.rows} dimensions={q.dimensions} metric={q.metric} kind={q.chart ?? "auto"} height={380} onPick={drill} />
          ) : (
            <ResultTable rows={data.rows} dims={q.dimensions} metric={q.metric} onPick={drill} />
          )
        )}
      </section>
    </div>
  );
}

function Summary({ rows, totals, metric, compareRange }: { rows?: QueryRow[]; totals?: QueryRow; metric: Metric; compareRange?: { start: string; end: string } }) {
  if (!rows) return <div />;
  if (totals) {
    return (
      <div>
        <strong>{money(totals.current)}</strong> vs <strong>{money(totals.previous)}</strong>{" "}
        <span className={totals.diff! > 0 ? "up" : "down"}>{signedMoney(totals.diff!)} ({pct(totals.pct)})</span>
        <div className="muted small">Comparison period {compareRange?.start} → {compareRange?.end}</div>
      </div>
    );
  }
  const n = rows.reduce((a, r) => a + r.n, 0);
  return (
    <div>
      {rows.length === 1 && rows[0].d0 === undefined ? <strong>{metricValue(metric, rows[0].value)}</strong> : <strong>{rows.length} groups</strong>}
      <span className="muted"> · {n.toLocaleString()} transactions</span>
    </div>
  );
}

function ResultTable({ rows, dims, metric, onPick }: { rows: QueryRow[]; dims: Dimension[]; metric: Metric; onPick: (v: Partial<Record<Dimension, string>>) => void }) {
  const [d0, d1] = dims;
  if (d1) {
    const cols = [...new Set(rows.map((r) => r.d1!))];
    const rowKeys = [...new Set(rows.map((r) => r.d0!))];
    if (TIME_DIMS.includes(d0)) rowKeys.sort();
    const cell = new Map(rows.map((r) => [`${r.d0}|${r.d1}`, r.value]));
    return (
      <div className="table-wrap">
        <table className="pivot">
          <thead>
            <tr><th>{DIM_LABEL[d0]} \ {DIM_LABEL[d1]}</th>{cols.map((c) => <th key={c} className="right">{dimValue(d1, c)}</th>)}</tr>
          </thead>
          <tbody>
            {rowKeys.map((rk) => (
              <tr key={rk}>
                <th>{dimValue(d0, rk)}</th>
                {cols.map((c) => {
                  const v = cell.get(`${rk}|${c}`);
                  return (
                    <td key={c} className="right num clickable" onClick={() => v != null && onPick({ [d0]: rk, [d1]: c })}>
                      {v == null ? "" : metricValue(metric, v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>{d0 ? DIM_LABEL[d0] : ""}</th><th className="right">{METRIC_LABEL[metric]}</th><th className="right">Transactions</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.d0 ?? i} className="clickable" onClick={() => onPick(d0 ? { [d0]: r.d0 } : {})}>
              <td>{dimValue(d0, r.d0)}</td>
              <td className="right num">{metricValue(metric, r.value)}</td>
              <td className="right num">{r.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
