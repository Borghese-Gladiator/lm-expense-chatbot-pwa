import {
  Alert, Button, Card, Checkbox, Group, Modal, MultiSelect, NumberInput, SegmentedControl, Select, Stack, Table, Text, TextInput, Title,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useEffect, useMemo, useState } from "react";

import type { AnalyticsQuery, ChartKind, Compare, Dimension, Measure, Metric, QueryRow } from "../api";
import { api, DIM_LABEL, MEASURE_LABEL, METRIC_LABEL, runQuery, TIME_DIMS } from "../api";
import { Chart, resolveKind } from "../Chart";
import type { Preset } from "../format";
import { dimValue, metricValue, money, pct, PRESETS, presetRange, signedMoney } from "../format";
import { LoadState, useApp, useAsync } from "../shared";
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

const NONE = "__none";
const NUM = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } as const;

const fromHash = (): AnalyticsQuery => {
  const m = location.hash.match(/[?&]q=([^&]+)/);
  if (!m) return DEFAULT;
  try {
    return { ...DEFAULT, ...JSON.parse(decodeURIComponent(m[1])) };
  } catch {
    return DEFAULT;
  }
};

const opts = <T extends string>(labels: Record<T, string>, keys = Object.keys(labels) as T[]) =>
  keys.map((k) => ({ value: k, label: labels[k] }));

function Multi<T extends string | number>({
  label, options, value, onChange,
}: { label: string; options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void }) {
  const byKey = new Map(options.map((o) => [String(o.value), o.value]));
  return (
    <MultiSelect
      aria-label={label}
      placeholder={value.length ? undefined : label}
      data={options.map((o) => ({ value: String(o.value), label: o.label }))}
      value={value.map(String)}
      onChange={(v) => onChange(v.map((k) => byKey.get(k)!).filter((x) => x !== undefined))}
      searchable
      clearable
      limit={200}
      w={200}
    />
  );
}

