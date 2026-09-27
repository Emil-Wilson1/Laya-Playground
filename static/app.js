const $ = (id) => document.getElementById(id);

const QUESTIONS = {
  department: {
    type: "choice",
    instructions: "Which department should handle this request?",
    criteria: {
      billing: "invoices, payments, refunds",
      technical: "bugs, outages, system errors",
      other: "everything else",
    },
  },
  urgency: {
    type: "score",
    instructions: "How urgent is this request?",
    criteria: ["not urgent", "soon", "critical deadline or blocking issue"],
  },
  churn_risk: {
    type: "noul",
    instructions: "Does the user threaten to cancel or leave?",
  },
};

const PRESETS = {
  billing:
    "Hi, we were billed twice for March. " +
    "Please refund the duplicate today or we will cancel our plan.",
  outage:
    "ALERT: Our production API has been down for 3 hours. " +
    "Customers cannot check out and we are losing orders every minute. " +
    "Someone needs to fix this immediately or we are switching providers.",
  feature:
    "Hi team, whenever you get a chance could you add a dark-mode toggle " +
    "to the dashboard? No rush at all, just a nice-to-have for our evening users. Thanks!",
};

function setLoading(on) {
  const btn = $("decide");
  btn.disabled = on;
  btn.textContent = on ? "Deciding…" : "Decide";
}

function showError(msg) {
  const el = $("error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function bar(pct) {
  return `<div class="bar"><div data-w="${pct}"></div></div>`;
}

function renderCards(answers) {
  const box = $("results");
  let html = "";
  if (answers.department) {
    const d = answers.department;
    const conf = d.confidence ?? 0;
    const cls = d.choice === "billing" ? "billing" : d.choice === "technical" ? "technical" : "other";
    html += `<div class="card"><div class="card-top"><span class="card-name">department · choice</span></div>
      <div class="card-value ${cls}">${escapeHtml(String(d.choice))}</div>
      ${bar(Math.round(conf * 100))}
      <div class="card-sub">confidence ${(conf * 100).toFixed(1)}%</div></div>`;
  }
  if (answers.urgency) {
    const u = answers.urgency;
    const score = u.score ?? 0;
    const pct = Math.min(100, Math.round((score / 2) * 100));
    html += `<div class="card"><div class="card-top"><span class="card-name">urgency · score</span></div>
      <div class="card-value">${Number(score).toFixed(2)} <span style="font-size:13px;color:var(--muted)">/ 2.0</span></div>
      ${bar(pct)}
      <div class="card-sub">expected level on the rubric</div></div>`;
  }
  if (answers.churn_risk) {
    const c = answers.churn_risk;
    const p = c.noul ?? 0;
    const danger = p >= 0.5;
    html += `<div class="card"><div class="card-top"><span class="card-name">churn risk · yes / no</span></div>
      <div class="card-value ${danger ? "danger" : "calm"}">${danger ? "YES" : "NO"}</div>
      ${bar(Math.round(p * 100))}
      <div class="card-sub">P(threat) = ${(p * 100).toFixed(1)}%</div></div>`;
  }
  box.innerHTML = html || `<div class="empty"><p>No answers returned.</p></div>`;
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      box.querySelectorAll("[data-w]").forEach((el) => (el.style.width = el.dataset.w + "%"))
    )
  );
}

async function fetchJson(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error("Cannot reach the API. Is uvicorn running?");
  }
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(`Empty response from server (status ${res.status}). Try reloading the page.`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Server returned non-JSON (status ${res.status}).`);
  }
  if (!res.ok) throw new Error((data && data.detail) || `Request failed (${res.status})`);
  return data;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function decide() {
  $("error").classList.add("hidden");
  const questions = {};
  if ($("q-department").checked) questions.department = QUESTIONS.department;
  if ($("q-urgency").checked) questions.urgency = QUESTIONS.urgency;
  if ($("q-churn").checked) questions.churn_risk = QUESTIONS.churn_risk;
  if (!Object.keys(questions).length) {
    showError("Select at least one question first.");
    return;
  }
  setLoading(true);
  $("results").innerHTML = `<div class="card shimmer"><div class="card-value">…</div>${bar(0)}<div class="card-sub">…</div></div>`;
  const t0 = performance.now();
  try {
    const data = await fetchJson("/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: { body: $("state").value }, questions }),
    });
    const ms = Math.round(performance.now() - t0);
    const n = Object.keys(data.answers || {}).length;
    const lat = $("latency");
    lat.textContent = `Answered ${n} question${n === 1 ? "" : "s"} in one forward pass · ${ms} ms round-trip`;
    lat.classList.remove("hidden");
    renderCards(data.answers || {});
    $("routeModel").textContent = (data.routing && data.routing.model) || "unknown";
    $("raw").textContent = JSON.stringify(data, null, 2);
    $("rawWrap").classList.remove("hidden");
  } catch (e) {
    $("results").innerHTML = `<div class="empty"><p>Something went wrong — check the message below and try again.</p></div>`;
    showError(e.message);
  } finally {
    setLoading(false);
  }
}

$("decide").addEventListener("click", decide);
$("preset").addEventListener("change", (e) => {
  $("state").value = PRESETS[e.target.value];
});

$("state").value = PRESETS.billing;
