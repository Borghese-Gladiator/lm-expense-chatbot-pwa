type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Fault = { path: string; status: number; code: string; times: number; after: number };

export class FakeBank {
  accounts: Json[] = [
    { account_id: "acc-chk", name: "Bank Checking", subtype: "checking", balances: { current: 1000, iso_currency_code: "USD" } },
  ];
  events: ["added" | "modified" | "removed", Json][] = [];
  pageSize = 500;
  faults: Fault[] = [];
  calls: [string, Json][] = [];
  private exchanges = 0;

  txn(id: string, amount: number, name: string, opts: Json = {}): Json {
    return {
      transaction_id: id,
      account_id: "acc-chk",
      date: "2026-10-01",
      amount,
      name,
      merchant_name: name,
      pending: false,
      pending_transaction_id: null,
      iso_currency_code: "USD",
      personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_COFFEE" },
      ...opts,
    };
  }

  add(id: string, amount: number, name: string, opts: Json = {}): Json {
    const t = this.txn(id, amount, name, opts);
    this.events.push(["added", t]);
    return t;
  }

  modify(id: string, patch: Json) {
    const latest = [...this.events].reverse().find(([k, t]) => k !== "removed" && t.transaction_id === id);
    if (!latest) throw new Error(`no bank transaction ${id}`);
    this.events.push(["modified", { ...latest[1], ...patch }]);
  }

  remove(id: string) {
    this.events.push(["removed", { transaction_id: id }]);
  }

  post(pendingId: string, postedId: string, patch: Json = {}) {
    const pending = [...this.events].reverse().find(([k, t]) => k !== "removed" && t.transaction_id === pendingId)!;
    this.add(postedId, pending[1].amount, pending[1].name, { ...patch, pending: false, pending_transaction_id: pendingId });
    this.remove(pendingId);
  }

  fail(path: string, status: number, code: string, times = 1, after = 0) {
    this.faults.push({ path, status, code, times, after });
  }

  callsTo(path: string) {
    return this.calls.filter(([p]) => p === path);
  }

  fetch: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const body = JSON.parse(String(init?.body ?? "{}"));
    this.calls.push([path, body]);
    for (const f of this.faults) {
      if (f.path !== path || f.times <= 0) continue;
      if (f.after > 0) {
        f.after--;
        continue;
      }
      f.times--;
      return Response.json({ error_code: f.code, error_message: "injected" }, { status: f.status });
    }
    if (path === "/link/token/create") return Response.json({ link_token: `link-${this.calls.length}` });
    if (path === "/item/public_token/exchange") {
      const n = ++this.exchanges;
      return Response.json({ access_token: `access-${n}`, item_id: `item-${n}` });
    }
    if (path === "/accounts/get") return Response.json({ accounts: this.accounts });
    if (path === "/transactions/sync") {
      const start = body.cursor ? Number(String(body.cursor).slice(1)) : 0;
      const slice = this.events.slice(start, start + this.pageSize);
      const next = start + slice.length;
      const pick = (kind: string) => slice.filter(([k]) => k === kind).map(([, t]) => t);
      return Response.json({
        added: pick("added"),
        modified: pick("modified"),
        removed: pick("removed"),
        accounts: this.accounts,
        next_cursor: `c${next}`,
        has_more: next < this.events.length,
      });
    }
    return Response.json({ error_code: "NOT_FAKED", error_message: path }, { status: 404 });
  };
}
