import { Anchor, Button, Card, Checkbox, Group, Modal, Select, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";

import type { Category } from "../api";
import { api } from "../api";
import { money2 } from "../format";
import { useApp } from "../shared";

const EMPTY: Omit<Category, "id"> = { name: "", group_name: "", kind: "expense", exclude_from_totals: false, archived: false };

const KINDS = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

function CategoryRow({ cat, onSaved }: { cat: Category; onSaved: () => void }) {
  const [v, setV] = useState(cat);
  const dirty = JSON.stringify(v) !== JSON.stringify(cat);
  return (
    <Table.Tr>
      <Table.Td><TextInput size="xs" aria-label="Name" value={v.name} onChange={(e) => setV({ ...v, name: e.currentTarget.value })} /></Table.Td>
      <Table.Td><TextInput size="xs" aria-label="Group" value={v.group_name ?? ""} onChange={(e) => setV({ ...v, group_name: e.currentTarget.value || null })} /></Table.Td>
      <Table.Td>
        <Select size="xs" aria-label="Kind" allowDeselect={false} data={KINDS} value={v.kind} onChange={(k) => k && setV({ ...v, kind: k as Category["kind"] })} w={120} />
      </Table.Td>
      <Table.Td><Checkbox aria-label="Exclude from totals" checked={v.exclude_from_totals} onChange={(e) => setV({ ...v, exclude_from_totals: e.currentTarget.checked })} /></Table.Td>
      <Table.Td><Checkbox aria-label="Archived" checked={v.archived} onChange={(e) => setV({ ...v, archived: e.currentTarget.checked })} /></Table.Td>
      <Table.Td>
        <Button size="xs" variant="default" disabled={!dirty} onClick={async () => {
          await api(`/categories/${cat.id}`, { ...v, group_name: v.group_name || null }, "PUT");
          onSaved();
        }}>Save</Button>
      </Table.Td>
    </Table.Tr>
  );
}

interface Rule {
  id: number;
  text_contains: string | null;
  account_id: number | null;
  account: string | null;
  amount_min: number | null;
  amount_max: number | null;
  set_category_id: number | null;
  category: string | null;
  set_merchant: string | null;
  set_tags: string[];
  set_reviewed: boolean;
  set_type: string | null;
}

interface PreviewRow {
  id: number;
  date: string;
  amount: number;
  payee: string;
  category: string | null;
}

interface RuleForm {
  text: string;
  merchant: string;
  category: string | null;
  type: string | null;
  tags: string;
  reviewed: boolean;
}

const BLANK: RuleForm = { text: "", merchant: "", category: null, type: null, tags: "", reviewed: false };

function formFromHash(): RuleForm | null {
  const m = /[?&]rule=([^&]+)/.exec(location.hash);
  if (!m) return null;
  try {
    return { ...BLANK, ...JSON.parse(decodeURIComponent(m[1])) };
  } catch {
    return null;
  }
}

const TYPES = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer (not spending)" },
  { value: "adjustment", label: "Adjustment" },
];

const toForm = (r: Rule): RuleForm => ({
  text: r.text_contains ?? "",
  merchant: r.set_merchant ?? "",
  category: r.set_category_id == null ? null : String(r.set_category_id),
  type: r.set_type,
  tags: r.set_tags.join(", "),
  reviewed: r.set_reviewed,
});

function describe(r: Rule): [string, string] {
  const when = [
    r.text_contains && `text contains "${r.text_contains}"`,
    r.account && `account is ${r.account}`,
    r.amount_min !== null && `amount ≥ ${r.amount_min}`,
    r.amount_max !== null && `amount ≤ ${r.amount_max}`,
  ].filter(Boolean);
  const then = [
    r.category && `category ${r.category}`,
    r.set_merchant && `merchant ${r.set_merchant}`,
    r.set_type && `type ${r.set_type}`,
    r.set_tags.length > 0 && `tags ${r.set_tags.join(", ")}`,
    r.set_reviewed && "reviewed",
  ].filter(Boolean);
  return [when.join(" and ") || "every row", then.join(", ") || "nothing"];
}