export function Explore() {
  const { meta, openDrill, version } = useApp();
  const [q, setQ] = useState<AnalyticsQuery>(fromHash);
  const [preset, setPreset] = useState<Preset>("custom");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [saved, setSaved] = useState<Saved[]>([]);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [saveName, setSaveName] = useState<string | null>(null);
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

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = saveName?.trim();
    if (!name) return;
    const current = saved.find((s) => s.id === savedId);
    if (current && name === current.name) {
      await api(`/saved-queries/${current.id}`, { name, query: q }, "PUT");
    } else {
      const res = await api<{ id: number }>("/saved-queries", { name, query: q });
      setSavedId(res.id);
    }
    setSaveName(null);
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
  const dimOptions = opts(DIM_LABEL);

  return (
    <Stack p="md" gap="md">
      <Group justify="space-between" wrap="wrap">
        <Title order={1} size="h2">Explore</Title>
        <Group gap="sm">
          <Select
            aria-label="Saved analyses"
            placeholder="Saved analyses…"
            clearable
            data={saved.map((s) => ({ value: String(s.id), label: s.name }))}
            value={savedId == null ? null : String(savedId)}
            onChange={(v) => {
              const s = saved.find((x) => x.id === Number(v));
              setSavedId(s?.id ?? null);
              if (s) { setQ({ ...DEFAULT, ...s.query }); setPreset("custom"); }
            }}
            w={200}
          />
          <Button onClick={() => setSaveName(saved.find((s) => s.id === savedId)?.name ?? "")}>Save</Button>
          {savedId && (
            <Button variant="subtle" color="red" onClick={async () => {
              if (!confirm("Delete this saved analysis?")) return;
              await api(`/saved-queries/${savedId}`, undefined, "DELETE");
              setSavedId(null);
              loadSaved();
            }}>Delete</Button>
          )}
          <Button variant="default" onClick={() => { setQ(DEFAULT); setSavedId(null); }}>Reset</Button>
        </Group>
      </Group>

      <Modal opened={saveName !== null} onClose={() => setSaveName(null)} title="Save analysis">
        <form onSubmit={save}>
          <Stack gap="sm">
            <TextInput label="Name" data-autofocus required value={saveName ?? ""} onChange={(e) => setSaveName(e.currentTarget.value)} />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setSaveName(null)}>Cancel</Button>
              <Button type="submit" disabled={!saveName?.trim()}>Save</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {meta?.ask_configured && (
        <Card withBorder component="form" padding="md" onSubmit={(e: React.FormEvent) => { e.preventDefault(); if (question.trim().length > 2) ask(); }}>
          <Group gap="sm">
            <TextInput
              aria-label="Ask a question"
              placeholder="Ask: why did restaurant spending go up last month?"
              value={question}
              onChange={(e) => setQuestion(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button type="submit" loading={askState.busy}>Build query</Button>
          </Group>
          {askState.note && <Text c="dimmed" size="sm" mt="sm">{askState.note} Check the controls below before you rely on it.</Text>}
          {askState.error && <Alert color="red" mt="sm">{askState.error}</Alert>}
        </Card>
      )}

      <Card withBorder component="section" padding="md">
        <Stack gap="sm">
          <Group gap="sm" align="flex-end" wrap="wrap">
            <Select label="Measure" allowDeselect={false} data={opts(MEASURE_LABEL)} value={q.measure} onChange={(v) => v && set({ measure: v as Measure })} w={150} />
            <Select label="Metric" allowDeselect={false} data={opts(METRIC_LABEL, metricOptions)} value={q.metric} onChange={(v) => v && set({ metric: v as Metric })} w={170} />
            <Select
              label="Group by"
              allowDeselect={false}
              data={[{ value: NONE, label: "Nothing (one total)" }, ...dimOptions]}
              value={q.dimensions[0] ?? NONE}
              onChange={(v) => setDim(0, !v || v === NONE ? "" : (v as Dimension))}
              w={170}
            />
            {q.dimensions.length > 0 && (
              <Select
                label="Then by"
                allowDeselect={false}
                data={[{ value: NONE, label: "—" }, ...dimOptions.filter((d) => d.value !== q.dimensions[0])]}
                value={q.dimensions[1] ?? NONE}
                onChange={(v) => setDim(1, !v || v === NONE ? "" : (v as Dimension))}
                w={170}
              />
            )}
            <Select
              label="Period"
              allowDeselect={false}
              data={PRESETS.map((p) => ({ value: p.id, label: p.label }))}
              value={preset}
              onChange={(v) => {
                const p = (v ?? "custom") as Preset;
                setPreset(p);
                if (p !== "custom") setF(presetRange(p));
                if (p === "ytd" && !q.dimensions.some((d) => TIME_DIMS.includes(d))) {
                  set({ compare: "same_period_last_year", metric: ["pct_of_total", "cumulative"].includes(q.metric) ? "total" : q.metric });
                }
              }}
              w={160}
            />
            <DatePickerInput
              type="range"
              label="Date range"
              placeholder="Any date"
              clearable
              valueFormat="YYYY-MM-DD"
              value={[q.filters.start ?? null, q.filters.end ?? null]}
              onChange={([s, e]) => { setPreset("custom"); setF({ start: s, end: e }); }}
              w={240}
            />
            <Select
              label="Compare to"
              allowDeselect={false}
              disabled={!compareAllowed && q.compare === "none"}
              title={compareAllowed ? "" : "Set a date range and remove time grouping to compare"}
              data={[
                { value: "none", label: "Nothing" },
                { value: "previous_period", label: "Previous period" },
                { value: "same_period_last_year", label: "Same period last year" },
                { value: "custom", label: "Custom period" },
              ]}
              value={q.compare}
              onChange={(v) => {
                const c = (v ?? "none") as Compare;
                set({ compare: c, metric: c !== "none" && ["pct_of_total", "cumulative"].includes(q.metric) ? "total" : q.metric });
              }}
              w={190}
            />
            {q.compare === "custom" && (
              <DatePickerInput
                type="range"
                label="Compare range"
                placeholder="Pick dates"
                valueFormat="YYYY-MM-DD"
                value={[q.compare_start ?? null, q.compare_end ?? null]}
                onChange={([s, e]) => set({ compare_start: s ?? undefined, compare_end: e ?? undefined })}
                w={240}
              />
            )}
          </Group>
          <Group gap="sm" wrap="wrap" align="center">
            <Multi label="Accounts" options={(meta?.accounts ?? []).map((a) => ({ value: a.id, label: a.name }))} value={q.filters.account_ids ?? []} onChange={(v) => setF({ account_ids: v })} />
            <Multi label="Categories" options={catOptions} value={q.filters.category_ids ?? []} onChange={(v) => setF({ category_ids: v })} />
            <Multi label="Groups" options={(meta?.groups ?? []).map((g) => ({ value: g, label: g }))} value={q.filters.category_groups ?? []} onChange={(v) => setF({ category_groups: v })} />
            <Multi label="Merchants" options={(merchants.data ?? []).map((m) => ({ value: m, label: m }))} value={q.filters.merchants ?? []} onChange={(v) => setF({ merchants: v })} />
            <Multi label="Tags" options={(meta?.tags ?? []).map((t) => ({ value: t, label: t }))} value={q.filters.tags ?? []} onChange={(v) => setF({ tags: v })} />
            <NumberInput min={0} placeholder="Min $" aria-label="Minimum amount" value={q.filters.amount_min ?? ""} onChange={(v) => setF({ amount_min: v === "" ? null : Number(v) })} w={100} />
            <NumberInput min={0} placeholder="Max $" aria-label="Maximum amount" value={q.filters.amount_max ?? ""} onChange={(v) => setF({ amount_max: v === "" ? null : Number(v) })} w={100} />
            <TextInput placeholder="Search payee or notes" aria-label="Search" value={q.filters.search ?? ""} onChange={(e) => setF({ search: e.currentTarget.value || null })} w={200} />
            <Checkbox label="Include pending" checked={q.filters.include_pending ?? false} onChange={(e) => setF({ include_pending: e.currentTarget.checked })} />
            {(q.filters.exclude_ids?.length ?? 0) > 0 && (
              <Button size="xs" variant="light" onClick={() => setF({ exclude_ids: [] })} title="Bring excluded transactions back">
                {q.filters.exclude_ids!.length} excluded ✕
              </Button>
            )}
          </Group>
        </Stack>
      </Card>

      <Card withBorder component="section" padding="md">
        <Group justify="space-between" wrap="wrap" mb="sm">
          <Summary rows={data?.rows} totals={data?.totals} metric={q.metric} compareRange={data?.compare_range} />
          {q.compare === "none" && q.dimensions.length > 0 && (
            <Group gap="sm">
              <SegmentedControl
                aria-label="View"
                value={view}
                onChange={(v) => setView(v as "chart" | "table")}
                data={[{ value: "chart", label: "Chart", disabled: !chartable }, { value: "table", label: "Table" }]}
              />
              {view === "chart" && (
                <Select
                  aria-label="Chart type"
                  allowDeselect={false}
                  data={[
                    { value: "auto", label: "Auto chart" },
                    { value: "bar", label: "Bar" },
                    { value: "line", label: "Line" },
                    { value: "area", label: "Area" },
                    { value: "stacked_bar", label: "Stacked bar" },
                    ...(q.dimensions.length === 1 ? [{ value: "treemap", label: "Treemap" }] : []),
                  ]}
                  value={q.chart ?? "auto"}
                  onChange={(v) => v && set({ chart: v as ChartKind })}
                  w={150}
                />
              )}
            </Group>
          )}
        </Group>
        <LoadState loading={loading && !data} error={error} empty={data?.rows.length === 0} />
        {data && data.rows.length > 0 && (
          q.compare !== "none" ? (
            <>
              <ChangeTable result={data} label={q.dimensions[0] ? DIM_LABEL[q.dimensions[0]] : "Total"} onPick={(v) => drill(q.dimensions[0] ? { [q.dimensions[0]]: v } : {})} />
              <Text c="dimmed" size="sm" mt="sm">Click a row to see the transactions in the current period. Exclude one-off purchases from the drawer to recalculate.</Text>
            </>
          ) : view === "chart" && chartable ? (
            <Chart rows={data.rows} dimensions={q.dimensions} metric={q.metric} kind={q.chart ?? "auto"} height={380} onPick={drill} />
          ) : (
            <ResultTable rows={data.rows} dims={q.dimensions} metric={q.metric} onPick={drill} />
          )
        )}
      </Card>
    </Stack>
  );
}

function Summary({ rows, totals, metric, compareRange }: { rows?: QueryRow[]; totals?: QueryRow; metric: Metric; compareRange?: { start: string; end: string } }) {
  if (!rows) return <div />;
  if (totals) {
    return (
      <div>
        <Text span fw={600}>{money(totals.current)}</Text> vs <Text span fw={600}>{money(totals.previous)}</Text>{" "}
        <Text span c={totals.diff! > 0 ? "red" : "teal"}>{signedMoney(totals.diff!)} ({pct(totals.pct)})</Text>
        <Text c="dimmed" size="sm">Comparison period {compareRange?.start} → {compareRange?.end}</Text>
      </div>
    );
  }
  const n = rows.reduce((a, r) => a + r.n, 0);
  return (
    <div>
      <Text span fw={600}>{rows.length === 1 && rows[0].d0 === undefined ? metricValue(metric, rows[0].value) : `${rows.length} groups`}</Text>
      <Text span c="dimmed"> · {n.toLocaleString()} transactions</Text>
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
      <Table.ScrollContainer minWidth={480}>
        <Table fz="sm" withColumnBorders>
          <Table.Thead>
            <Table.Tr><Table.Th>{DIM_LABEL[d0]} \ {DIM_LABEL[d1]}</Table.Th>{cols.map((c) => <Table.Th key={c} ta="right">{dimValue(d1, c)}</Table.Th>)}</Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rowKeys.map((rk) => (
              <Table.Tr key={rk}>
                <Table.Th>{dimValue(d0, rk)}</Table.Th>
                {cols.map((c) => {
                  const v = cell.get(`${rk}|${c}`);
                  return (
                    <Table.Td key={c} ta="right" style={{ ...NUM, cursor: v == null ? undefined : "pointer" }} onClick={() => v != null && onPick({ [d0]: rk, [d1]: c })}>
                      {v == null ? "" : metricValue(metric, v)}
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    );
  }
  return (
    <Table.ScrollContainer minWidth={400}>
      <Table fz="sm" highlightOnHover>
        <Table.Thead>
          <Table.Tr><Table.Th>{d0 ? DIM_LABEL[d0] : ""}</Table.Th><Table.Th ta="right">{METRIC_LABEL[metric]}</Table.Th><Table.Th ta="right">Transactions</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r, i) => (
            <Table.Tr key={r.d0 ?? i} style={{ cursor: "pointer" }} onClick={() => onPick(d0 ? { [d0]: r.d0 } : {})}>
              <Table.Td>{dimValue(d0, r.d0)}</Table.Td>
              <Table.Td ta="right" style={NUM}>{metricValue(metric, r.value)}</Table.Td>
              <Table.Td ta="right" style={NUM}>{r.n}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
