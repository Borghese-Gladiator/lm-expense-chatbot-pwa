import { Alert, Button, Card, Checkbox, Group, NumberInput, Select, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { DatePickerInput, DateInput } from "@mantine/dates";
import { useState } from "react";

import type { Filters, Txn } from "../api";
import { api } from "../api";
import { money2 } from "../format";
import { LoadState, TransactionTable, useApp, useAsync } from "../shared";

const PAGE = 100;

export function Transactions() {
  const { meta, openTxn, version, bump } = useApp();
  const [filters, setFilters] = useState<Filters>({ include_pending: true, include_excluded_categories: true });
  const [flags, setFlags] = useState({ uncategorized: false, unreviewed: false });
  const [sort, setSort] = useState<{ sort: string; desc: boolean }>({ sort: "date", desc: true });
  const [cursors, setCursors] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [dupes, setDupes] = useState(false);
  const [bulkCat, setBulkCat] = useState<string | null>(null);

  const page = cursors.length;
  const body = { filters, ...flags, ...sort, cursor: cursors[page - 1] ?? null, limit: PAGE };
  const { data, error, loading } = useAsync(
    () => api<{ items: Txn[]; next_cursor: string | null; total: number; sum: number }>("/transactions/search", body),
    [JSON.stringify(body), version],
  );

  const setF = (p: Partial<Filters>) => {
    setCursors([]);
    setFilters({ ...filters, ...p });
  };
  const toggle = (id: number) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const bulk = async (patch: Record<string, unknown>) => {
    await api("/transactions/bulk", { ids: [...selected], patch });
    setSelected(new Set());
    bump();
  };
  const exportCsv = async () => {
    const res = await fetch("/api/transactions/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters, ...flags }),
    });
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const accountData = (meta?.accounts ?? []).map((a) => ({ value: String(a.id), label: a.name }));
  const categoryData = (meta?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name }));

  return (
    <Stack p="md" gap="md">
      <Group justify="space-between" wrap="wrap">
        <Title order={1} size="h2">Transactions</Title>
        <Group gap="sm">
          <Button variant="default" onClick={() => setDupes(!dupes)}>{dupes ? "Hide possible duplicates" : "Possible duplicates"}</Button>
          <Button variant="default" onClick={exportCsv}>Export CSV</Button>
          <Button onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "Add transaction"}</Button>
        </Group>
      </Group>
      {adding && <AddTxn onDone={() => { setAdding(false); bump(); }} />}
      {dupes && <Duplicates />}
      <Card withBorder component="section" padding="md">
        <Stack gap="sm">
          <Group gap="sm" wrap="wrap" align="center">
            <TextInput placeholder="Search payee, merchant, notes" aria-label="Search" value={filters.search ?? ""} onChange={(e) => setF({ search: e.currentTarget.value || null })} w={240} />
            <DatePickerInput
              type="range"
              aria-label="Date range"
              placeholder="Any date"
              clearable
              valueFormat="YYYY-MM-DD"
              value={[filters.start ?? null, filters.end ?? null]}
              onChange={([s, e]) => setF({ start: s, end: e })}
              w={240}
            />
            <Select aria-label="Account" placeholder="All accounts" clearable data={accountData} value={filters.account_ids?.[0] != null ? String(filters.account_ids[0]) : null} onChange={(v) => setF({ account_ids: v ? [Number(v)] : [] })} w={170} />
            <Select aria-label="Category" placeholder="All categories" clearable searchable data={categoryData} value={filters.category_ids?.[0] != null ? String(filters.category_ids[0]) : null} onChange={(v) => setF({ category_ids: v ? [Number(v)] : [] })} w={170} />
            <Select
              aria-label="Type"
              placeholder="All types"
              clearable
              data={[
                { value: "expense", label: "Expense" },
                { value: "income", label: "Income" },
                { value: "transfer", label: "Transfer" },
                { value: "adjustment", label: "Adjustment" },
              ]}
              value={filters.types?.[0] ?? null}
              onChange={(v) => setF({ types: v ? [v] : [] })}
              w={140}
            />
            <Select
              aria-label="Sort"
              allowDeselect={false}
              data={[
                { value: "date:true", label: "Newest first" },
                { value: "date:false", label: "Oldest first" },
                { value: "amount:false", label: "Largest expense first" },
                { value: "amount:true", label: "Largest income first" },
                { value: "merchant:false", label: "Merchant A–Z" },
              ]}
              value={`${sort.sort}:${sort.desc}`}
              onChange={(v) => { if (!v) return; const [s, d] = v.split(":"); setCursors([]); setSort({ sort: s, desc: d === "true" }); }}
              w={190}
            />
            <Checkbox label="Uncategorized" checked={flags.uncategorized} onChange={(e) => { setCursors([]); setFlags({ ...flags, uncategorized: e.currentTarget.checked }); }} />
            <Checkbox label="Unreviewed" checked={flags.unreviewed} onChange={(e) => { setCursors([]); setFlags({ ...flags, unreviewed: e.currentTarget.checked }); }} />
          </Group>
          {selected.size > 0 && (
            <Group gap="sm" wrap="wrap">
              <Text fw={600}>{selected.size} selected</Text>
              <Select aria-label="Set category" placeholder="Set category…" searchable data={categoryData} value={bulkCat} onChange={setBulkCat} w={190} />
              <Button size="xs" disabled={!bulkCat} onClick={() => bulk({ category_id: Number(bulkCat) })}>Apply</Button>
              <Button size="xs" variant="default" onClick={() => bulk({ reviewed: true })}>Mark reviewed</Button>
              <Button size="xs" variant="default" onClick={() => bulk({ type: "transfer" })}>Mark as transfer</Button>
              <Button size="xs" variant="subtle" onClick={() => setSelected(new Set())}>Clear</Button>
            </Group>
          )}
          {data && (
            <Text c="dimmed" size="sm">
              {data.total.toLocaleString()} transactions · net {money2(data.sum)}
            </Text>
          )}
          <LoadState loading={loading && !data} error={error} empty={data?.total === 0} />
          {data && data.items.length > 0 && (
            <>
              <TransactionTable items={data.items} onRowClick={(t) => openTxn(t.id)} selected={selected} onToggle={toggle} />
              <Group justify="center" gap="md">
                <Button variant="subtle" disabled={page === 0} onClick={() => setCursors(cursors.slice(0, -1))}>← Previous</Button>
                <Text c="dimmed" size="sm">{page * PAGE + 1}–{page * PAGE + data.items.length} of {data.total}</Text>
                <Button variant="subtle" disabled={!data.next_cursor} onClick={() => setCursors([...cursors, data.next_cursor!])}>Next →</Button>
              </Group>
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}

interface Pair {
  plaid_id: number;
  csv_id: number;
  account: string;
  amount: number;
  plaid_date: string;
  csv_date: string;
  plaid_payee: string | null;
  csv_payee: string | null;
}

function Duplicates() {
  const { version, bump } = useApp();
  const { data, error, loading } = useAsync(() => api<Pair[]>("/duplicates"), [version]);
  const [err, setErr] = useState<string | null>(null);
  const resolve = async (keep: number, remove: number, not_duplicate = false) => {
    setErr(null);
    try {
      await api("/duplicates/resolve", { keep, remove, not_duplicate });
      bump();
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };
  return (
    <Card withBorder component="section" padding="md" aria-labelledby="dupes-title">
      <Stack gap="sm">
        <Title order={2} size="h4" id="dupes-title">Possible duplicates</Title>
        <Text c="dimmed" size="sm">A bank row and a CSV row on one account with the same amount, at most 3 days apart.</Text>
        <LoadState loading={loading && !data} error={error} empty={data?.length === 0} />
        {err && <Text c="red" size="sm">{err}</Text>}
        {data && data.length > 0 && (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Account</Table.Th>
                <Table.Th>Bank row</Table.Th>
                <Table.Th>CSV row</Table.Th>
                <Table.Th ta="right">Amount</Table.Th>
                <Table.Th>Action</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.map((p) => (
                <Table.Tr key={`${p.plaid_id}-${p.csv_id}`}>
                  <Table.Td>{p.account}</Table.Td>
                  <Table.Td>{p.plaid_date} · {p.plaid_payee}</Table.Td>
                  <Table.Td>{p.csv_date} · {p.csv_payee}</Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>{money2(p.amount)}</Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="wrap">
                      <Button size="xs" variant="default" onClick={() => resolve(p.plaid_id, p.csv_id)}>Keep bank row</Button>
                      <Button size="xs" variant="default" onClick={() => resolve(p.csv_id, p.plaid_id)}>Keep CSV row</Button>
                      <Button size="xs" variant="subtle" onClick={() => resolve(p.plaid_id, p.csv_id, true)}>Not a duplicate</Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Card>
  );
}

function AddTxn({ onDone }: { onDone: () => void }) {
  const { meta } = useApp();
  const [form, setForm] = useState({
    account_id: null as string | null,
    date: new Date().toISOString().slice(0, 10) as string | null,
    amount: "" as string | number,
    payee: "",
    category_id: null as string | null,
    direction: "out",
  });
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      const amount = Math.abs(Number(form.amount)) * (form.direction === "out" ? -1 : 1);
      await api("/transactions", {
        account_id: Number(form.account_id),
        date: form.date,
        amount,
        payee: form.payee,
        category_id: form.category_id ? Number(form.category_id) : null,
      });
      onDone();
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };
  if (!meta?.accounts.length) return <Alert color="gray">Add an account on the Accounts page first.</Alert>;
  return (
    <Card withBorder component="form" padding="md" onSubmit={submit}>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <Select label="Account" required placeholder="Choose…" data={meta.accounts.map((a) => ({ value: String(a.id), label: a.name }))} value={form.account_id} onChange={(v) => setForm({ ...form, account_id: v })} w={180} />
        <DateInput label="Date" required valueFormat="YYYY-MM-DD" value={form.date} onChange={(v) => setForm({ ...form, date: v })} w={150} />
        <TextInput label="Payee" required value={form.payee} onChange={(e) => setForm({ ...form, payee: e.currentTarget.value })} w={180} />
        <NumberInput label="Amount" required min={0} decimalScale={2} value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} w={120} />
        <Select label="Direction" allowDeselect={false} data={[{ value: "out", label: "Money out" }, { value: "in", label: "Money in" }]} value={form.direction} onChange={(v) => v && setForm({ ...form, direction: v })} w={140} />
        <Select label="Category" placeholder="Uncategorized" clearable searchable data={meta.categories.map((c) => ({ value: String(c.id), label: c.name }))} value={form.category_id} onChange={(v) => setForm({ ...form, category_id: v })} w={180} />
        <Button type="submit">Add</Button>
      </Group>
      {err && <Text c="red" size="sm" mt="sm">{err}</Text>}
    </Card>
  );
}
