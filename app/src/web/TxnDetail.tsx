import {
  Button, Checkbox, Code, Drawer, Group, NativeSelect, SimpleGrid, Table, Text, Textarea, TextInput, Title,
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
}

export function TxnDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { meta, bump, version } = useApp();
  const { data, error, loading } = useAsync(() => api<Detail>(`/transactions/${id}`), [id, version]);
  const [draft, setDraft] = useState<Partial<Detail> & { tagText?: string }>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
