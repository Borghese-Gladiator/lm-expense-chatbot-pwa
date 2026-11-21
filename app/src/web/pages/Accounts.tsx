import { Alert, Button, Card, FileInput, Group, Menu, Modal, Select, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";

import { api, type Account } from "../api";
import { money2 } from "../format";
import { LoadState, useApp, useAsync } from "../shared";

interface PlaidItem {
  id: number;
  institution: string | null;
  status: string;
  error: string | null;
  last_synced_at: string | null;
}
interface SyncRun {
  id: number;
  source: string;
  started_at: string;
  status: string;
  added: number;
  modified: number;
  removed: number;
  error: string | null;
}

declare global {
  interface Window {
    Plaid?: {
      create: (o: {
        token: string;
        onSuccess: (publicToken: string, metadata: { institution?: { name?: string } }) => void;
        onExit?: () => void;
      }) => { open: () => void };
    };
  }
}

function loadPlaid(): Promise<void> {
  if (window.Plaid) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Plaid Link"));
    document.head.appendChild(s);
  });
}

export function Accounts() {
  const { meta, reloadMeta, bump, version } = useApp();
  const items = useAsync(() => api<PlaidItem[]>("/plaid/items"), [version]);
  const runs = useAsync(() => api<SyncRun[]>("/sync-runs"), [version]);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [merge, setMerge] = useState<{ id: number; name: string } | null>(null);
  const [mergeInto, setMergeInto] = useState<string | null>(null);
  const [cutover, setCutover] = useState<{ id: number; name: string; value: string } | null>(null);
  const [rename, setRename] = useState<{ id: number; value: string } | null>(null);

  const broken = (items.data ?? []).filter((i) => i.status !== "ok");
  const byItem = new Map<number, Account[]>();
  const loose: Account[] = [];
  for (const a of meta?.accounts ?? []) {
    if (a.plaid_item_id == null || !(items.data ?? []).some((i) => i.id === a.plaid_item_id)) loose.push(a);
    else byItem.set(a.plaid_item_id, [...(byItem.get(a.plaid_item_id) ?? []), a]);
  }
  const groups: { key: string; title: string; item: PlaidItem | null; accounts: Account[] }[] = [
    ...(items.data ?? []).map((i) => ({ key: `i${i.id}`, title: i.institution ?? "Bank", item: i, accounts: byItem.get(i.id) ?? [] })),
    ...(loose.length ? [{ key: "loose", title: "Manual and CSV accounts", item: null, accounts: loose }] : []),
  ];

  const refresh = async () => {
    await reloadMeta();
    bump();
  };

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(true);
    setMsg({ text: `${label}…` });
    try {
      setMsg({ text: await fn() });
      await refresh();
    } catch (e) {
      setMsg({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  const connectMock = () =>
    run("Connecting mock bank", async () => {
      const r = await api<{ added: number }>("/plaid/exchange", { public_token: "mock-public-token", institution: "Mock Bank" });
      return `Connected (mock). Imported ${r.added} transactions.`;
    });

  const connect = () =>
    run("Opening Plaid", async () => {
      const { link_token } = await api<{ link_token: string }>("/plaid/link-token", {});
      await loadPlaid();
      return new Promise<string>((resolve, reject) => {
        window.Plaid!.create({
          token: link_token,
          onSuccess: async (public_token, md) => {
            try {
              const r = await api<{ added: number }>("/plaid/exchange", { public_token, institution: md.institution?.name });
              resolve(`Connected. Imported ${r.added} transactions.`);
            } catch (e) {
              reject(e);
            }
          },
          onExit: () => resolve("Plaid closed."),
        }).open();
      });
    });

  const reconnect = (id: number) =>
    run("Opening Plaid", async () => {
      const { link_token } = await api<{ link_token: string }>(`/plaid/items/${id}/link-token`, {});
      if (link_token !== "mock-link-token") {
        await loadPlaid();
        const ok = await new Promise<boolean>((resolve) =>
          window.Plaid!.create({ token: link_token, onSuccess: () => resolve(true), onExit: () => resolve(false) }).open(),
        );
        if (!ok) return "Plaid closed.";
      }
      await api(`/plaid/items/${id}/reconnected`, {});
      return "Reconnected.";
    });

  const removeItem = (it: PlaidItem) => {
    if (!confirm(`Remove ${it.institution ?? "this bank"}? Its accounts and all their transactions are deleted. You cannot undo this.`)) return;
    run("Removing", async () => {
      await api(`/plaid/items/${it.id}`, undefined, "DELETE");
      return `Removed ${it.institution ?? "the bank"}.`;
    });
  };

  const saveName = () => {
    const r = rename!;
    setRename(null);
    run("Renaming", async () => {
      await api(`/plaid/items/${r.id}`, { institution: r.value.trim() }, "PATCH");
      return `Renamed to ${r.value.trim()}.`;
    });
  };

  const syncItem = (id: number) =>
    run("Syncing", async () => {
      const r = await api<{ added: number; modified: number; removed: number }>(`/plaid/items/${id}/sync`, {});
      return `Synced: ${r.added} new, ${r.modified} updated, ${r.removed} removed.`;
    });

  return (
    <Stack p="md" gap="md">
      <Group justify="space-between" wrap="wrap">
        <Title order={1} size="h2">Accounts</Title>
        <Group gap="xs">
          {meta?.plaid_live ? (
            <Button onClick={connect} disabled={busy}>Connect a bank ({meta.plaid_env})</Button>
          ) : (
            <Text c="dimmed" size="sm">Set PLAID_CLIENT_ID and PLAID_SECRET to connect real banks.</Text>
          )}
          <Button variant={meta?.plaid_live ? "default" : "filled"} onClick={connectMock} disabled={busy}>Add mock bank</Button>
        </Group>
      </Group>
      {msg && <Alert color={msg.error ? "red" : "blue"} role="status">{msg.text}</Alert>}

      {broken.length > 0 && (
        <Alert color="red" role="alert" title="A bank connection needs attention">
          {broken.map((i) => i.institution ?? "Bank").join(", ")}: use Reconnect, or Remove and connect again.
        </Alert>
      )}

      <Section title="Accounts">
        <LoadState empty={meta?.accounts.length === 0 && (items.data?.length ?? 0) === 0} emptyText="No accounts yet. Connect a bank, add a mock bank, or add a manual account." />
        {groups.map((g) => (
          <Stack key={g.key} gap={0} mb="md">
            <Group justify="space-between" wrap="nowrap" py="xs" style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
              <div>
                <Text fw={600}>{g.title} <Text span c="dimmed" inherit>({g.accounts.length})</Text></Text>
                {g.item ? (
                  <Text size="xs" c={g.item.status === "ok" ? "dimmed" : "red"}>
                    {g.item.status === "ok" ? "Connected" : g.item.status === "reconnect" ? "Sign-in needed" : g.item.error}
                    {" · "}Last sync: {g.item.last_synced_at ? new Date(g.item.last_synced_at).toLocaleString() : "Never"}
                  </Text>
                ) : (
                  <Text size="xs" c="dimmed">No bank link. Add rows by hand or by CSV.</Text>
                )}
              </div>
              {g.item && (
                <Group gap="xs" wrap="nowrap">
                  {g.item.status === "reconnect" && <Button size="xs" disabled={busy} onClick={() => reconnect(g.item!.id)}>Reconnect</Button>}
                  <Button size="xs" variant="default" disabled={busy} onClick={() => setRename({ id: g.item!.id, value: g.title })}>Rename</Button>
                  <Button size="xs" variant="default" disabled={busy} onClick={() => syncItem(g.item!.id)}>Sync now</Button>
                  <Button size="xs" variant="subtle" color="red" disabled={busy} onClick={() => removeItem(g.item!)}>Remove</Button>
                </Group>
              )}
            </Group>
            {g.accounts.length > 0 && (
              <Table.ScrollContainer minWidth={560}>
                <Table fz="sm">
                  <Table.Tbody>
                    {g.accounts.map((a) => (
                      <Table.Tr key={a.id}>
                        <Table.Td>{a.name}</Table.Td>
                        <Table.Td c="dimmed">{a.type}</Table.Td>
                        <Table.Td ta="right" style={NUM}>{a.txn_count} txns</Table.Td>
                        <Table.Td ta="right" style={NUM}>{a.balance == null ? "—" : money2(a.balance)}</Table.Td>
                        <Table.Td ta="right">
                          <Menu position="bottom-end">
                            <Menu.Target>
                              <Button size="xs" variant="subtle" aria-label={`Actions for ${a.name}`}>⋯</Button>
                            </Menu.Target>
                            <Menu.Dropdown>
                              {a.source === "plaid" && <Menu.Item onClick={() => { setMerge(a); setMergeInto(null); }}>Merge into…</Menu.Item>}
                              <Menu.Item onClick={() => setCutover({ id: a.id, name: a.name, value: a.history_cutover ?? "" })}>
                                History cutover{a.history_cutover ? `: ${a.history_cutover}` : "…"}
                              </Menu.Item>
                              <Menu.Item color="red" onClick={async () => {
                                if (!confirm(`Delete ${a.name} and all ${a.txn_count} of its transactions? You cannot undo this.`)) return;
                                await api(`/accounts/${a.id}`, undefined, "DELETE");
                                refresh();
                              }}>Delete</Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Stack>
        ))}
        <AddAccount onDone={refresh} />
      </Section>

      <Modal opened={rename !== null} onClose={() => setRename(null)} title="Rename connection">
        <form onSubmit={(e) => { e.preventDefault(); if (rename?.value.trim()) saveName(); }}>
          <Stack gap="sm">
            <TextInput data-autofocus label="Name" maxLength={120} value={rename?.value ?? ""} onChange={(e) => rename && setRename({ ...rename, value: e.currentTarget.value })} />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setRename(null)}>Cancel</Button>
              <Button type="submit" disabled={!rename?.value.trim()}>Save</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={cutover !== null} onClose={() => setCutover(null)} title={`History cutover for ${cutover?.name ?? ""}`}>
        <Stack gap="sm">
          <Text size="sm">Bank rows before this date are ignored. Use it when older rows come from a CSV import.</Text>
          <TextInput type="date" label="Cutover date" value={cutover?.value ?? ""} onChange={(e) => cutover && setCutover({ ...cutover, value: e.currentTarget.value })} />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCutover(null)}>Cancel</Button>
            <Button onClick={async () => {
              const c = cutover!;
              setCutover(null);
              await api(`/accounts/${c.id}`, { history_cutover: c.value || null }, "PATCH");
              await reloadMeta();
            }}>Save</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={merge !== null} onClose={() => setMerge(null)} title={`Merge ${merge?.name ?? ""} into another account`}>
        <Stack gap="sm">
          <Text size="sm">All transactions move to the account you pick. Future bank syncs add rows to it. Then {merge?.name} is deleted.</Text>
          <Select
            label="Merge into"
            placeholder="Pick an account"
            data={(meta?.accounts ?? []).filter((a) => a.id !== merge?.id && a.source !== "plaid").map((a) => ({ value: String(a.id), label: a.name }))}
            value={mergeInto}
            onChange={setMergeInto}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setMerge(null)}>Cancel</Button>
            <Button disabled={!mergeInto || busy} onClick={() => {
              const from = merge!;
              setMerge(null);
              run("Merging", async () => {
                await api(`/accounts/${from.id}/merge`, { into_id: Number(mergeInto) });
                return `Merged ${from.name}.`;
              });
            }}>Merge</Button>
          </Group>
        </Stack>
      </Modal>

      <CsvImport onDone={refresh} />

      <Section title="Sync and import history">
        <LoadState empty={runs.data?.length === 0} emptyText="No syncs or imports yet." />
        {runs.data && runs.data.length > 0 && (
          <Table.ScrollContainer minWidth={640}>
            <Table fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>When</Table.Th><Table.Th>Source</Table.Th><Table.Th>Status</Table.Th>
                  <Table.Th ta="right">Added</Table.Th><Table.Th ta="right">Updated</Table.Th><Table.Th ta="right">Removed</Table.Th><Table.Th>Error</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {runs.data.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td style={NUM}>{r.started_at.replace("T", " ").slice(0, 16)}</Table.Td>
                    <Table.Td>{r.source}</Table.Td>
                    <Table.Td c={r.status === "error" ? "red" : undefined}>{r.status}</Table.Td>
                    <Table.Td ta="right" style={NUM}>{r.added}</Table.Td>
                    <Table.Td ta="right" style={NUM}>{r.modified}</Table.Td>
                    <Table.Td ta="right" style={NUM}>{r.removed}</Table.Td>
                    <Table.Td c="dimmed">{r.error}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Section>
    </Stack>
  );
}

const NUM = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card withBorder component="section" padding="md">
      <Title order={2} size="h4" mb="sm">{title}</Title>
      {children}
    </Card>
  );
}

function AddAccount({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("checking");
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      await api("/accounts", { name, type });
      setName("");
      onDone();
    }}>
      <Group gap="sm" mt="md" wrap="wrap">
        <TextInput required placeholder="New manual account name" aria-label="Account name" value={name} onChange={(e) => setName(e.currentTarget.value)} w={240} />
        <Select aria-label="Account type" allowDeselect={false} data={["checking", "savings", "credit", "cash", "investment", "other"]} value={type} onChange={(v) => v && setType(v)} w={150} />
        <Button type="submit" variant="default">Add account</Button>
      </Group>
    </form>
  );
}

function CsvImport({ onDone }: { onDone: () => void }) {
  const { meta } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [sign, setSign] = useState("negative_is_expense");
  const [result, setResult] = useState<{ added: number; skipped_duplicates: number; errors: string[]; accounts_created: string[] } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    try {
      const r = await api<typeof result & object>("/import/csv", {
        csv_text: await file.text(),
        account_id: accountId ? Number(accountId) : null,
        sign,
      });
      setResult(r);
      notifications.show({ color: "green", title: "Import done", message: `Imported ${r.added} transactions. Skipped ${r.skipped_duplicates} duplicates.` });
      onDone();
    } catch (ex) {
      notifications.show({ color: "red", title: "Import failed", message: (ex as Error).message });
    }
  };

  return (
    <Section title="Import a CSV file">
      <Text c="dimmed" size="sm" mb="sm">
        Works with the Lunch Money transaction export and most bank exports. If the file has an account column, accounts
        are created by name. A second import of the same file adds nothing.
      </Text>
      <form onSubmit={submit}>
        <Group gap="sm" align="flex-end" wrap="wrap">
          <FileInput label="CSV file" placeholder="Choose a file" accept=".csv,text/csv" value={file} onChange={setFile} clearable w={240} />
          <Select
            label="Account"
            placeholder="From the file's account column"
            clearable
            data={(meta?.accounts ?? []).map((a) => ({ value: String(a.id), label: a.name }))}
            value={accountId}
            onChange={setAccountId}
            w={240}
          />
          <Select
            label="Amount sign"
            allowDeselect={false}
            data={[{ value: "negative_is_expense", label: "Negative = money out" }, { value: "positive_is_expense", label: "Positive = money out" }]}
            value={sign}
            onChange={(v) => v && setSign(v)}
            w={200}
          />
          <Button type="submit" disabled={!file}>Import</Button>
        </Group>
      </form>
      {result && result.errors.length > 0 && (
        <details>
          <summary><Text span c="red" size="sm">{result.errors.length} rows not imported</Text></summary>
          <ul>{result.errors.slice(0, 50).map((e) => <li key={e}><Text size="xs">{e}</Text></li>)}</ul>
        </details>
      )}
    </Section>
  );
}