function Rules() {
  const { meta, bump } = useApp();
  const [rules, setRules] = useState<Rule[]>([]);
  const [status, setStatus] = useState<Record<number, string>>({});
  const [execs, setExecs] = useState<Record<number, number>>({});
  const [preview, setPreview] = useState<{ id: number; count: number; items: PreviewRow[] } | null>(null);
  const [form, setForm] = useState<RuleForm>(() => formFromHash() ?? BLANK);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api<Rule[]>("/rules").then(setRules);
  useEffect(() => {
    load();
  }, []);

  const startEdit = (r: Rule) => {
    setEditing(r);
    setForm(toForm(r));
    setErr(null);
  };
  const reset = () => {
    setEditing(null);
    setForm(BLANK);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const body = {
      ...(editing ? { account_id: editing.account_id, amount_min: editing.amount_min, amount_max: editing.amount_max } : {}),
      text_contains: form.text || null,
      set_merchant: form.merchant || null,
      set_category_id: form.category ? Number(form.category) : null,
      set_type: form.type,
      set_tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      set_reviewed: form.reviewed,
    };
    try {
      if (editing) await api(`/rules/${editing.id}`, body, "PUT");
      else await api("/rules", body);
      reset();
      load();
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };

  return (
    <Card withBorder component="section" padding="md">
      <Title order={2} size="h4" mb="xs">Rules</Title>
      <Text c="dimmed" size="sm" mb="sm">
        Rules run on new rows from CSV import and bank sync, in the order shown. A later rule wins over an earlier one.
        A rule never changes a row that you edited. Editing a rule does not change rows that it already changed.
      </Text>
      <Table fz="sm" aria-label="Rules list">
        <Table.Thead>
          <Table.Tr><Table.Th>When</Table.Th><Table.Th>Then set</Table.Th><Table.Th /></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rules.map((r) => {
            const [when, then] = describe(r);
            return (
              <Table.Tr key={r.id}>
                <Table.Td>{when}</Table.Td>
                <Table.Td>{then}</Table.Td>
                <Table.Td>
                  <Group gap="xs" wrap="wrap">
                    <Button size="xs" variant="default" onClick={async () => {
                      const p = await api<{ count: number; items: PreviewRow[] }>(`/rules/${r.id}/preview`, {});
                      setPreview({ id: r.id, ...p });
                      setStatus((s) => ({ ...s, [r.id]: `${p.count} matching ${p.count === 1 ? "row" : "rows"}` }));
                    }}>Preview</Button>
                    <Button size="xs" variant="default" onClick={() => startEdit(r)}>Edit</Button>
                    <Button size="xs" onClick={async () => {
                      const a = await api<{ execution_id: number; changed: number }>(`/rules/${r.id}/apply`, {});
                      setExecs((e) => ({ ...e, [r.id]: a.execution_id }));
                      setStatus((s) => ({ ...s, [r.id]: `Changed ${a.changed} ${a.changed === 1 ? "row" : "rows"}` }));
                      bump();
                    }}>Apply to past transactions</Button>
                    {execs[r.id] && (
                      <Button size="xs" variant="default" onClick={async () => {
                        const u = await api<{ restored: number }>(`/rule-executions/${execs[r.id]}/undo`, {});
                        setExecs(({ [r.id]: _, ...rest }) => rest);
                        setStatus((s) => ({ ...s, [r.id]: `Restored ${u.restored} ${u.restored === 1 ? "row" : "rows"}` }));
                        bump();
                      }}>Undo</Button>
                    )}
                    <Button size="xs" variant="default" onClick={async () => {
                      await api(`/rules/${r.id}`, undefined, "DELETE");
                      if (editing?.id === r.id) reset();
                      if (preview?.id === r.id) setPreview(null);
                      load();
                    }}>Delete</Button>
                    {status[r.id] && <Text size="sm" role="status">{status[r.id]}</Text>}
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>

      {preview && (
        <Stack gap={4} mt="md" aria-label="Rule preview">
          <Group justify="space-between">
            <Text size="sm" fw={600}>Rule {preview.id} matches {preview.count} {preview.count === 1 ? "row" : "rows"}{preview.count > 20 ? " (first 20 shown)" : ""}</Text>
            <Button size="xs" variant="subtle" onClick={() => setPreview(null)}>Close preview</Button>
          </Group>
          {preview.items.length > 0 && (
            <Table fz="xs" withRowBorders={false} verticalSpacing={2}>
              <Table.Tbody>
                {preview.items.slice(0, 20).map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td>{p.date}</Table.Td>
                    <Table.Td>{p.payee}</Table.Td>
                    <Table.Td c="dimmed">{p.category ?? "Uncategorized"}</Table.Td>
                    <Table.Td ta="right">{money2(p.amount)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Stack>
      )}

      <form onSubmit={submit}>
        <Text fw={600} size="sm" mt="md">{editing ? `Edit rule ${editing.id}` : "Add a rule"}</Text>
        <Group gap="sm" mt="xs" wrap="wrap" align="flex-end">
          <TextInput label="Text contains" placeholder="STARBUCKS" value={form.text} onChange={(e) => setForm({ ...form, text: e.currentTarget.value })} w={180} />
          <TextInput label="Set merchant" placeholder="Starbucks" value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.currentTarget.value })} w={160} />
          <Select label="Set category" searchable clearable data={meta?.categories.map((c) => ({ value: String(c.id), label: c.name })) ?? []} value={form.category} onChange={(v) => setForm({ ...form, category: v })} w={180} />
          <Select label="Set type" clearable data={TYPES} value={form.type} onChange={(v) => setForm({ ...form, type: v })} w={190} />
          <TextInput label="Add tags (comma separated)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.currentTarget.value })} w={190} />
          <Checkbox label="Mark reviewed" checked={form.reviewed} onChange={(e) => setForm({ ...form, reviewed: e.currentTarget.checked })} />
          <Button type="submit" disabled={!form.text && !editing}>{editing ? "Save rule" : "Add rule"}</Button>
          {editing && <Button variant="default" onClick={reset}>Cancel</Button>}
        </Group>
        {err && <Text c="red" size="sm" mt="xs">{err}</Text>}
      </form>
    </Card>
  );
}

interface MerchantRow {
  merchant: string;
  count: number;
}

function Merchants() {
  const { bump, version } = useApp();
  const [rows, setRows] = useState<MerchantRow[]>([]);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ from: string[]; to: string } | null>(null);
  const [msg, setMsg] = useState<{ text: string; ids: number[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api<MerchantRow[]>("/merchants").then(setRows);
  useEffect(() => {
    load();
  }, [version]);

  const shown = rows.filter((r) => r.merchant.toLowerCase().includes(search.trim().toLowerCase()));
  const toggle = (name: string) =>
    setPicked((p) => {
      const next = new Set(p);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  const open = (from: string[]) => {
    setErr(null);
    setDialog({ from, to: from.length === 1 ? from[0] : (rows.find((r) => from.includes(r.merchant))?.merchant ?? from[0]) });
  };
  const save = async () => {
    const d = dialog!;
    setErr(null);
    try {
      const r = await api<{ rules: number; changed: number; execution_ids: number[] }>("/merchants/rename", { from: d.from, to: d.to });
      setDialog(null);
      setPicked(new Set());
      setMsg({ text: `Renamed to ${d.to}. ${r.changed} ${r.changed === 1 ? "row" : "rows"} changed.`, ids: r.execution_ids });
      bump();
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <Card withBorder component="section" padding="md">
      <Title order={2} size="h4" mb="xs">Merchants</Title>
      <Text c="dimmed" size="sm" mb="sm">
        Rename a merchant, or select several names and merge them into one. This makes a rule for each name, so new rows
        get the clean name too. The bank description is not changed.
      </Text>
      <Group gap="sm" mb="sm" wrap="wrap">
        <TextInput placeholder="Search merchants" aria-label="Search merchants" value={search} onChange={(e) => setSearch(e.currentTarget.value)} w={220} />
        <Button disabled={picked.size < 2} onClick={() => open([...picked])}>Merge {picked.size > 1 ? `${picked.size} selected` : "selected"}</Button>
        {msg && (
          <Group gap="xs" role="status">
            <Text size="sm">{msg.text}</Text>
            <Button size="xs" variant="default" onClick={async () => {
              for (const id of msg.ids) await api(`/rule-executions/${id}/undo`, {});
              setMsg(null);
              bump();
              load();
            }}>Undo</Button>
          </Group>
        )}
      </Group>
      {rows.length === 0 ? (
        <Text c="dimmed" size="sm">No transactions yet.</Text>
      ) : (
        <Table.ScrollContainer minWidth={420} mah={360} type="native">
          <Table fz="sm" aria-label="Merchants list">
            <Table.Tbody>
              {shown.slice(0, 200).map((r) => (
                <Table.Tr key={r.merchant}>
                  <Table.Td w={36}><Checkbox aria-label={`Select ${r.merchant}`} checked={picked.has(r.merchant)} onChange={() => toggle(r.merchant)} /></Table.Td>
                  <Table.Td>{r.merchant}</Table.Td>
                  <Table.Td ta="right" c="dimmed">{r.count}</Table.Td>
                  <Table.Td ta="right"><Button size="xs" variant="default" onClick={() => open([r.merchant])}>Rename</Button></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {shown.length > 200 && <Text size="xs" c="dimmed" mt="xs">Showing 200 of {shown.length}. Use the search box to narrow the list.</Text>}
        </Table.ScrollContainer>
      )}

      <Modal opened={dialog !== null} onClose={() => setDialog(null)} title={dialog && dialog.from.length > 1 ? `Merge ${dialog.from.length} merchants` : "Rename merchant"}>
        <form onSubmit={(e) => { e.preventDefault(); if (dialog?.to.trim()) save(); }}>
          <Stack gap="sm">
            {dialog && dialog.from.length > 1 && <Text size="sm">{dialog.from.join(", ")}</Text>}
            <TextInput data-autofocus label="New name" maxLength={200} value={dialog?.to ?? ""} onChange={(e) => dialog && setDialog({ ...dialog, to: e.currentTarget.value })} />
            {err && <Text c="red" size="sm" role="alert">{err}</Text>}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={!dialog?.to.trim()}>Save</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Card>
  );
}

export function Settings() {
  const { meta, reloadMeta, bump } = useApp();
  const [draft, setDraft] = useState(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const saved = async () => {
    await reloadMeta();
    bump();
  };

  return (
    <Stack p="md" gap="md">
      <Title order={1} size="h2">Settings</Title>
      <Card withBorder component="section" padding="md">
        <Title order={2} size="h4" mb="xs">Categories</Title>
        <Text c="dimmed" size="sm" mb="sm">
          The kind sets how a category counts. Transfer categories never count as spending or income. "Exclude" leaves a
          category out of totals by default (for example, reimbursements). A transaction type set by hand wins over the kind.
        </Text>
        <Table.ScrollContainer minWidth={640}>
          <Table fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th><Table.Th>Group</Table.Th><Table.Th>Kind</Table.Th>
                <Table.Th>Exclude</Table.Th><Table.Th>Archived</Table.Th><Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {meta?.categories.map((c) => <CategoryRow key={`${c.id}-${c.name}-${c.group_name}-${c.kind}-${c.exclude_from_totals}-${c.archived}`} cat={c} onSaved={saved} />)}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <form onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          try {
            await api("/categories", { ...draft, group_name: draft.group_name || null });
            notifications.show({ color: "green", title: "Category saved", message: `${draft.name} is saved.` });
            setDraft(EMPTY);
            saved();
          } catch (ex) {
            setErr((ex as Error).message);
          }
        }}>
          <Group gap="sm" mt="md" wrap="wrap">
            <TextInput required placeholder="New category" aria-label="New category name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })} w={200} />
            <TextInput placeholder="Group" aria-label="New category group" value={draft.group_name ?? ""} onChange={(e) => setDraft({ ...draft, group_name: e.currentTarget.value })} w={160} />
            <Select aria-label="New category kind" allowDeselect={false} data={KINDS} value={draft.kind} onChange={(k) => k && setDraft({ ...draft, kind: k as Category["kind"] })} w={130} />
            <Button type="submit">Add category</Button>
            {err && <Text c="red" size="sm">{err}</Text>}
          </Group>
        </form>
      </Card>

      <Merchants />
      <Rules />

      <Card withBorder component="section" padding="md">
        <Title order={2} size="h4" mb="xs">Your data</Title>
        <Text c="dimmed" size="sm" mb="sm">All data is in one local DuckDB file. Bank tokens are encrypted. Nothing goes to an AI model unless you use Ask, and Ask only receives names (categories, accounts, tags, merchants), never transactions.</Text>
        <Group gap="sm">
          <Anchor href="#transactions" size="sm">Export transactions (Transactions → Export CSV)</Anchor>
          <Button color="red" variant="outline" onClick={async () => {
            if (prompt('This deletes every account, transaction, category and bank connection. Type "delete" to continue.') !== "delete") return;
            await api("/data/delete-all", {});
            saved();
          }}>Delete all data</Button>
        </Group>
      </Card>
    </Stack>
  );
}
