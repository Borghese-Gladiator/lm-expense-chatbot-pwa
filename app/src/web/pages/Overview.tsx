import { Card, Group, Select, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useState } from "react";

import type { AnalyticsQuery, Measure, QueryResult } from "../api";
import { runQuery } from "../api";
import { Chart } from "../Chart";
import type { Preset } from "../format";
import { dimValue, iso, money, pct, PRESETS, presetRange, signedMoney } from "../format";
import { LoadState, useApp, useAsync } from "../shared";

const base = (measure: Measure, start: string, end: string, extra: Partial<AnalyticsQuery> = {}): AnalyticsQuery => ({
  measure,
  metric: "total",
  dimensions: [],
  filters: { start, end },
  compare: "previous_period",
  ...extra,
});

const NUM = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } as const;

function Kpi({ label, value, previous, upIsGood }: { label: string; value: number; previous: number; upIsGood: boolean }) {
  const diff = value - previous;
  const change = previous ? (diff / Math.abs(previous)) * 100 : null;
  const good = diff === 0 ? null : diff > 0 === upIsGood;
  return (
    <Card withBorder padding="md">
      <Text size="sm" c="dimmed">{label}</Text>
      <Text size="xl" fw={600} style={NUM}>{label === "Savings rate" ? `${value.toFixed(1)}%` : money(value)}</Text>
      <Text size="sm" c={good === null ? undefined : good ? "teal" : "red"}>
        {diff === 0 ? "No change" : (
          <>
            <span aria-hidden>{diff > 0 ? "▲" : "▼"}</span>{" "}
            {label === "Savings rate" ? `${diff > 0 ? "+" : ""}${diff.toFixed(1)} pts` : `${signedMoney(diff)} (${pct(change)})`}
          </>
        )}
        <Text span c="dimmed" inherit> vs previous period</Text>
      </Text>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card withBorder component="section" padding="md">
      <Title order={2} size="h4" mb="sm">{title}</Title>
      {children}
    </Card>
  );
}

export function Overview() {
  const { openDrill, version, meta } = useApp();
  const [preset, setPreset] = useState<Preset>("last_month");
  const [custom, setCustom] = useState<[string | null, string | null]>([null, null]);
  const range = preset === "custom" ? { start: custom[0], end: custom[1] } : presetRange(preset);
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
    <Stack p="md" gap="md">
      <Group justify="space-between" wrap="wrap">
        <Title order={1} size="h2">Overview</Title>
        <Group gap="sm">
          <Select
            aria-label="Date range"
            data={PRESETS.map((p) => ({ value: p.id, label: p.label }))}
            value={preset}
            onChange={(v) => v && setPreset(v as Preset)}
            allowDeselect={false}
            w={170}
          />
          {preset === "custom" && (
            <DatePickerInput type="range" aria-label="Custom range" placeholder="Pick dates" value={custom} onChange={setCustom} valueFormat="YYYY-MM-DD" w={240} />
          )}
          <Text c="dimmed" size="sm">{start} → {end}</Text>
        </Group>
      </Group>
      <LoadState loading={loading && !data} error={error} empty={meta?.date_bounds.start == null} />
      {data && s && i && (
        <>
          <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
            <Kpi label="Income" value={i.current!} previous={i.previous!} upIsGood />
            <Kpi label="Spending" value={s.current!} previous={s.previous!} upIsGood={false} />
            <Kpi label="Net cash flow" value={i.current! - s.current!} previous={i.previous! - s.previous!} upIsGood />
            <Kpi label="Savings rate" value={rate(i.current!, s.current!)} previous={rate(i.previous!, s.previous!)} upIsGood />
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Section title="Spending, last 12 months">
              <Chart
                rows={data.trend.rows}
                dimensions={["month"]}
                metric="total"
                kind="bar"
                horizontal={false}
                height={260}
                onPick={(v) => openDrill({ title: `Spending · ${dimValue("month", v.month)}`, query: base("spending", "1900-01-01", end, { compare: "none", dimensions: ["month"] }), values: v })}
              />
            </Section>
            <Section title="Spending by category">
              <Chart
                rows={data.cats.rows}
                dimensions={["category"]}
                metric="total"
                kind="bar"
                height={260}
                onPick={(v) => openDrill({ title: `Spending · ${v.category}`, query: base("spending", start, end, { compare: "none", dimensions: ["category"] }), values: v })}
              />
            </Section>
            <Section title="What changed vs the previous period">
              <ChangeTable result={data.change} onPick={(cat) => openDrill({ title: `${cat} · this period`, query: base("spending", start, end, { dimensions: ["category"] }), values: { category: cat } })} />
            </Section>
            <Section title="Top merchants">
              <Chart
                rows={data.merchants.rows}
                dimensions={["merchant"]}
                metric="total"
                kind="bar"
                height={260}
                onPick={(v) => openDrill({ title: `Spending · ${v.merchant}`, query: base("spending", start, end, { compare: "none", dimensions: ["merchant"] }), values: v })}
              />
            </Section>
          </SimpleGrid>
          <Section title="Largest expenses">
            {largest.data && (
              <Table fz="sm">
                <Table.Tbody>
                  {largest.data.transactions.map((t: { id: number; date: string; merchant: string; category: string; value: number }) => (
                    <Table.Tr key={t.id}>
                      <Table.Td c="dimmed" style={NUM}>{t.date}</Table.Td>
                      <Table.Td>{t.merchant} <Text span c="dimmed" inherit>· {t.category}</Text></Table.Td>
                      <Table.Td ta="right" style={NUM}>{money(t.value)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Section>
        </>
      )}
    </Stack>
  );
}

export function ChangeTable({ result, onPick, label = "Category" }: { result: QueryResult; onPick: (v: string) => void; label?: string }) {
  if (!result.rows.length) return <Text c="dimmed" ta="center" p="xl">No spending in either period.</Text>;
  return (
    <Table.ScrollContainer minWidth={480}>
      <Table highlightOnHover fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{label}</Table.Th>
            <Table.Th ta="right">Previous</Table.Th>
            <Table.Th ta="right">Current</Table.Th>
            <Table.Th ta="right">Change</Table.Th>
            <Table.Th ta="right">Share of change</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {result.rows.map((r) => (
            <Table.Tr key={r.d0} style={{ cursor: "pointer" }} onClick={() => onPick(r.d0!)}>
              <Table.Td>{r.d0}</Table.Td>
              <Table.Td ta="right" style={NUM}>{money(r.previous)}</Table.Td>
              <Table.Td ta="right" style={NUM}>{money(r.current)}</Table.Td>
              <Table.Td ta="right" style={NUM} c={r.diff! > 0 ? "red" : r.diff! < 0 ? "teal" : undefined}>
                {signedMoney(r.diff!)} <Text span c="dimmed" inherit>{pct(r.pct)}</Text>
              </Table.Td>
              <Table.Td ta="right" style={NUM}>{r.contribution == null ? "—" : `${r.contribution.toFixed(0)}%`}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
