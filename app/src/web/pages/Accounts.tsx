import { Alert, Button, Card, FileInput, Group, Select, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";

import { api } from "../api";
import { money2 } from "../format";
import { Status, useApp, useAsync } from "../shared";

interface PlaidItem {
  id: number;
  institution: string | null;
  status: string;
  error: string | null;
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

  const connect = () =>
    run("Opening Plaid", async () => {
      const { link_token } = await api<{ link_token: string }>("/plaid/link-token", {});
      if (link_token === "mock-link-token") {
        const r = await api<{ added: number }>("/plaid/exchange", { public_token: "mock-public-token", institution: "Mock Bank" });
        return `Connected (mock). Imported ${r.added} transactions.`;
      }
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

  const syncItem = (id: number) =>
    run("Syncing", async () => {
      const r = await api<{ added: number; modified: number; removed: number }>(`/plaid/items/${id}/sync`, {});
      return `Synced: ${r.added} new, ${r.modified} updated, ${r.removed} removed.`;
    });

  return (
    <Stack p="md" gap="md">
      <Group justify="space-between" wrap="wrap">
        <Title order={1} size="h2">Accounts</Title>
        {meta?.plaid_configured ? (
          <Button onClick={connect} disabled={busy}>Connect a bank ({meta.plaid_env})</Button>
        ) : (
          <Text c="dimmed" size="sm">Set PLAID_CLIENT_ID and PLAID_SECRET to connect banks.</Text>
        )}
      </Group>
      {msg && <Alert color={msg.error ? "red" : "blue"} role="status">{msg.text}</Alert>}

      {(items.data?.length ?? 0) > 0 && (
        <Section title="Bank connections">
          <Table fz="sm">
            <Table.Tbody>
              {items.data!.map((it) => (
                <Table.Tr key={it.id}>
                  <Table.Td>{it.institution ?? "Bank"}</Table.Td>
                  <Table.Td c={it.status === "ok" ? "dimmed" : "red"}>
                    {it.status === "ok" ? "Connected" : it.status === "reconnect" ? "Sign-in needed: connect again" : it.error}
                  </Table.Td>
                  <Table.Td ta="right">
                    <Button size="xs" variant="default" disabled={busy} onClick={() => syncItem(it.id)}>Sync now</Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Section>
      )}

      <Section title="Accounts">
        <Status empty={meta?.accounts.length === 0} emptyText="No accounts yet." />
        {meta && meta.accounts.length > 0 && (
          <Table.ScrollContainer minWidth={560}>
            <Table fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th><Table.Th>Type</Table.Th><Table.Th>Source</Table.Th>
                  <Table.Th ta="right">Transactions</Table.Th><Table.Th ta="right">Balance</Table.Th><Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {meta.accounts.map((a) => (
                  <Table.Tr key={a.id}>
                    <Table.Td>{a.name}{a.institution && <Text span c="dimmed" inherit> · {a.institution}</Text>}</Table.Td>
                    <Table.Td>{a.type}</Table.Td>
                    <Table.Td>{a.source}</Table.Td>
                    <Table.Td ta="right" style={NUM}>{a.txn_count}</Table.Td>
                    <Table.Td ta="right" style={NUM}>{a.balance == null ? "—" : money2(a.balance)}</Table.Td>
                    <Table.Td ta="right">
                      <Button size="xs" variant="subtle" color="red" onClick={async () => {
                        if (!confirm(`Delete ${a.name} and all ${a.txn_count} of its transactions? You cannot undo this.`)) return;
                        await api(`/accounts/${a.id}`, undefined, "DELETE");
                        refresh();
                      }}>Delete</Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        <AddAccount onDone={refresh} />
      </Section>

      <CsvImport onDone={refresh} />

      <Section title="Sync and import history">
        <Status empty={runs.data?.length === 0} emptyText="No syncs or imports yet." />
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
