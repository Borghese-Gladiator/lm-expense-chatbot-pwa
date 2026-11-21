import {
  Alert, Button, Checkbox, Code, Drawer, Group, NativeSelect, NumberInput, SimpleGrid, Table, Text, Textarea, TextInput, Title,
} from "@mantine/core";
import { useState } from "react";

import { api } from "./api";
import { money2 } from "./format";
import { LoadState, useApp, useAsync } from "./shared";

interface Detail {
  id: number;
  date: string;
  amount: number;
  currency: string;
  payee_raw: string | null;
  merchant: string | null;
  account: string;
  category_id: number | null;
  category: string | null;
  tags: string[];
  notes: string | null;
  type: string | null;
  is_pending: boolean;
  reviewed: boolean;
  user_edited: boolean;
  source: string;
  source_id: string | null;
  raw: unknown;
  created_at: string;
  updated_at: string;
  parent_id: number | null;
  children: { id: number; amount: number; category_id: number | null }[];
}

interface Part {
  amount: number | string;
  category_id: string;
}

const cents = (n: number | string) => Math.round(Number(n || 0) * 100);

interface Change {
  id: number;
  source: string;
  rule_id: number | null;
  field: string;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}

const show = (v: unknown) => (v === null || v === "" ? "—" : Array.isArray(v) ? v.join(", ") || "—" : String(v));

