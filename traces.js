// Traces: live + historical Kore Agent Platform executions (workflow "Claim AI Analysis"), by run/claim and by agent.
(() => {
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = n => Math.round(n || 0).toLocaleString("en-US");
const ago = d => { const s = (Date.now() - new Date(d)) / 1000; return s < 90 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " d ago"; };
const dur = ms => ms < 1000 ? Math.round(ms) + " ms" : (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + " s";
const AGN = { doc: ["DocuMind", "Document analyzer"], img: ["VisionAssess", "Image analyzer"], fraud: ["FraudShield", "Fraud check"], repair: ["RepairIQ", "Repair cost"], uw: ["UnderwriteIQ", "Underwriting advisor"] };
const ST = { completed: ["#16a34a", "Completed"], running: ["#2a78d6", "Running"], failed: ["#dc2626", "Failed"], error: ["#dc2626", "Failed"], cancelled: ["#6b7686", "Cancelled"] };
const badge = (s, live) => { const [c, t] = ST[s] || ["#6b7686", s || "-"]; return `<span class="trb" style="--c:${c}">${live ? '<i class="trdot"></i>' : ""}${t}</span>`; };
const EVI = { input: ["▶", "#6b7686"], llm: ["✦", "#7c4dff"], tool: ["🔧", "#d97706"], output: ["◀", "#6b7686"], response: ["💬", "#16a34a"] };
const tile = (l, v, sub = "") => `<div class="tile"><small>${l}</small><b style="font-size:19px">${v}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;

async function mount(el, ctx) {
  const { api, rpc, go } = ctx;
  let runs = [], aspans = [], sel = null, detail = null, view = ctx.id && AGN[ctx.id] ? "agent" : "run", f = { q: /^(CLM-|[0-9a-f-]{20,})/i.test(ctx.id || "") ? ctx.id : "", agent: AGN[ctx.id] ? ctx.id : "all", status: "all" }, live = true, timer = null, openSpan = {};
  const cols = "execution_id,claim_no,status,live,started_at,completed_at,duration_ms,tokens_in,tokens_out,llm_calls,tool_calls,agents";
  const loadRuns = async () => { runs = await api(`uw_traces?select=${cols}&order=started_at.desc&limit=300`); };
  const loadAgent = async () => { aspans = await rpc("uw_agent_spans", { p_agent: f.agent === "all" ? null : f.agent, p_limit: 400 }) || []; };
  const loadDetail = async () => { if (!sel) { detail = null; return; } const r = await api(`uw_traces?execution_id=eq.${encodeURIComponent(sel)}&select=*`); detail = r[0] || null; };
  const filteredRuns = () => runs.filter(r => (f.status === "all" || r.status === f.status || (f.status === "failed" && r.status === "error")) && (f.agent === "all" || (r.agents || []).includes(f.agent)) && (!f.q || (r.claim_no || "").toLowerCase().includes(f.q.toLowerCase()) || r.execution_id.startsWith(f.q)));
  const filteredSpans = () => aspans.filter(s => (f.status === "all" || s.status === f.status) && (!f.q || (s.claim_no || "").toLowerCase().includes(f.q.toLowerCase())));

  function waterfall(d) {
    const total = Math.max(d.duration_ms, ...d.spans.map(s => s.offset_ms + s.ms), 1);
    return `<div class="wf">${d.spans.map((s, i) => { const [c] = ST[s.status] || ["#6b7686"]; return `<div class="wfr" data-sp="${i}" title="${esc(s.name)} · ${dur(s.ms)}"><span class="wfl">${s.kind === "agent" ? "🤖" : "⚙"} ${esc(s.name.replace(/_/g, " "))}</span><span class="wft"><span class="wfb ${s.kind}" style="left:${(s.offset_ms / total * 100).toFixed(2)}%;width:${Math.max(s.ms / total * 100, 0.8).toFixed(2)}%;background:${c}"></span></span><span class="wfm">${dur(s.ms)}</span></div>`; }).join("")}</div>`;
  }
  function spanBody(s, i) {
    const open = openSpan[sel + ":" + i] ?? (s.kind === "agent");
    return `<details class="sp" data-sp="${i}" ${open ? "open" : ""}><summary><span class="sev sm" style="background:${(ST[s.status] || ["#6b7686"])[0]}">${s.kind === "agent" ? "A" : "T"}</span><b>${esc(s.name.replace(/_/g, " "))}</b><small>${dur(s.ms)}${s.model ? " · " + esc(s.model) : ""}${s.tokens_in || s.tokens_out ? ` · ${num(s.tokens_in)} in / ${num(s.tokens_out)} out tokens` : ""} · ${(s.events || []).length} events</small></summary>
      <div class="trl">${(s.events || []).map(e => { const [ic, c] = EVI[e.type] || ["•", "#6b7686"]; return `<div class="trev"><span class="tei" style="color:${c}">${ic}</span><div class="teb"><div class="teh"><b>${esc(e.label)}</b><small>+${dur(e.t || 0)}${e.ms ? " · took " + dur(e.ms) : ""}${e.tin || e.tout ? ` · ${num(e.tin)} in / ${num(e.tout)} out` : ""}${e.meta ? " · " + esc(e.meta) : ""}</small></div>${e.detail ? `<pre class="ted">${esc(e.detail)}</pre>` : ""}</div></div>`; }).join("") || `<div class="empty">No events recorded</div>`}</div></details>`;
  }
  function detailHtml() {
    if (!sel) return `<div class="empty" style="padding:70px 20px">Select a trace to see every agent step, LLM call and tool call.</div>`;
    if (!detail) return `<div class="spin">Loading trace…</div>`;
    const d = detail, claimId = (ctx.claimsById || {})[d.claim_no];
    return `<div class="adh"><span class="sev lg" style="background:${(ST[d.status] || ["#6b7686"])[0]}">⛓</span><div><h3>${esc(d.claim_no || "Execution")} ${badge(d.status, d.live)}</h3><small>Execution ${esc(d.execution_id.slice(0, 13))}… · started ${new Date(d.started_at).toLocaleString("en-GB")}</small></div></div>
    <div class="ada">${claimId ? `<a class="btn ghost sm" href="#/claim/${claimId}/ai">Open claim</a>` : ""}${d.live ? `<span class="shint">Live - updating every few seconds</span>` : ""}</div>
    <div class="tiles">${tile("Duration", dur(d.duration_ms))}${tile("LLM calls", num(d.llm_calls))}${tile("Tool calls", num(d.tool_calls))}${tile("Tokens", num(d.tokens_in + d.tokens_out), `${num(d.tokens_in)} in / ${num(d.tokens_out)} out`)}</div>
    <h4>Timeline</h4>${waterfall(d)}<h4>Steps</h4>${d.spans.map(spanBody).join("")}`;
  }
  function runRow(r) { return `<div class="ali ${r.execution_id === sel ? "on" : ""}" data-id="${r.execution_id}"><span class="sev" style="background:${(ST[r.status] || ["#6b7686"])[0]}">⛓</span><div class="alb"><b>${esc(r.claim_no || "Execution")} ${badge(r.status, r.live)}</b><small>${dur(r.duration_ms)} · ${num(r.llm_calls)} LLM · ${num(r.tool_calls)} tools · ${num(r.tokens_in + r.tokens_out)} tokens</small><div class="alm">${(r.agents || []).map(a => `<span class="chip2">${AGN[a]?.[0] || a}</span>`).join("")}<span>${ago(r.started_at)}</span></div></div></div>`; }
  function spanRow(s) { const k = s.execution_id; return `<div class="ali ${k === sel ? "on" : ""}" data-id="${k}" data-sp="${s.idx}"><span class="sev" style="background:${(ST[s.status] || ["#6b7686"])[0]}">🤖</span><div class="alb"><b>${esc(AGN[s.agent_key]?.[0] || s.name)} · ${esc(s.claim_no || "")} ${badge(s.status, s.live && s.status === "running")}</b><small>${dur(s.ms)} · ${num(s.tokens_in + s.tokens_out)} tokens${s.model ? " · " + esc(s.model) : ""}</small><div class="alm"><span>${ago(s.run_started)}</span></div></div></div>`; }
  function agentTiles() {
    const rows = Object.keys(AGN).map(k => { const x = aspans.filter(s => s.agent_key === k); return [k, x]; });
    if (f.agent !== "all") { const x = aspans, ok = x.filter(s => s.status === "completed").length; return `<div class="tiles">${tile("Runs", num(x.length))}${tile("Success", x.length ? Math.round(ok / x.length * 100) + "%" : "-")}${tile("Avg latency", x.length ? dur(x.reduce((a, s) => a + s.ms, 0) / x.length) : "-")}${tile("Avg tokens", x.length ? num(x.reduce((a, s) => a + s.tokens_in + s.tokens_out, 0) / x.length) : "-")}</div>`; }
    return `<div class="trag">${rows.map(([k]) => `<a class="tra" href="#/traces/${k}"><b>${AGN[k][0]}</b><small>${AGN[k][1]}</small><span>›</span></a>`).join("")}</div>`;
  }

  function draw() {
    const list = view === "run" ? filteredRuns() : filteredSpans(), running = runs.filter(r => r.live).length;
    el.innerHTML = `<div class="top"><div><h2>Traces</h2><p>Live and historical Kore Agent Platform executions of the Claim AI Analysis workflow, by claim and by agent</p></div><div class="trhead"><label class="shint"><input type="checkbox" id="tr-live" ${live ? "checked" : ""}> Auto-refresh${running ? ` · <b style="color:#2a78d6">${running} running</b>` : ""}</label><button class="btn ghost sm" id="tr-ref">↻ Refresh</button></div></div>
    <div class="alw"><div class="card al-list"><div class="alf"><div class="pills">${[["run", "By claim run"], ["agent", "By agent"]].map(([v, t]) => `<label class="pl"><input type="radio" name="tv" value="${v}" ${view === v ? "checked" : ""}><span>${t}</span></label>`).join("")}</div>
      <div class="alf2"><input id="tr-q" placeholder="Search claim no. (CLM-…)" value="${esc(f.q)}"><select id="tr-ag"><option value="all">All agents</option>${Object.entries(AGN).map(([k, v]) => `<option value="${k}" ${f.agent === k ? "selected" : ""}>${v[0]}</option>`).join("")}</select><select id="tr-st"><option value="all">Any status</option><option value="completed" ${f.status === "completed" ? "selected" : ""}>Completed</option><option value="running" ${f.status === "running" ? "selected" : ""}>Running</option><option value="failed" ${f.status === "failed" ? "selected" : ""}>Failed</option></select></div></div>
      ${view === "agent" ? `<div style="padding:10px 14px 0">${agentTiles()}</div>` : ""}
      <div class="als">${list.slice(0, 150).map(view === "run" ? runRow : spanRow).join("") || `<div class="empty">No traces match these filters.</div>`}</div></div>
      <div class="card al-detail" id="al-detail">${detailHtml()}</div></div>`;
    el.querySelectorAll('input[name="tv"]').forEach(r => r.onchange = async () => { view = r.value; if (view === "agent") await loadAgent(); draw(); place(); });
    el.querySelector("#tr-q").oninput = e => { f.q = e.target.value; clearTimeout(draw.t); draw.t = setTimeout(() => { draw(); el.querySelector("#tr-q").focus(); const i = el.querySelector("#tr-q"); i.setSelectionRange(i.value.length, i.value.length); place(); }, 250); };
    el.querySelector("#tr-ag").onchange = async e => { f.agent = e.target.value; if (view === "agent") await loadAgent(); draw(); place(); };
    el.querySelector("#tr-st").onchange = e => { f.status = e.target.value; draw(); place(); };
    el.querySelector("#tr-live").onchange = e => { live = e.target.checked; schedule(); };
    el.querySelector("#tr-ref").onclick = async () => { await refresh(true); ctx.toast("Traces refreshed"); };
    el.querySelectorAll(".ali").forEach(n => n.onclick = async () => { sel = n.dataset.id; detail = null; draw(); place(); await loadDetail(); const b = el.querySelector("#al-detail"); if (b) { b.innerHTML = detailHtml(); bind(); place(); } });
    bind();
  }
  function bind() {
    el.querySelectorAll("details.sp").forEach(d => d.ontoggle = () => { openSpan[sel + ":" + d.dataset.sp] = d.open; });
    el.querySelectorAll(".wfr").forEach(r => r.onclick = () => { const d = el.querySelector(`details.sp[data-sp="${r.dataset.sp}"]`); if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth", block: "nearest" }); } });
  }
  function place() {
    const box = el.querySelector("#al-detail"), row = el.querySelector(".ali.on"), w = el.querySelector(".alw");
    if (!box || !row || !w) return;
    if (getComputedStyle(w).gridTemplateColumns.trim().split(/\s+/).length === 1) { box.classList.add("inline"); row.after(box); }
  }
  async function refresh(force) {
    if (!el.isConnected || !el.querySelector(".alw")) return;
    if (!force && document.activeElement && ["tr-q", "tr-ag", "tr-st"].includes(document.activeElement.id)) return;
    await loadRuns(); if (view === "agent") await loadAgent(); if (sel) await loadDetail();
    const keep = window.scrollY; draw(); place(); window.scrollTo(0, keep);
  }
  function schedule() { clearInterval(timer); if (live) timer = setInterval(() => { if (!el.isConnected) return clearInterval(timer); refresh(false); }, 4000); }

  el.innerHTML = `<div class="spin">Loading traces…</div>`;
  await loadRuns(); if (view === "agent") await loadAgent();
  try { ctx.claimsById = Object.fromEntries((await ctx.claims()).map(c => [c.claim_no, c.id])); } catch (e) { ctx.claimsById = {}; }
  const exact = /^CLM-/i.test(f.q) ? runs.filter(r => r.claim_no === f.q)[0] : null; if (exact) { sel = exact.execution_id; await loadDetail(); }
  draw(); place(); schedule();
  if (window.__trChat) window.removeEventListener("chatlayout", window.__trChat);
  window.__trChat = () => { if (el.isConnected && el.querySelector(".alw")) { draw(); place(); } else window.removeEventListener("chatlayout", window.__trChat); };
  window.addEventListener("chatlayout", window.__trChat);
}
window.Traces = { mount };
})();
