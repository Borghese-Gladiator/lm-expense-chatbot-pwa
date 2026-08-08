"use strict";

const resultsEl = document.getElementById("results");
const formEl = document.getElementById("query-form");
const questionEl = document.getElementById("question");
const syncBtn = document.getElementById("sync-btn");
const syncStatus = document.getElementById("sync-status");

async function submitQuestion(question, priorResultId) {
  const body = { question };
  if (priorResultId) body.result_id = priorResultId;
  const resp = await fetch("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || "query failed");
  }
  return resp.json();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderFacts(facts, parent) {
  if (!facts || facts.length === 0) return;
  const wrap = el("div", "facts");
  for (const f of facts) {
    const fact = el("div", "fact");
    fact.appendChild(el("div", "label", f.label));
    fact.appendChild(el("div", "value", f.value + (f.unit ? " " + f.unit : "")));
    wrap.appendChild(fact);
  }
  parent.appendChild(wrap);
}

function renderMetricBlock(block, node) {
  const value = block.vega_lite && block.vega_lite.value != null
    ? block.vega_lite.value
    : (block.facts && block.facts[0] ? block.facts[0].value : "—");
  if (block.view_spec && block.view_spec.title) {
    node.appendChild(el("div", "block-kind", block.view_spec.title));
  }
  node.appendChild(el("div", "metric-value", String(value)));
  renderFacts(block.facts, node);
}

function renderTableBlock(block, node, envelope) {
  const rid = block.result_id || envelope.result_id;
  fetchAndRenderTable(rid, node);
}

async function fetchAndRenderTable(resultId, node) {
  const resp = await fetch(`/api/results/${resultId}/rows?offset=0&limit=100`);
  if (!resp.ok) {
    node.appendChild(el("div", "error", "could not load rows"));
    return;
  }
  const result = await resp.json();
  const table = el("table");
  const thead = el("thead");
  const trh = el("tr");
  for (const col of result.columns) trh.appendChild(el("th", null, col));
  thead.appendChild(trh);
  table.appendChild(thead);
  const tbody = el("tbody");
  for (const row of result.rows) {
    const tr = el("tr");
    for (const cell of row) tr.appendChild(el("td", null, cell == null ? "" : String(cell)));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  node.appendChild(table);
}

function renderChartBlock(block, node, envelope) {
  const holder = el("div");
  node.appendChild(holder);
  if (block.vega_lite && window.vegaEmbed) {
    vegaEmbed(holder, block.vega_lite, { actions: false }).catch((e) => {
      holder.appendChild(el("div", "error", "chart render failed: " + e.message));
    });
  }
  const btn = el("button", "show-as-table", "Show as a table");
  btn.addEventListener("click", () => {
    submitQuestion("show that chart as a table", block.result_id || envelope.result_id)
      .then((env) => renderEnvelope(env, resultsEl))
      .catch((e) => resultsEl.prepend(el("div", "error", e.message)));
  });
  node.appendChild(btn);
}

function renderEnvelope(envelope, container) {
  const wrap = el("div");
  wrap.appendChild(el("h3", null, envelope.question));
  for (const block of envelope.blocks) {
    const node = el("div", "block");
    node.appendChild(el("div", "block-kind", block.kind));
    if (block.kind === "insight") {
      node.appendChild(el("p", null, block.text || ""));
      renderFacts(block.facts, node);
    } else if (block.kind === "metric") {
      renderMetricBlock(block, node);
    } else if (block.kind === "table") {
      renderTableBlock(block, node, envelope);
    } else if (block.kind === "chart") {
      renderChartBlock(block, node, envelope);
    }
    wrap.appendChild(node);
  }
  container.prepend(wrap);
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = questionEl.value.trim();
  if (!q) return;
  submitQuestion(q, null)
    .then((env) => renderEnvelope(env, resultsEl))
    .catch((err) => resultsEl.prepend(el("div", "error", err.message)));
});

syncBtn.addEventListener("click", () => {
  syncBtn.disabled = true;
  syncStatus.textContent = "syncing…";
  fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
    .then((r) => r.json())
    .then((res) => {
      syncStatus.textContent = res.synced
        ? `synced ${res.transactions_written} txns`
        : "sync failed";
    })
    .catch((e) => { syncStatus.textContent = "error: " + e.message; })
    .finally(() => { syncBtn.disabled = false; });
});