export function TxnDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { meta, bump, version } = useApp();
  const { data, error, loading } = useAsync(() => api<Detail>(`/transactions/${id}`), [id, version]);
  const history = useAsync(() => api<Change[]>(`/transactions/${id}/history`), [id, version]);
  const [draft, setDraft] = useState<Partial<Detail> & { tagText?: string }>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [parts, setParts] = useState<Part[] | null>(null);
  const [splitError, setSplitError] = useState<string | null>(null);

  const shell = (title: React.ReactNode, body: React.ReactNode) => (
    <Drawer opened onClose={onClose} position="right" size="xl" title={title} closeButtonProps={{ "aria-label": "Close" }}>
      {body}
    </Drawer>
  );

  if (!data) return shell(<Title order={2} size="h4">Transaction</Title>, <LoadState loading={loading} error={error} />);

  const v = { ...data, ...draft };
  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await api(`/transactions/${id}`, {
        merchant: v.merchant,
        category_id: v.category_id ?? undefined,
        clear_category: v.category_id == null,
        tags: draft.tagText !== undefined ? draft.tagText.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        notes: v.notes ?? undefined,
        type: v.type ?? undefined,
        clear_type: v.type == null,
        reviewed: v.reviewed,
      }, "PATCH");
      setDraft({});
      bump();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const dir = data.amount < 0 ? -1 : 1;
  const total = Math.abs(cents(data.amount));
  const remainder = total - (parts ?? []).reduce((n, p) => n + cents(p.amount), 0);
  const startSplit = () => {
    setSplitError(null);
    setParts(
      data.children.length
        ? data.children.map((c) => ({ amount: Math.abs(c.amount) * (c.amount * dir < 0 ? -1 : 1), category_id: c.category_id == null ? "" : String(c.category_id) }))
        : [{ amount: Math.abs(data.amount), category_id: "" }, { amount: "", category_id: "" }],
    );
  };
  const saveSplit = async () => {
    setSplitError(null);
    try {
      await api(`/transactions/${id}/split`, {
        parts: parts!.map((p) => ({ amount: dir * Number(p.amount), category_id: p.category_id ? Number(p.category_id) : null })),
      }, "PUT");
      setParts(null);
      bump();
    } catch (e) {
      setSplitError((e as Error).message);
    }
  };
  const removeSplit = async () => {
    if (!confirm("Remove the split? The parts are deleted and this transaction counts again.")) return;
    await api(`/transactions/${id}/split`, undefined, "DELETE");
    setParts(null);
    bump();
  };

  return shell(
    <div>
      <Title order={2} size="h4">{data.merchant ?? data.payee_raw}</Title>
      <Text c="dimmed" size="sm">{data.date} · {data.account} · {money2(data.amount)} {data.currency}</Text>
    </div>,
    <>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label="Merchant" value={v.merchant ?? ""} onChange={(e) => setDraft({ ...draft, merchant: e.target.value })} />
        <NativeSelect
          label="Category"
          value={v.category_id ?? ""}
          onChange={(e) => setDraft({ ...draft, category_id: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Uncategorized</option>
          {meta?.categories.filter((c) => !c.archived || c.id === v.category_id).map((c) => (
            <option key={c.id} value={c.id}>{c.group_name ? `${c.group_name} › ` : ""}{c.name}</option>
          ))}
        </NativeSelect>
        <NativeSelect label="Type" value={v.type ?? ""} onChange={(e) => setDraft({ ...draft, type: e.target.value || null })}>
          <option value="">From category</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="transfer">Transfer</option>
          <option value="adjustment">Adjustment</option>
        </NativeSelect>
        <TextInput
          label="Tags (comma separated)"
          value={draft.tagText ?? data.tags.join(", ")}
          onChange={(e) => setDraft({ ...draft, tagText: e.target.value })}
        />
      </SimpleGrid>
      <Textarea mt="sm" label="Notes" rows={2} value={v.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
      <Checkbox mt="sm" label="Reviewed" checked={v.reviewed} onChange={(e) => setDraft({ ...draft, reviewed: e.currentTarget.checked })} />
      <Group mt="md">
        <Button onClick={save} disabled={Object.keys(draft).length === 0} loading={saving}>Save</Button>
        {saveError && <Text c="red" size="sm">{saveError}</Text>}
      </Group>
      <Button
        mt="sm"
        size="xs"
        variant="default"
        component="a"
        href={`#settings?rule=${encodeURIComponent(JSON.stringify({
          text: data.merchant ?? data.payee_raw ?? "",
          category: data.category_id == null ? null : String(data.category_id),
          type: data.type,
        }))}`}
        onClick={onClose}
      >
        Make a rule from this transaction
      </Button>
      <Title order={3} size="h6" mt="xl" mb="xs">Split</Title>
      {data.parent_id != null ? (
        <Text size="sm" c="dimmed">This is one part of a split. Open the original transaction to change the split.</Text>
      ) : parts ? (
        <>
          {parts.map((p, i) => (
            <Group key={i} gap="sm" mb="xs" align="flex-end" wrap="nowrap">
              <NumberInput label={i === 0 ? "Amount" : undefined} aria-label={`Part ${i + 1} amount`} decimalScale={2} fixedDecimalScale hideControls value={p.amount} onChange={(v) => setParts(parts.map((x, j) => (j === i ? { ...x, amount: v } : x)))} w={120} />
              <NativeSelect label={i === 0 ? "Category" : undefined} aria-label={`Part ${i + 1} category`} value={p.category_id} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, category_id: e.target.value } : x)))} style={{ flex: 1 }}>
                <option value="">Uncategorized</option>
                {meta?.categories.filter((c) => !c.archived).map((c) => (
                  <option key={c.id} value={c.id}>{c.group_name ? `${c.group_name} › ` : ""}{c.name}</option>
                ))}
              </NativeSelect>
              <Button variant="subtle" color="red" size="xs" disabled={parts.length <= 2} aria-label={`Remove part ${i + 1}`} onClick={() => setParts(parts.filter((_, j) => j !== i))}>Remove</Button>
            </Group>
          ))}
          <Text size="sm" c={remainder === 0 ? "dimmed" : "red"} role="status">
            {remainder === 0 ? "The parts add up." : `${money2(Math.abs(remainder) / 100)} ${remainder > 0 ? "left to assign" : "over the total"}.`}
          </Text>
          {splitError && <Alert color="red" mt="xs" role="alert">{splitError}</Alert>}
          <Group mt="sm">
            <Button size="xs" variant="default" disabled={parts.length >= 50} onClick={() => setParts([...parts, { amount: remainder > 0 ? remainder / 100 : "", category_id: "" }])}>Add part</Button>
            <Button size="xs" disabled={remainder !== 0 || parts.some((p) => cents(p.amount) === 0)} onClick={saveSplit}>Save split</Button>
            <Button size="xs" variant="default" onClick={() => setParts(null)}>Cancel</Button>
          </Group>
        </>
      ) : data.children.length ? (
        <>
          <Table fz="sm" withRowBorders={false} verticalSpacing={2}>
            <Table.Tbody>
              {data.children.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>{meta?.categories.find((k) => k.id === c.category_id)?.name ?? "Uncategorized"}</Table.Td>
                  <Table.Td ta="right">{money2(c.amount)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group mt="xs">
            <Button size="xs" variant="default" onClick={startSplit}>Edit split</Button>
            <Button size="xs" variant="subtle" color="red" onClick={removeSplit}>Remove split</Button>
          </Group>
        </>
      ) : (
        <Button size="xs" variant="default" onClick={startSplit}>Split this transaction</Button>
      )}
      <Title order={3} size="h6" mt="xl" mb="xs">History</Title>
      {history.data?.length ? (
        <Table fz="sm" withRowBorders={false} verticalSpacing={2}>
          <Table.Tbody>
            {history.data.map((c) => {
              const label = (x: unknown) =>
                c.field === "category_id" && x !== null ? (meta?.categories.find((k) => k.id === Number(x))?.name ?? String(x)) : show(x);
              return (
                <Table.Tr key={c.id}>
                  <Table.Td>{c.created_at.slice(0, 16).replace("T", " ")}</Table.Td>
                  <Table.Td>{c.source === "rule" ? `Rule ${c.rule_id}` : c.source === "undo" ? "Undo" : "You"}</Table.Td>
                  <Table.Td>{c.field === "category_id" ? "category" : c.field}: {label(c.old_value)} → {label(c.new_value)}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      ) : (
        <Text size="sm" c="dimmed">No changes yet</Text>
      )}
      <Title order={3} size="h6" mt="xl" mb="xs">Source record</Title>
      <Table fz="sm" withRowBorders={false} verticalSpacing={2}>
        <Table.Tbody>
          <Table.Tr><Table.Th w={120}>Payee (raw)</Table.Th><Table.Td>{data.payee_raw ?? "—"}</Table.Td></Table.Tr>
          <Table.Tr><Table.Th>Source</Table.Th><Table.Td>{data.source}{data.source_id ? ` · ${data.source_id}` : ""}</Table.Td></Table.Tr>
          <Table.Tr><Table.Th>Status</Table.Th><Table.Td>{data.is_pending ? "Pending" : "Posted"}{data.user_edited ? " · edited by you" : ""}</Table.Td></Table.Tr>
          <Table.Tr><Table.Th>Updated</Table.Th><Table.Td>{data.updated_at}</Table.Td></Table.Tr>
        </Table.Tbody>
      </Table>
      <details>
        <summary>Raw data</summary>
        <Code block mah={320} style={{ overflow: "auto" }}>{JSON.stringify(data.raw, null, 2)}</Code>
      </details>
    </>,
  );
}
