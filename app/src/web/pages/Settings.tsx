import { Anchor, Button, Card, Checkbox, Group, Select, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";

import type { Category } from "../api";
import { api } from "../api";
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
  account: string | null;
  amount_min: number | null;
  amount_max: number | null;
  category: string | null;
  set_merchant: string | null;
  set_tags: string[];
  set_reviewed: boolean;
}

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
  const [text, setText] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api<Rule[]>("/rules").then(setRules);
  useEffect(() => {
    load();
  }, []);

  return (
    <Card withBorder component="section" padding="md">
      <Title order={2} size="h4" mb="xs">Rules</Title>
      <Text c="dimmed" size="sm" mb="sm">
        Rules run on new rows from CSV import and bank sync. A rule never changes a row that you edited.
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
                      const p = await api<{ count: number }>(`/rules/${r.id}/preview`, {});
                      setStatus((s) => ({ ...s, [r.id]: `${p.count} matching ${p.count === 1 ? "row" : "rows"}` }));
                    }}>Preview</Button>
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
      <form onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        try {
          await api("/rules", { text_contains: text, set_category_id: category ? Number(category) : null });
          setText("");
          setCategory(null);
          load();
        } catch (ex) {
          setErr((ex as Error).message);
        }
      }}>
        <Group gap="sm" mt="md" wrap="wrap">
          <TextInput required label="Text contains" placeholder="STARBUCKS" value={text} onChange={(e) => setText(e.currentTarget.value)} w={200} />
          <Select required label="Set category" searchable data={meta?.categories.map((c) => ({ value: String(c.id), label: c.name })) ?? []} value={category} onChange={setCategory} w={200} />
          <Button type="submit" style={{ alignSelf: "flex-end" }}>Add rule</Button>
          {err && <Text c="red" size="sm">{err}</Text>}
        </Group>
      </form>
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
