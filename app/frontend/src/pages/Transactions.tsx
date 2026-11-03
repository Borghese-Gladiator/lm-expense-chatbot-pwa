import { useState } from "react";

import type { Filters, Txn } from "../api";
import { api } from "../api";
import { money2 } from "../format";
import { Status, TxnTable, useApp, useAsync } from "../shared";

const PAGE = 100;

export function Transactions() {
  const { meta, openTxn, version, bump } = useApp();
  const [filters, setFilters] = useState<Filters>({ include_pending: true, include_excluded_categories: true });
  const [flags, setFlags] = useState({ uncategorized: false, unreviewed: false });
  const [sort, setSort] = useState<{ sort: string; desc: boolean }>({ sort: "date", desc: true });
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [bulkCat, setBulkCat] = useState("");

  const body = { filters, ...flags, ...sort, offset, limit: PAGE };
  const { data, error, loading } = useAsync(
    () => api<{ items: Txn[]; total: number; sum: number }>("/transactions/search", body),
    [JSON.stringify(body), version],
  );

  const setF = (p: Partial<Filters>) => {
    setOffset(0);
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

  return (
    <div className="page">
      <div className="toolbar">
        <h1>Transactions</h1>
        <div className="row">
          <button onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "Add transaction"}</button>
          <button className="ghost" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>
      {adding && <AddTxn onDone={() => { setAdding(false); bump(); }} />}
      <section className="card">
        <div className="row wrap filters">
          <input placeholder="Search payee, merchant, notes" aria-label="Search" value={filters.search ?? ""} onChange={(e) => setF({ search: e.target.value || null })} />
          <input type="date" aria-label="From" value={filters.start ?? ""} onChange={(e) => setF({ start: e.target.value || null })} />
          <input type="date" aria-label="To" value={filters.end ?? ""} onChange={(e) => setF({ end: e.target.value || null })} />
          <select aria-label="Account" value={filters.account_ids?.[0] ?? ""} onChange={(e) => setF({ account_ids: e.target.value ? [Number(e.target.value)] : [] })}>
            <option value="">All accounts</option>
            {meta?.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select aria-label="Category" value={filters.category_ids?.[0] ?? ""} onChange={(e) => setF({ category_ids: e.target.value ? [Number(e.target.value)] : [] })}>
            <option value="">All categories</option>
            {meta?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select aria-label="Type" value={filters.types?.[0] ?? ""} onChange={(e) => setF({ types: e.target.value ? [e.target.value] : [] })}>
            <option value="">All types</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
            <option value="adjustment">Adjustment</option>
          </select>
          <label className="check"><input type="checkbox" checked={flags.uncategorized} onChange={(e) => { setOffset(0); setFlags({ ...flags, uncategorized: e.target.checked }); }} />Uncategorized</label>
          <label className="check"><input type="checkbox" checked={flags.unreviewed} onChange={(e) => { setOffset(0); setFlags({ ...flags, unreviewed: e.target.checked }); }} />Unreviewed</label>
          <select aria-label="Sort" value={`${sort.sort}:${sort.desc}`} onChange={(e) => { const [s, d] = e.target.value.split(":"); setSort({ sort: s, desc: d === "true" }); }}>
            <option value="date:true">Newest first</option>
            <option value="date:false">Oldest first</option>
            <option value="amount:false">Largest expense first</option>
            <option value="amount:true">Largest income first</option>
            <option value="merchant:false">Merchant A–Z</option>
          </select>
        </div>
        {selected.size > 0 && (
          <div className="row bulk">
            <strong>{selected.size} selected</strong>
            <select aria-label="Set category" value={bulkCat} onChange={(e) => setBulkCat(e.target.value)}>
              <option value="">Set category…</option>
              {meta?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button disabled={!bulkCat} onClick={() => bulk({ category_id: Number(bulkCat) })}>Apply</button>
            <button onClick={() => bulk({ reviewed: true })}>Mark reviewed</button>
            <button onClick={() => bulk({ type: "transfer" })}>Mark as transfer</button>
            <button className="ghost" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}
        {data && (
          <p className="muted small">
            {data.total.toLocaleString()} transactions · net {money2(data.sum)}
          </p>
        )}
        <Status loading={loading && !data} error={error} empty={data?.total === 0} />
        {data && data.items.length > 0 && (
          <>
            <TxnTable items={data.items} onRowClick={(t) => openTxn(t.id)} selected={selected} onToggle={toggle} />
            <div className="row pager">
              <button className="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>← Previous</button>
              <span className="muted">{offset + 1}–{Math.min(offset + PAGE, data.total)} of {data.total}</span>
              <button className="ghost" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Next →</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function AddTxn({ onDone }: { onDone: () => void }) {
  const { meta } = useApp();
  const [form, setForm] = useState({ account_id: "", date: new Date().toISOString().slice(0, 10), amount: "", payee: "", category_id: "", direction: "out" });
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
  if (!meta?.accounts.length) return <div className="card state">Add an account on the Accounts page first.</div>;
  return (
    <form className="card row wrap" onSubmit={submit}>
      <label>Account<select required value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
        <option value="">Choose…</option>
        {meta.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select></label>
      <label>Date<input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
      <label>Payee<input required value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} /></label>
      <label>Amount<input type="number" step="0.01" min="0" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
      <label>Direction<select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
        <option value="out">Money out</option>
        <option value="in">Money in</option>
      </select></label>
      <label>Category<select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
        <option value="">Uncategorized</option>
        {meta.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
      <button>Add</button>
      {err && <span className="error">{err}</span>}
    </form>
  );
}
