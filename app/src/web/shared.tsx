import { Alert, Badge, Center, Checkbox, Drawer, Group, Loader, Table, Text, Title } from "@mantine/core";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

import type { Drill, Meta, Txn } from "./api";
import { api } from "./api";
import { money2 } from "./format";

interface AppCtx {
  meta: Meta | null;
  reloadMeta: () => Promise<void>;
  openDrill: (d: Drill) => void;
  openTxn: (id: number) => void;
  version: number;
  bump: () => void;
}

export const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fn()
      .then((d) => live && (setData(d), setError(null)))
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading };
}

export function Status({
  loading, error, empty, emptyText = "No transactions match these filters.",
}: { loading?: boolean; error?: string | null; empty?: boolean; emptyText?: string }) {
  if (error) return <Alert color="red" role="alert" my="md">{error}</Alert>;
  if (loading) return <Center p="xl"><Loader size="sm" aria-label="Loading" /></Center>;
  if (empty) return <Text c="dimmed" ta="center" p="xl">{emptyText}</Text>;
  return null;
}

export function Amount({ v }: { v: number }) {
  return <Text span inherit c={v > 0 ? "teal" : undefined} style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{money2(v)}</Text>;
}

export function TxnTable({
  items,
  onRowClick,
  selected,
  onToggle,
  extra,
}: {
  items: Txn[];
  onRowClick?: (t: Txn) => void;
  selected?: Set<number>;
  onToggle?: (id: number) => void;
  extra?: (t: Txn) => React.ReactNode;
}) {
  return (
    <Table.ScrollContainer minWidth={600}>
      <Table highlightOnHover={!!onRowClick} fz="sm">
        <Table.Thead>
          <Table.Tr>
            {onToggle && <Table.Th aria-label="Select" />}
            <Table.Th>Date</Table.Th>
            <Table.Th>Merchant</Table.Th>
            <Table.Th>Category</Table.Th>
            <Table.Th>Account</Table.Th>
            <Table.Th>Tags</Table.Th>
            <Table.Th ta="right">Amount</Table.Th>
            {extra && <Table.Th />}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((t) => (
            <Table.Tr key={t.id} onClick={() => onRowClick?.(t)} style={onRowClick ? { cursor: "pointer" } : undefined}>
              {onToggle && (
                <Table.Td onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    aria-label={`Select ${t.merchant}`}
                    checked={selected?.has(t.id) ?? false}
                    onChange={() => onToggle(t.id)}
                  />
                </Table.Td>
              )}
              <Table.Td style={{ whiteSpace: "nowrap" }}>{t.date}</Table.Td>
              <Table.Td>
                {t.merchant}
                {t.is_pending && <Badge variant="outline" color="gray" size="xs" ml={6}>pending</Badge>}
                {t.txn_type === "transfer" && <Badge variant="outline" color="gray" size="xs" ml={6}>transfer</Badge>}
              </Table.Td>
              <Table.Td>{t.category}</Table.Td>
              <Table.Td c="dimmed">{t.account}</Table.Td>
              <Table.Td>
                <Group gap={4}>{t.tags.map((g) => <Badge key={g} variant="light" size="xs">{g}</Badge>)}</Group>
              </Table.Td>
              <Table.Td ta="right"><Amount v={t.amount} /></Table.Td>
              {extra && <Table.Td onClick={(e) => e.stopPropagation()}>{extra(t)}</Table.Td>}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

export function DrillDrawer({ drill, onClose }: { drill: Drill; onClose: () => void }) {
  const { openTxn, version } = useApp();
  const [query, setQuery] = useState(drill.query);
  useEffect(() => setQuery(drill.query), [drill]);
  const { data, error, loading } = useAsync(
    () =>
      api<{ transactions: Txn[]; total: number; count: number }>("/analytics/drilldown", {
        query,
        values: drill.values,
        use_compare_range: drill.use_compare_range ?? false,
      }),
    [JSON.stringify(query), JSON.stringify(drill.values), drill.use_compare_range, version],
  );
  const onExclude = drill.onExclude
    ? (id: number) => {
        drill.onExclude!(id);
        setQuery((q) => ({ ...q, filters: { ...q.filters, exclude_ids: [...(q.filters.exclude_ids ?? []), id] } }));
      }
    : undefined;
  return (
    <Drawer
      opened
      onClose={onClose}
      position="right"
      size="xl"
      closeButtonProps={{ "aria-label": "Close" }}
      title={
        <div>
          <Title order={2} size="h4">{drill.title}</Title>
          {data && (
            <Text c="dimmed" size="sm">
              {data.count} transactions · {money2(data.total)}
            </Text>
          )}
        </div>
      }
    >
      <Status loading={loading} error={error} empty={data?.count === 0} />
      {data && data.count > 0 && (
        <TxnTable
          items={data.transactions}
          onRowClick={(t) => openTxn(t.id)}
          extra={
            onExclude
              ? (t) => (
                  <button className="small" title="Leave this transaction out of the analysis" onClick={() => onExclude(t.id)}>
                    Exclude
                  </button>
                )
              : undefined
          }
        />
      )}
    </Drawer>
  );
}

export function useMeta() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const reloadMeta = useCallback(async () => setMeta(await api<Meta>("/meta")), []);
  useEffect(() => {
    reloadMeta();
  }, [reloadMeta]);
  return { meta, reloadMeta };
}
