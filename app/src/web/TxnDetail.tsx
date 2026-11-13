import { Drawer, Text, Title } from "@mantine/core";
import { useState } from "react";

import { api } from "./api";
import { money2 } from "./format";
import { Status, useApp, useAsync } from "./shared";

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

  if (!data) return shell(<Title order={2} size="h4">Transaction</Title>, <Status loading={loading} error={error} />);

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
      <div className="form">
        <label>Merchant<input value={v.merchant ?? ""} onChange={(e) => setDraft({ ...draft, merchant: e.target.value })} /></label>
        <label>Category
          <select value={v.category_id ?? ""} onChange={(e) => setDraft({ ...draft, category_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Uncategorized</option>
            {meta?.categories.filter((c) => !c.archived || c.id === v.category_id).map((c) => (
              <option key={c.id} value={c.id}>{c.group_name ? `${c.group_name} › ` : ""}{c.name}</option>
            ))}
          </select>
        </label>
        <label>Type
          <select value={v.type ?? ""} onChange={(e) => setDraft({ ...draft, type: e.target.value || null })}>
            <option value="">From category</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
            <option value="adjustment">Adjustment</option>
          </select>
        </label>
        <label>Tags (comma separated)
          <input value={draft.tagText ?? data.tags.join(", ")} onChange={(e) => setDraft({ ...draft, tagText: e.target.value })} />
        </label>
        <label>Notes<textarea rows={2} value={v.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
        <label className="check">
          <input type="checkbox" checked={v.reviewed} onChange={(e) => setDraft({ ...draft, reviewed: e.target.checked })} /> Reviewed
        </label>
        <div className="row">
          <button onClick={save} disabled={saving || Object.keys(draft).length === 0}>{saving ? "Saving…" : "Save"}</button>
          {saveError && <span className="error">{saveError}</span>}
        </div>
      </div>
      <h3>Source record</h3>
      <dl className="kv">
        <dt>Payee (raw)</dt><dd>{data.payee_raw ?? "—"}</dd>
        <dt>Source</dt><dd>{data.source}{data.source_id ? ` · ${data.source_id}` : ""}</dd>
        <dt>Status</dt><dd>{data.is_pending ? "Pending" : "Posted"}{data.user_edited ? " · edited by you" : ""}</dd>
        <dt>Updated</dt><dd>{data.updated_at}</dd>
      </dl>
      <details>
        <summary>Raw data</summary>
        <pre>{JSON.stringify(data.raw, null, 2)}</pre>
      </details>
    </>,
  );
}
