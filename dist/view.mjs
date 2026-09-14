import * as transport from "./transport.mjs";
const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let data,
  selected = "EX-1042",
  busy = false;
const drafts = new Map();
function error(message) {
  $("global-error").textContent = message;
  $("global-error").hidden = !message;
}
function toast(message) {
  $("toast").textContent = message;
  setTimeout(() => {
    $("toast").textContent = "";
  }, 5000);
}
async function post(path, body = {}) { return transport.post(path, body, data); }
async function refresh() {
  data = await transport.state();
  render();
}
function panel(id) {
  document
    .querySelectorAll(".panel")
    .forEach((el) => (el.hidden = el.id !== id));
  document.querySelectorAll(".chapter").forEach((el) => {
    el.classList.toggle("active", el.dataset.panel === id);
    if (el.dataset.panel === id) el.setAttribute("aria-current", "step");
    else el.removeAttribute("aria-current");
  });
  if (id === "evidence" || id === "checks")
    transport.report()
      .then((r) => {
        data.report = r;
        renderReport();
      })
      .catch((e) => error(e.message));
}
document
  .querySelectorAll("[data-panel]")
  .forEach((el) => el.addEventListener("click", () => panel(el.dataset.panel)));
document.querySelectorAll("[data-go]").forEach((el) =>
  el.addEventListener("click", () => {
    panel(el.dataset.go);
    document
      .querySelector(".chapters")
      .scrollIntoView({ block: "start", behavior: "instant" });
  }),
);
function renderCases() {
  const list = data.cases.filter(
    (c) =>
      $("filter").value === "all" ||
      ($("filter").value === "open"
        ? c.status !== "resolved"
        : c.status === "resolved"),
  );
  if (!list.some((c) => c.id === selected)) selected = list[0]?.id;
  $("open-count").textContent = data.cases.filter(
    (c) => c.status !== "resolved",
  ).length;
  $("cases").innerHTML = list.length
    ? list
        .map(
          (c) =>
            `<button class="case" data-case="${esc(c.id)}" aria-pressed="${c.id === selected}"><span class="case-line"><span class="case-id">${esc(c.id)} · ${esc(c.priority)}</span><span class="status ${esc(c.status)}">${esc(c.status)}</span></span><strong>${esc(c.title)}</strong><small>${esc(c.partner)}</small></button>`,
        )
        .join("")
    : '<p class="empty">No cases in this view. Choose another filter.</p>';
  $("cases")
    .querySelectorAll("[data-case]")
    .forEach((el) =>
      el.addEventListener("click", () => {
        selected = el.dataset.case;
        renderCases();
      }),
    );
  renderDetail();
}
function renderDetail() {
  const c = data.cases.find((c) => c.id === selected);
  if (!c) {
    $("case-detail").innerHTML =
      '<p class="empty">Choose another filter to view a case.</p>';
    return;
  }
  const observer = $("persona").value === "demo-observer";
  const timeline = [
    ...c.events,
    ...c.history.map((e) => ({
      at: e.at,
      source: e.actor + " · simulated",
      text:
        e.action === "assign"
          ? "Case assigned to operations"
          : `Case resolved: ${e.reason}`,
    })),
  ];
  let controls;
  if (c.status === "resolved")
    controls = `<div class="boundary"><span class="mini">RESOLVED · CASE HISTORY RETAINED</span><p>${esc(c.reason)}</p><p>Recorded by ${esc(c.assigned_to)}. Consent and account-data access remain unchanged.</p></div>`;
  else if (observer)
    controls =
      '<div class="boundary"><span class="mini">OBSERVER VIEW</span><p>You can inspect the evidence. Switch to the operations officer persona to assign or resolve this synthetic case.</p></div>';
  else if (c.status === "open")
    controls =
      '<div class="control-head"><p>First, give this case an accountable owner. This demo uses a simulated operator.</p><button id="assign" class="primary">Assign to demo operator</button></div>';
  else
    controls = `<form id="resolve-form"><label for="reason">Why can this case close?</label><textarea id="reason" maxlength="1000" placeholder="Describe what you checked and the outcome." required>${esc(drafts.get(c.id) || "")}</textarea><div class="form-foot"><button id="suggestion" type="button" class="text-button">Use the example reason</button><button type="submit" class="primary">Record resolution</button></div><p class="fine">12–1,000 characters. Your reason becomes part of the case history.</p></form>`;
  $("case-detail").innerHTML =
    `<div class="case-line"><span class="mini">${esc(c.id)} / ${esc(c.consent)}</span><span class="status ${esc(c.status)}">${esc(c.status)}</span></div><h3>${esc(c.title)}</h3><p class="mismatch">${esc(c.mismatch)}</p><div class="detail-meta"><span>${esc(c.partner)}</span><span>Owner: ${c.assigned_to ? "demo operator" : "unassigned"}</span></div><span class="mini">SOURCE EVENTS & CASE HISTORY · UTC</span><ol class="event-list">${timeline.map((e) => `<li><time datetime="${esc(e.at)}" title="${esc(e.at)}">${esc(e.at.slice(5, 10) + " " + e.at.slice(11, 16))}</time><div><strong>${esc(e.source)}</strong><p>${esc(e.text)}</p></div></li>`).join("")}</ol><div class="case-controls"><p id="case-error" class="error" role="alert" hidden></p>${controls}</div>`;
  $("assign")?.addEventListener("click", () => action("assign"));
  $("reason")?.addEventListener("input", (e) =>
    drafts.set(c.id, e.target.value),
  );
  $("suggestion")?.addEventListener("click", () => {
    $("reason").value = c.suggested_reason;
    drafts.set(c.id, c.suggested_reason);
    $("reason").focus();
  });
  $("resolve-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    action("resolve", $("reason").value);
  });
}
async function action(action, reason) {
  if (busy) return;
  busy = true;
  error("");
  try {
    const result = await post("action", {
      id: selected,
      action,
      reason,
      actor: $("persona").value,
      revision: data.revision,
    });
    Object.assign(data, result);
    renderCases();
    toast(
      action === "assign"
        ? "Case assigned. Record its resolution next."
        : "Resolution recorded with its actor and history.",
    );
    if (action === "assign") $("reason")?.focus();
    else $("case-detail").scrollIntoView({ block: "nearest" });
  } catch (e) {
    if (/stale/.test(e.message)) await refresh();
    if ($("case-error")) { $("case-error").textContent = e.message; $("case-error").hidden = false; }
    else error(e.message);
  } finally {
    busy = false;
  }
}
function renderReport() {
  const r = data.report;
  const labels = {
    "not-run": "No run recorded",
    verified: "All four checks behaved as expected",
    failed: "A check did not behave as expected",
    incomplete: "Evidence is incomplete",
  };
  $("run-status").textContent = labels[r.status] ?? "Evidence unavailable";
  $("run-status").className =
    r.status === "verified" ? "good" : r.status === "not-run" ? "" : "bad";
  $("run-subtitle").textContent = r.findings?.length
    ? r.findings.join(" ")
    : r.completed_at
      ? `Recorded ${new Date(r.completed_at).toLocaleString()} · synthetic inputs · human review pending`
      : "The app tests and Loom gate run against synthetic inputs.";
  const descriptions = [
    "Assignment, meaningful reasons, observer restrictions and chronological history.",
    "Remove a resolved case’s history. The application validator should refuse it.",
    "Give the synthetic runner an approver role. Loom should reject that registry.",
    "Remove the agent’s approver role. The fixture becomes structurally valid; no approval is granted.",
  ];
  $("steps").innerHTML = r.scenario.steps
    .map((s, i) => {
      const step = r.steps.find((x) => x.id === s.id);
      const status = !step
        ? "Not recorded"
        : step.ok
          ? step.expected_exit === 1
            ? "Refusal observed"
            : "Check passed"
          : "Unexpected result";
      return `<article class="step-row"><span class="step-number">0${i + 1}</span><div><h3>${esc(s.title)}</h3><p>${esc(descriptions[i])}</p></div><div class="step-outcome"><span class="mini ${step?.ok ? "good" : step ? "bad" : ""}">${esc(status)}</span>${step ? `<a target="_blank" rel="noopener" href="${transport.artifact(step.log)}">Read actual output ↗</a><small>Recorded execution · synthetic</small>` : "<small>Awaiting execution</small>"}</div></article>`;
    })
    .join("");
  $("provenance").innerHTML = [
    ["Change", "CHG-DEMO-001"],
    ["Plugin base commit", r.source_commit],
    ["Demo source digest", r.source_digest],
    ["Run", r.run_id ?? "Not run"],
    ["Evidence status", labels[r.status] ?? r.status],
    ["Human approval", "Pending — no approval created"],
    ["Platform enforcement", "Not demonstrated"],
    ["Loom agent-delivery qualification", "Not demonstrated"],
  ]
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
    .join("");
  $("receipt-links").innerHTML = r.steps
    .map(
      (s) =>
        `<a class="receipt-link" href="${transport.artifact(s.receipt)}" target="_blank" rel="noopener">${esc(s.title)} · receipt ↗</a>`,
    )
    .join("");
}
function render() {
  renderCases();
  $("requirement").textContent = data.context.requirement;
  const effects = [
    "The Assign action appears before resolution.",
    transport.hosted ? "Browser rules reject short or missing explanations." : "The backend rejects short or missing explanations.",
    "The timeline preserves the actor and resolution.",
    transport.hosted ? "The simulated observer has no case-editing controls." : "The observer cannot mutate a case, including through the API.",
  ];
  $("rules").innerHTML = data.context.rules
    .map(
      (r, i) =>
        `<div><span class="mini">${esc(r.id)}</span><p>${esc(r.text)}</p><small>${effects[i]}</small></div>`,
    )
    .join("");
  renderReport();
}
$("filter").addEventListener("change", renderCases);
$("persona").addEventListener("change", renderDetail);
$("run").addEventListener("click", async () => {
  if (transport.hosted) { panel("evidence"); return; }
  if (busy) return;
  busy = true;
  error("");
  $("run").disabled = true;
  $("run").textContent = "Running actual checks…";
  $("run-status").textContent = "Executing in the local workspace…";
  try {
    data.report = await post("run");
    renderReport();
    toast(
      data.report.status === "verified"
        ? "Two passes and two deliberate refusals recorded."
        : "Run needs attention. Inspect the findings.",
    );
  } catch (e) {
    error(e.message);
  } finally {
    busy = false;
    $("run").disabled = false;
    $("run").textContent = "Run again";
  }
});
$("reset-open").addEventListener("click", () => $("reset-dialog").showModal());
$("reset-cancel").addEventListener("click", () => $("reset-dialog").close());
$("reset-confirm").addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  try {
    await post("reset");
    drafts.clear();
    selected = "EX-1042";
    $("filter").value = "all";
    await refresh();
    $("reset-dialog").close();
    toast(transport.hosted ? "Your browser scenario has been reset. Recorded evidence is unchanged." : "Scenario restarted. Previous records are archived.");
  } catch (e) {
    error(e.message);
  } finally {
    busy = false;
  }
});
refresh().catch((e) => error(e.message));
