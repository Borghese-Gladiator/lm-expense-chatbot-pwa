import { createContext, useCallback, useContext, useEffect, useState } from "react";

import type { Drill, Meta, Txn } from "./api";
import { api } from "./api";
import { money2 } from "./format";

interface AppCtx {
  meta: Meta | null;
  reloadMeta: () => Promise<void>;
  openDrill: (d: Drill) => void;
  openTxn: (id: number) => void;
  version: number;
  bump: () => void;
}

export const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fn()
      .then((d) => live && (setData(d), setError(null)))
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading };
}

export function Status({
  loading, error, empty, emptyText = "No transactions match these filters.",
}: { loading?: boolean; error?: string | null; empty?: boolean; emptyText?: string }) {
  if (error) return <div className="state error" role="alert">{error}</div>;
  if (loading) return <div className="state">Loading…</div>;
  if (empty) return <div className="state">{emptyText}</div>;
  return null;
}

export function Amount({ v }: { v: number }) {
  return <span className={`num ${v > 0 ? "pos" : ""}`}>{money2(v)}</span>;
}

export function TxnTable({
  items,
  onRowClick,
  selected,
  onToggle,
  extra,
}: {
  items: Txn[];
  onRowClick?: (t: Txn) => void;
  selected?: Set<number>;
  onToggle?: (id: number) => void;
  extra?: (t: Txn) => React.ReactNode;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {onToggle && <th aria-label="Select" />}
            <th>Date</th>
            <th>Merchant</th>
            <th>Category</th>
            <th>Account</th>
            <th>Tags</th>
            <th className="right">Amount</th>
            {extra && <th />}
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id} onClick={() => onRowClick?.(t)} className={onRowClick ? "clickable" : ""}>
              {onToggle && (
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${t.merchant}`}
                    checked={selected?.has(t.id) ?? false}
                    onChange={() => onToggle(t.id)}
                  />
                </td>
              )}
              <td className="nowrap">{t.date}</td>
              <td>
                {t.merchant}
                {t.is_pending && <span className="badge">pending</span>}
                {t.txn_type === "transfer" && <span className="badge">transfer</span>}
              </td>
              <td>{t.category}</td>
              <td className="muted">{t.account}</td>
              <td>{t.tags.map((g) => <span key={g} className="tag">{g}</span>)}</td>
              <td className="right"><Amount v={t.amount} /></td>
              {extra && <td onClick={(e) => e.stopPropagation()}>{extra(t)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DrillDrawer({ drill, onClose }: { drill: Drill; onClose: () => void }) {
  const { openTxn, version } = useApp();
  const [query, setQuery] = useState(drill.query);
  useEffect(() => setQuery(drill.query), [drill]);
  const { data, error, loading } = useAsync(
    () =>
      api<{ transactions: Txn[]; total: number; count: number }>("/analytics/drilldown", {
        query,
        values: drill.values,
        use_compare_range: drill.use_compare_range ?? false,
      }),
    [JSON.stringify(query), JSON.stringify(drill.values), drill.use_compare_range, version],
  );
  const onExclude = drill.onExclude
    ? (id: number) => {
        drill.onExclude!(id);
        setQuery((q) => ({ ...q, filters: { ...q.filters, exclude_ids: [...(q.filters.exclude_ids ?? []), id] } }));
      }
    : undefined;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <aside className="drawer" role="dialog" aria-label={drill.title}>
      <header>
        <div>
          <h2>{drill.title}</h2>
          {data && (
            <p className="muted">
              {data.count} transactions · {money2(data.total)}
            </p>
          )}
        </div>
        <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
      </header>
      <Status loading={loading} error={error} empty={data?.count === 0} />
      {data && data.count > 0 && (
        <TxnTable
          items={data.transactions}
          onRowClick={(t) => openTxn(t.id)}
          extra={
            onExclude
              ? (t) => (
                  <button className="small" title="Leave this transaction out of the analysis" onClick={() => onExclude(t.id)}>
                    Exclude
                  </button>
                )
              : undefined
          }
        />
      )}
    </aside>
  );
}

export function useMeta() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const reloadMeta = useCallback(async () => setMeta(await api<Meta>("/meta")), []);
  useEffect(() => {
    reloadMeta();
  }, [reloadMeta]);
  return { meta, reloadMeta };
}
