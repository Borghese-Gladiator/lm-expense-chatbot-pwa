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
    <div className="page">
      <div className="toolbar">
        <h1>Accounts</h1>
        <div className="row">
          {meta?.plaid_configured ? (
            <button onClick={connect} disabled={busy}>Connect a bank ({meta.plaid_env})</button>
          ) : (
            <span className="muted small">Set PLAID_CLIENT_ID and PLAID_SECRET to connect banks.</span>
          )}
        </div>
      </div>
      {msg && <div className={`state ${msg.error ? "error" : ""}`} role="status">{msg.text}</div>}

      {(items.data?.length ?? 0) > 0 && (
        <section className="card">
          <h2>Bank connections</h2>
          <ul className="list">
            {items.data!.map((it) => (
              <li key={it.id}>
                <span>{it.institution ?? "Bank"}</span>
                <span className={it.status === "ok" ? "muted" : "error"}>
                  {it.status === "ok" ? "Connected" : it.status === "reconnect" ? "Sign-in needed: connect again" : it.error}
                </span>
                <button className="small" disabled={busy} onClick={() => syncItem(it.id)}>Sync now</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Accounts</h2>
        <Status empty={meta?.accounts.length === 0} emptyText="No accounts yet." />
        {meta && meta.accounts.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Type</th><th>Source</th><th className="right">Transactions</th><th className="right">Balance</th><th /></tr></thead>
              <tbody>
                {meta.accounts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}{a.institution && <span className="muted"> · {a.institution}</span>}</td>
                    <td>{a.type}</td>
                    <td>{a.source}</td>
                    <td className="right num">{a.txn_count}</td>
                    <td className="right num">{a.balance == null ? "—" : money2(a.balance)}</td>
                    <td className="right">
                      <button className="small ghost" onClick={async () => {
                        if (!confirm(`Delete ${a.name} and all ${a.txn_count} of its transactions? You cannot undo this.`)) return;
                        await api(`/accounts/${a.id}`, undefined, "DELETE");
                        refresh();
                      }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AddAccount onDone={refresh} />
      </section>

      <CsvImport onDone={(text) => { setMsg({ text }); refresh(); }} />

      <section className="card">
        <h2>Sync and import history</h2>
        <Status empty={runs.data?.length === 0} emptyText="No syncs or imports yet." />
        {runs.data && runs.data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Source</th><th>Status</th><th className="right">Added</th><th className="right">Updated</th><th className="right">Removed</th><th>Error</th></tr></thead>
              <tbody>
                {runs.data.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{r.started_at.replace("T", " ").slice(0, 16)}</td>
                    <td>{r.source}</td>
                    <td className={r.status === "error" ? "error" : ""}>{r.status}</td>
                    <td className="right num">{r.added}</td>
                    <td className="right num">{r.modified}</td>
                    <td className="right num">{r.removed}</td>
                    <td className="muted small">{r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AddAccount({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("checking");
  return (
    <form className="row" onSubmit={async (e) => {
      e.preventDefault();
      await api("/accounts", { name, type });
      setName("");
      onDone();
    }}>
      <input required placeholder="New manual account name" aria-label="Account name" value={name} onChange={(e) => setName(e.target.value)} />
      <select aria-label="Account type" value={type} onChange={(e) => setType(e.target.value)}>
        {["checking", "savings", "credit", "cash", "investment", "other"].map((t) => <option key={t}>{t}</option>)}
      </select>
      <button>Add account</button>
    </form>
  );
}

function CsvImport({ onDone }: { onDone: (msg: string) => void }) {
  const { meta } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState("");
  const [sign, setSign] = useState("negative_is_expense");
  const [result, setResult] = useState<{ added: number; skipped_duplicates: number; errors: string[]; accounts_created: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setErr(null);
    try {
      const r = await api<typeof result & object>("/import/csv", {
        csv_text: await file.text(),
        account_id: accountId ? Number(accountId) : null,
        sign,
      });
      setResult(r);
      onDone(`Imported ${r.added} transactions. Skipped ${r.skipped_duplicates} duplicates.`);
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };

  return (
    <section className="card">
      <h2>Import a CSV file</h2>
      <p className="muted small">
        Works with the Lunch Money transaction export and most bank exports. If the file has an account column, accounts
        are created by name. A second import of the same file adds nothing.
      </p>
      <form className="row wrap" onSubmit={submit}>
        <input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <label>Account
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">From the file's account column</option>
            {meta?.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label>Amount sign
          <select value={sign} onChange={(e) => setSign(e.target.value)}>
            <option value="negative_is_expense">Negative = money out</option>
            <option value="positive_is_expense">Positive = money out</option>
          </select>
        </label>
        <button disabled={!file}>Import</button>
      </form>
      {err && <div className="state error" role="alert">{err}</div>}
      {result && result.errors.length > 0 && (
        <details>
          <summary className="error">{result.errors.length} rows not imported</summary>
          <ul>{result.errors.slice(0, 50).map((e) => <li key={e} className="small">{e}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
