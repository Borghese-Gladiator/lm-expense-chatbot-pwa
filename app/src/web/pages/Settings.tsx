import { useState } from "react";

import type { Category } from "../api";
import { api } from "../api";
import { useApp } from "../shared";

const EMPTY: Omit<Category, "id"> = { name: "", group_name: "", kind: "expense", exclude_from_totals: false, archived: false };

function CategoryRow({ cat, onSaved }: { cat: Category; onSaved: () => void }) {
  const [v, setV] = useState(cat);
  const dirty = JSON.stringify(v) !== JSON.stringify(cat);
  return (
    <tr>
      <td><input aria-label="Name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></td>
      <td><input aria-label="Group" value={v.group_name ?? ""} onChange={(e) => setV({ ...v, group_name: e.target.value || null })} /></td>
      <td>
        <select aria-label="Kind" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as Category["kind"] })}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="transfer">Transfer</option>
        </select>
      </td>
      <td><input type="checkbox" aria-label="Exclude from totals" checked={v.exclude_from_totals} onChange={(e) => setV({ ...v, exclude_from_totals: e.target.checked })} /></td>
      <td><input type="checkbox" aria-label="Archived" checked={v.archived} onChange={(e) => setV({ ...v, archived: e.target.checked })} /></td>
      <td>
        <button className="small" disabled={!dirty} onClick={async () => {
          await api(`/categories/${cat.id}`, { ...v, group_name: v.group_name || null }, "PUT");
          onSaved();
        }}>Save</button>
      </td>
    </tr>
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
    <div className="page">
      <div className="toolbar"><h1>Settings</h1></div>
      <section className="card">
        <h2>Categories</h2>
        <p className="muted small">
          The kind sets how a category counts. Transfer categories never count as spending or income. "Exclude" leaves a
          category out of totals by default (for example, reimbursements). A transaction type set by hand wins over the kind.
        </p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Group</th><th>Kind</th><th>Exclude</th><th>Archived</th><th /></tr></thead>
            <tbody>
              {meta?.categories.map((c) => <CategoryRow key={`${c.id}-${c.name}-${c.group_name}-${c.kind}-${c.exclude_from_totals}-${c.archived}`} cat={c} onSaved={saved} />)}
            </tbody>
          </table>
        </div>
        <form className="row wrap" onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          try {
            await api("/categories", { ...draft, group_name: draft.group_name || null });
            setDraft(EMPTY);
            saved();
          } catch (ex) {
            setErr((ex as Error).message);
          }
        }}>
          <input required placeholder="New category" aria-label="New category name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input placeholder="Group" aria-label="New category group" value={draft.group_name ?? ""} onChange={(e) => setDraft({ ...draft, group_name: e.target.value })} />
          <select aria-label="New category kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Category["kind"] })}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
          </select>
          <button>Add category</button>
          {err && <span className="error">{err}</span>}
        </form>
      </section>

      <section className="card danger">
        <h2>Your data</h2>
        <p className="muted small">All data is in one local DuckDB file. Bank tokens are encrypted. Nothing goes to an AI model unless you use Ask, and Ask only receives names (categories, accounts, tags, merchants), never transactions.</p>
        <div className="row">
          <a className="button ghost" href="#transactions">Export transactions (Transactions → Export CSV)</a>
          <button className="danger" onClick={async () => {
            if (prompt('This deletes every account, transaction, category and bank connection. Type "delete" to continue.') !== "delete") return;
            await api("/data/delete-all", {});
            saved();
          }}>Delete all data</button>
        </div>
      </section>
    </div>
  );
}
