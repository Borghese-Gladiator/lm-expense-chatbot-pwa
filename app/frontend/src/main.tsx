import "./styles.css";

import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type { Drill } from "./api";
import { setCurrency } from "./format";
import { Accounts } from "./pages/Accounts";
import { Explore } from "./pages/Explore";
import { Overview } from "./pages/Overview";
import { Settings } from "./pages/Settings";
import { Transactions } from "./pages/Transactions";
import { Ctx, DrillDrawer, useMeta } from "./shared";
import { TxnDetail } from "./TxnDetail";

const PAGES = {
  overview: { label: "Overview", el: Overview },
  explore: { label: "Explore", el: Explore },
  transactions: { label: "Transactions", el: Transactions },
  accounts: { label: "Accounts", el: Accounts },
  settings: { label: "Settings", el: Settings },
} as const;
type PageId = keyof typeof PAGES;

const pageFromHash = (): PageId => {
  const id = location.hash.slice(1).split("?")[0] as PageId;
  return id in PAGES ? id : "overview";
};

function App() {
  const { meta, reloadMeta } = useMeta();
  const [page, setPage] = useState<PageId>(pageFromHash);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [txnId, setTxnId] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const closeDrill = useCallback(() => setDrill(null), []);

  useEffect(() => {
    const on = () => {
      const next = pageFromHash();
      setPage((prev) => {
        if (prev !== next) {
          setDrill(null);
          setTxnId(null);
        }
        return next;
      });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => {
    if (meta) setCurrency(meta.currency);
  }, [meta]);

  const Page = PAGES[page].el;
  const empty = meta && meta.accounts.length === 0 && page !== "accounts" && page !== "settings";

  return (
    <Ctx.Provider value={{ meta, reloadMeta, openDrill: setDrill, openTxn: setTxnId, version, bump }}>
      <nav className="nav">
        <span className="brand">Ledgerlens</span>
        {(Object.keys(PAGES) as PageId[]).map((id) => (
          <a key={id} href={`#${id}`} aria-current={page === id ? "page" : undefined}>
            {PAGES[id].label}
          </a>
        ))}
      </nav>
      <main>
        {empty ? (
          <div className="page">
            <div className="card state">
              <h2>No data yet</h2>
              <p>Connect a bank or import a CSV file (for example, your Lunch Money export) on the Accounts page.</p>
              <a className="button" href="#accounts">Go to Accounts</a>
            </div>
          </div>
        ) : (
          <Page key={page} />
        )}
      </main>
      {drill && !txnId && <DrillDrawer drill={drill} onClose={closeDrill} />}
      {txnId && <TxnDetail id={txnId} onClose={() => setTxnId(null)} />}
    </Ctx.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
