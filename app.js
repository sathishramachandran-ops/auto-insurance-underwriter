(() => {
const { SUPABASE_URL: URL_, SUPABASE_ANON_KEY: KEY } = window.CONFIG;
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };
const $app = document.getElementById("app");
let user = JSON.parse(sessionStorage.getItem("uw_user") || "null");
let claims = null;            // cached list
const detailCache = {};
let AGENTS = null, STATS = [];

// ---------- helpers ----------
const LOGO = (n = 34) => `<svg width="${n}" height="${n}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="ia" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d5fe0"/><stop offset="1" stop-color="#0e9f9a"/></linearGradient><linearGradient id="ib" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dbe9ff"/></linearGradient></defs><rect width="48" height="48" rx="12" fill="url(#ia)"/><path d="M24 7.5 38.5 13v11c0 8.2-6.2 14.2-14.5 17.3C15.700 38.200 9.500 32.200 9.500 24V13Z" fill="url(#ib)"/><path d="M15.500 29.500v-3.200l2.200-5.100c.5-1.100 1.500-1.800 2.700-1.800h7.200c1.200 0 2.200.7 2.700 1.800l2.200 5.100v3.200h-2.600v-1.700H18.100v1.700Z" fill="#1d5fe0"/><path d="m19.400 22.200 1.200-2.600c.2-.4.600-.6 1-.6h5.600c.4 0 .8.200 1 .6l1.200 2.600Z" fill="url(#ib)"/><circle cx="19.600" cy="27.200" r="1.300" fill="#fff"/><circle cx="28.400" cy="27.200" r="1.300" fill="#fff"/><path d="m37.500 5.500.9 2.400 2.400.9-2.400.9-.9 2.400-.9-2.400-2.400-.9 2.400-.9Z" fill="#ffd54a" stroke="#fff" stroke-width=".6"/></svg>`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => "AED " + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fdate = d => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-") : "—";
const fdt = d => d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(/(\d{4}),/, "$1") : "";
const BADGE = { "New": "b-new", "Pending Underwriting": "b-pu", "In Review": "b-ir", "Approved": "b-ap", "Pending Documents": "b-pd", "Rejected": "b-rj", "Pending Garage Estimate": "b-pg", "Closed": "b-cl" };
const badge = s => `<span class="badge ${BADGE[s] || ""}">${esc(s)}</span>`;
const toast = m => { const t = document.getElementById("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2600); };
const fileUrl = x => `${URL_}/storage/v1/object/public/${x.bucket || "claim-photos"}/${x.storage_path}`;
const imgSrc = x => x.storage_path ? fileUrl(x) : svgUri(x.content);
const svgUri = s => "data:image/svg+xml;utf8," + encodeURIComponent(s);

async function api(path) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function rpc(fn, args) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(args) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.message || "Request failed");
  return j;
}
async function loadClaims(force) {
  if (!claims || force) claims = await api("uw_claims?select=*&order=reported_on.desc");
  return claims;
}

// ---------- routing ----------
window.addEventListener("hashchange", route);
function go(h) { location.hash = h; }
async function route() {
  if (!user) return renderLogin();
  const h = location.hash.replace(/^#\/?/, "") || "dashboard";
  const [page, id, tab] = h.split("/");
  try {
    if (page === "claim") return await renderClaim(id, tab || "overview");
    if (page === "claims") return await renderList("claims");
    if (page === "queue") return await renderList("queue");
    if (page === "reports") return await renderReports(id);
    if (page === "alerts") return await renderAlerts(id);
    if (page === "settings") return renderSettings(id);
    return await renderList("dashboard");
  } catch (e) { shell("", `<div class="card empty">Failed to load: ${esc(e.message)}</div>`); }
}

// ---------- shell / login ----------
function renderLogin() {
  $app.innerHTML = `<div class="login-wrap"><form class="login-card" id="lf">
    <div class="logo">${LOGO(64)}</div><h1 class="wm-l"><b>Claim</b><em>Assist</em></h1><div class="sub">Claim Underwriter Portal</div>
    <h3 style="margin:0 0 4px">Welcome Back</h3><div class="sub" style="margin-bottom:8px">Sign in to access claims and underwriting tools</div>
    <label>Email / Username</label><input id="em" type="email" placeholder="john.doe@insurer.com" value="sathish.kumar@insurer.com" required>
    <label>Password</label><div class="pw"><input id="pw" type="password" placeholder="Enter your password" value="Underwriter@123" required><span id="eye">👁</span></div>
    <button class="btn" style="width:100%;margin-top:18px" id="lb">Login</button><div class="err" id="le"></div>
    <div class="hint"><b>Demo accounts</b> (password <code>Underwriter@123</code>)<br>sathish.kumar@insurer.com<br>priya.menon@insurer.com</div>
    <p style="font-size:11px;color:var(--mut)">Secure • Trusted • Built for Better Decisions</p></form></div>`;
  document.getElementById("eye").onclick = () => { const p = document.getElementById("pw"); p.type = p.type === "password" ? "text" : "password"; };
  document.getElementById("lf").onsubmit = async e => {
    e.preventDefault(); const b = document.getElementById("lb"); b.disabled = true; b.textContent = "Signing in…";
    try {
      const u = await rpc("uw_login", { p_email: em.value, p_password: pw.value });
      if (!u) throw new Error("Invalid email or password");
      user = u; sessionStorage.setItem("uw_user", JSON.stringify(u)); location.hash = "#/" + (JSON.parse(localStorage.getItem("uw_prefs") || "{}").landing || "dashboard"); route();
    } catch (er) { document.getElementById("le").textContent = er.message; b.disabled = false; b.textContent = "Login"; }
  };
}
let badgeState = { n: 0, crit: 0 };
async function refreshBadge() {
  try { const r = await api("uw_alerts?select=severity,status&status=neq.resolved"); badgeState = { n: r.length, crit: r.filter(a => a.severity === "critical").length }; const b = document.getElementById("nb"); if (b) { b.textContent = badgeState.n; b.style.display = badgeState.n ? "" : "none"; b.classList.toggle("crit", badgeState.crit > 0); } } catch (_) { /* ignore */ }
}
function shell(active, inner, top = "") {
  const ini = user.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const nav = [["dashboard", "Dashboard", "▦"], ["claims", "Claims", "▤"], ["queue", "My Queue", "☰"], ["alerts", "My Alerts", "🔔"], ["reports", "Reports", "◔"], ["settings", "Settings", "⚙"]]
    .map(([k, l, i]) => `<a href="#/${k}" class="${active === k ? "on" : ""}">${i}&nbsp; ${l}${k === "alerts" ? `<span class="nbadge ${badgeState.crit ? "crit" : ""}" id="nb" style="${badgeState.n ? "" : "display:none"}">${badgeState.n}</span>` : ""}</a>`).join("");
  $app.innerHTML = `<div class="shell"><aside class="side"><div class="brand">${LOGO(36)}<div class="wm"><span><b>Claim</b><em>Assist</em></span><small>Claims intelligence</small></div></div><nav class="nav">${nav}</nav>
    <div class="me"><div class="av">${ini}</div><div><b>${esc(user.name)}</b><small>${esc(user.role)}</small></div><button title="Sign out" id="so">⏻</button></div></aside>
    <main class="main">${top}${inner}</main></div>`;
  refreshBadge();
  document.getElementById("so").onclick = () => { sessionStorage.removeItem("uw_user"); user = null; location.hash = ""; renderLogin(); };
}

// ---------- list / dashboard ----------
let F = { status: "All Status", period: "90", q: "", card: null };
const fmtN = n => n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n || 0);
const fmtS = ms => ms ? (ms / 1000).toFixed(1) + "s" : "—";
function fleetHtml() {
  const by = Object.fromEntries(STATS.map(x => [x.agent_key, x])), wf = by.workflow || {}, ag = AGENTS;
  const sum = k => ag.reduce((t, g) => t + (by[g.key]?.[k] || 0), 0);
  const tin = sum("tokens_in"), tout = sum("tokens_out"), online = ag.filter(g => by[g.key]?.status === "Online").length;
  const okr = sum("runs") ? Math.round(sum("successful_runs") / sum("runs") * 100) : 0;
  const upd = STATS.reduce((m, x) => x.updated_at > m ? x.updated_at : m, "");
  const tiles = [["Agents online", `${online} / ${ag.length}`, "all healthy"], ["Claims analysed", wf.runs || 0, "workflow runs"], ["Tokens consumed", fmtN(tin + tout), `${fmtN(tin)} in · ${fmtN(tout)} out`],
    ["Avg time per claim", fmtS(wf.avg_latency_ms), "5 agents, end to end"], ["Success rate", okr + "%", `${sum("runs")} agent runs`]];
  const cards = ag.map(g => {
    const x = by[g.key] || {}, rate = x.runs ? Math.round(x.successful_runs / x.runs * 100) : 0, tk = (x.tokens_in || 0) + (x.tokens_out || 0);
    const st = [["Runs executed", x.runs || 0], ["Success rate", rate + "%"], ["Avg latency", fmtS(x.avg_latency_ms)], ["P95 latency", fmtS(x.p95_latency_ms)],
      ["Tokens used", fmtN(tk)], ["Avg tokens / run", fmtN(x.runs ? Math.round(tk / x.runs) : 0)], ["LLM calls", x.llm_calls || 0], ["Tool calls", x.tool_calls || 0]];
    return `<div class="agent" style="--ac:${g.color}"><div class="ah"><img class="aico" alt="" src="${svgUri(g.avatar_svg)}"><div style="flex:1"><b>${esc(g.name)}</b><small>${esc(g.role)}</small></div><span class="online"><i></i>${esc(x.status || "Offline")}</span></div>
      <p class="atag">${esc(g.tagline)}</p><ul class="scope">${g.scope.slice(0, 2).map(t => `<li>${esc(t)}</li>`).join("")}</ul>
      <div class="astats">${st.map(([l, v]) => `<div><small>${l}</small><b>${v}</b></div>`).join("")}</div>
      <div class="afoot"><small>Model ${esc(x.model || g.model)}</small><small>Last run ${x.last_run_at ? fdt(x.last_run_at) : "—"}</small></div></div>`;
  }).join("");
  return `<div class="card" style="margin-bottom:16px"><div class="toolbar"><h3>AI Agent Team</h3><small style="color:var(--mut)">Live from Kore Agent Platform runs · updated ${fdt(upd)}</small></div>
    <div class="tiles five">${tiles.map(([l, v, sub]) => `<div class="tile"><small>${l}</small><b>${v}</b><small>${sub}</small></div>`).join("")}</div></div><div class="agents three">${cards}</div>`;
}
async function renderList(mode) {
  shell(mode, `<div class="spin">Loading claims…</div>`);
  const all = await loadClaims(true);
  if (mode === "dashboard") { if (!AGENTS) AGENTS = await api("uw_ai_agents?select=*&order=sort_order"); STATS = await api("uw_agent_stats?select=*"); }
  draw();
  function draw() {
    let rows = all;
    if (mode === "queue") rows = rows.filter(c => (c.assigned_to === user.id || c.status === "New") && ["New", "Pending Underwriting", "In Review", "Pending Garage Estimate", "Approved", "Pending Documents"].includes(c.status));
    const cnt = s => all.filter(c => Array.isArray(s) ? s.includes(c.status) : c.status === s).length;
    const days = F.period === "all" ? 99999 : +F.period;
    const cutoff = Date.now() - days * 864e5;
    let list = rows.filter(c => new Date(c.reported_on) >= cutoff);
    if (F.status !== "All Status") list = list.filter(c => c.status === F.status);
    if (F.q) { const q = F.q.toLowerCase(); list = list.filter(c => [c.claim_no, c.policy_no, c.insured_name, c.make_model, c.reg_no].join(" ").toLowerCase().includes(q)); }
    const titles = { dashboard: ["Claims Dashboard", "Claim KPIs and the AI agent team processing them"], claims: ["All Claims", "Browse every claim in the system"], queue: ["My Queue", "Claims assigned to you that need action"] };
    const top = `<div class="top"><div><h2>${titles[mode][0]}</h2><p>${titles[mode][1]}</p></div><input class="search" id="q" placeholder="🔍 Search by claim number, policy no, vehicle no…" value="${esc(F.q)}"></div>`;
    const cards = mode === "dashboard" ? `<div class="stats">
      ${[["Total Claims", all.length, null, ""], ["New", cnt("New"), "New", "color:#0284c7"], ["Pending Underwriting", cnt("Pending Underwriting"), "Pending Underwriting", "color:var(--amber)"], ["In Review", cnt("In Review"), "In Review", "color:var(--blue)"],
         ["Approved", cnt(["Approved", "Closed"]), "Approved", "color:var(--green)"], ["Rejected", cnt("Rejected"), "Rejected", "color:var(--red)"]]
        .map(([l, n, s, st]) => `<div class="card stat ${F.status === s && s ? "on" : ""}" data-s="${s || ""}"><small>${l}</small><b style="${st}">${n}</b></div>`).join("")}</div>` : "";
    const statuses = ["All Status", "New", "Pending Underwriting", "In Review", "Pending Documents", "Pending Garage Estimate", "Approved", "Rejected", "Closed"];
    shell(mode, `${cards}${mode === "dashboard" ? fleetHtml() : `<div class="card"><div class="toolbar"><h3>Claims List <small style="color:var(--mut);font-weight:400">(${list.length})</small></h3>
      <select id="fs">${statuses.map(s => `<option ${s === F.status ? "selected" : ""}>${s}</option>`).join("")}</select>
      <select id="fp">${[["30", "Last 30 days"], ["60", "Last 60 days"], ["90", "Last 90 days"], ["all", "All time"]].map(([v, l]) => `<option value="${v}" ${v === F.period ? "selected" : ""}>${l}</option>`).join("")}</select>
      <button class="btn ghost sm" id="ex">⤓ Export</button></div>
      <div class="tablewrap"><table><thead><tr><th>Claim No.</th><th>Policy No.</th><th>Insured Name</th><th>Vehicle</th><th>Loss Date</th><th>Status</th><th>Action</th></tr></thead><tbody>
      ${list.map(c => `<tr class="row" data-id="${c.id}"><td><b>${c.claim_no}</b></td><td>${c.policy_no}</td><td>${esc(c.insured_name)}</td><td>${esc(c.make_model)}</td><td>${fdate(c.loss_date)}</td><td>${badge(c.status)}</td><td><a href="#/claim/${c.id}">View</a></td></tr>`).join("") || `<tr><td colspan="7" class="empty">No claims match the filters.</td></tr>`}
      </tbody></table></div></div>`}`, top);
    const q = document.getElementById("q"); if (mode !== "dashboard") q.oninput = () => { F.q = q.value; const p = q.selectionStart; draw(); const n = document.getElementById("q"); n.focus(); n.setSelectionRange(p, p); };
    document.querySelectorAll(".stat").forEach(el => el.onclick = () => { F.status = el.dataset.s || "All Status"; if (mode === "dashboard") go("/claims"); else draw(); });
    if (mode === "dashboard") { q.onkeydown = e => { if (e.key === "Enter") { F.q = q.value; go("/claims"); } }; return; }
    document.getElementById("fs").onchange = e => { F.status = e.target.value; draw(); };
    document.getElementById("fp").onchange = e => { F.period = e.target.value; draw(); };
    document.querySelectorAll("tr.row").forEach(el => el.onclick = () => go("/claim/" + el.dataset.id));
    document.getElementById("ex").onclick = () => {
      const csv = [["Claim No", "Policy No", "Insured", "Vehicle", "Loss Date", "Status"], ...list.map(c => [c.claim_no, c.policy_no, c.insured_name, c.make_model, c.loss_date, c.status])].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      download("claims.csv", "text/csv", csv);
    };
  }
}
function download(name, mime, content) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type: mime })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- reports / settings ----------
async function renderAlerts(id) {
  shell("alerts", `<div id="al-root"></div>`);
  await Alerts.mount(document.getElementById("al-root"), { id, api, rpc, user, toast, go, claims: () => loadClaims(), badge: refreshBadge });
}
async function renderReports(tab) {
  shell("reports", `<div class="spin">Loading reports…</div>`);
  const D = await Reports.load(api);
  shell("reports", `<div id="rp-root"></div>`);
  Reports.mount(document.getElementById("rp-root"), D, go, tab);
}
async function renderSettings(tab) {
  shell("settings", `<div id="st-root"></div>`);
  if (!AGENTS) AGENTS = await api("uw_ai_agents?select=*&order=sort_order");
  const ag = k => AGENTS.find(x => x.key === k);
  await Settings.mount(document.getElementById("st-root"), { tab, api, rpc, user, toast, claims: () => loadClaims(), avatar: k => svgUri(ag(k).avatar_svg), role: k => ag(k).role });
}
// ---------- claim details ----------
const TABS = [["overview", "Overview"], ["vehicle", "Vehicle"], ["documents", "Documents & Images"], ["ai", "AI Analysis"], ["decision", "Underwriting Decision"], ["garage", "Garage Estimate"], ["timeline", "Timeline"]];
async function fetchDetail(id) {
  if (!AGENTS) AGENTS = await api("uw_ai_agents?select=*&order=sort_order");
  const [c, docs, ai, dec, gar, pay, tl, runs] = await Promise.all([
    api(`uw_claims?id=eq.${id}&select=*`), api(`uw_claim_documents?claim_id=eq.${id}&select=*&order=sort_order`),
    api(`uw_ai_analysis?claim_id=eq.${id}&select=*`), api(`uw_decisions?claim_id=eq.${id}&select=*`),
    api(`uw_garage_estimates?claim_id=eq.${id}&select=*&order=sort_order`), api(`uw_payments?claim_id=eq.${id}&select=*`),
    api(`uw_timeline?claim_id=eq.${id}&select=*&order=step_no`), api(`uw_ai_agent_runs?claim_id=eq.${id}&select=*`)]);
  if (!c[0]) throw new Error("Claim not found");
  return detailCache[id] = { c: c[0], docs, ai: ai[0], dec: dec[0], gar, pay: pay[0], tl, runs };
}
async function renderClaim(id, tab) {
  shell("claims", `<div class="spin">Loading claim…</div>`);
  let d = await fetchDetail(id);
  if (d.c.status === "New") { try { await rpc("uw_open_claim", { p_claim: id, p_user: user.id }); claims = null; delete detailCache[id]; d = await fetchDetail(id); toast("New claim opened - status moved to In Review"); refreshBadge(); } catch (_) { /* keep New */ } }
  const c = d.c;
  const head = `<button class="back" id="bk">← Claim Details</button>
    <div class="head"><h2>${c.claim_no}</h2>${badge(c.status)}<button class="btn ghost sm" style="margin-left:auto" id="sh">⤴ Share</button></div>
    <div class="meta"><span>Policy No: <b>${c.policy_no}</b></span><span>Insured: <b>${esc(c.insured_name)}</b></span><span>Loss Date: <b>${fdate(c.loss_date)}</b></span><span>Reported On: <b>${fdate(c.reported_on)}</b></span></div>
    <div class="tabs">${TABS.map(([k, l]) => `<button data-t="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const body = { overview, vehicle, documents, ai: aiTab, decision, garage, timeline }[tab] || overview;
  shell("claims", head + `<div id="tb">${body(d)}</div>`);
  document.getElementById("bk").onclick = () => go("/dashboard");
  document.getElementById("sh").onclick = () => { navigator.clipboard?.writeText(location.href); toast("Claim link copied"); };
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => go(`/claim/${id}/${b.dataset.t}`));
  bind(tab, d);
}
const dl = rows => `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v == null || v === "" ? "—" : v}</dd>`).join("")}</dl>`;
function carThumb(d) { const i = d.docs.find(x => x.kind === "image" && x.file_name === "vehicle_1.jpg") || d.docs.find(x => x.kind === "image" && x.storage_path); return i ? `<img src="${imgSrc(i)}" style="width:100%;border-radius:8px">` : ""; }
function overview(d) {
  const c = d.c;
  return `<div class="grid2"><div class="card"><h4>Claim Information</h4>${dl([["Claim Type", esc(c.claim_type)], ["Accident Type", esc(c.accident_type)], ["Location", esc(c.location)], ["Description", esc(c.description)], ["Loss time", esc(c.loss_time)], ["Injuries", c.injuries ? "Yes" : "No"], ["Police report", esc(c.police_report_no)], ["Claimed amount", money(c.claimed_amount)], ["Assigned garage", esc(c.garage_name)], ["Submitted via", c.source === "customer" ? "Customer portal (ClaimAssist)" : "Back office"]])}</div>
  <div class="card"><h4>Vehicle Information</h4><div class="grid2" style="grid-template-columns:150px 1fr">${carThumb(d)}${dl([["Make / Model", esc(c.make_model)], ["Reg No", esc(c.reg_no)], ["Year", c.vehicle_year], ["VIN", esc(c.vin)], ["Color", esc(c.color)]])}</div></div>
  <div class="card"><h4>Insured &amp; Policy</h4>${dl([["Insured", esc(c.insured_name)], ["Phone", esc(c.insured_phone)], ["Email", esc(c.insured_email)], ["Policy No", c.policy_no], ["Policy period", `${fdate(c.policy_start)} → ${fdate(c.policy_end)}`], ["Sum insured", money(c.sum_insured)], ["Deductible", money(c.deductible)]])}</div></div>`;
}
function vehicle(d) { const c = d.c; return `<div class="grid2"><div class="card">${carThumb(d)}</div><div class="card"><h4>${esc(c.make_model)}</h4>${dl([["Reg No", esc(c.reg_no)], ["Year", c.vehicle_year], ["VIN", esc(c.vin)], ["Color", esc(c.color)], ["Damage area", esc(c.damage_area)], ["Registered owner", esc(c.insured_name)]])}</div></div>`; }
function documents(d) {
  const imgs = d.docs.filter(x => x.kind === "image"), docs = d.docs.filter(x => x.kind === "document");
  return `<div class="card" style="margin-bottom:16px"><h4>Images</h4><p style="color:var(--mut);font-size:12px;margin:-6px 0 12px">${imgs.some(x => /^Uploaded/.test(x.credit || "")) ? "Photos uploaded by the customer through the ClaimAssist customer portal." : "Real photographs of this vehicle model from Wikimedia Commons (credits shown on open). Plates replaced with sample Dubai plates; damage on the close-up and overview is simulated digitally."}</p><div class="gallery">${imgs.map((x, i) => `<figure data-i="${x.id}"><img loading="lazy" src="${imgSrc(x)}" alt=""><figcaption>${i + 1}. ${esc(x.title)}</figcaption></figure>`).join("")}</div></div>
  <div class="card"><h4>Documents</h4>${docs.map(x => `<div class="doc"><span class="ic">📄</span><div><b>${esc(x.title)}</b><small>Uploaded: ${fdate(x.uploaded_on)}${x.storage_path ? " · by customer" : ""}</small></div><div class="sp"><button class="btn ghost sm" data-v="${x.id}">View</button><button class="btn ghost sm" data-d="${x.id}">⤓ Download</button></div></div>`).join("") || `<div class="empty">No documents uploaded.</div>`}
  ${d.c.status === "Pending Documents" ? `<p style="color:var(--amber)">⚠ Registration certificate and driving license are still outstanding.</p>` : ""}</div>`;
}
const ICO = { ok: "✓", warn: "!", risk: "✕" };
function agentCard(g, run) {
  const r = run || { status: "Not run", findings: [], metrics: {} }, ico = ICO;
  return `<div class="agent" style="--ac:${g.color}"><div class="ah"><img class="aico" alt="" src="${svgUri(g.avatar_svg)}"><div style="flex:1"><b>${esc(g.name)}</b><small>${esc(g.role)}</small></div><span class="st st-${r.status.replace(/\s/g, "")}">${esc(r.status)}</span></div>
      <p class="atag">${esc(g.tagline)}</p><div class="alab">Scope</div><ul class="scope">${g.scope.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
      <div class="alab">Output</div><div class="ahead">${esc(r.headline || "—")}</div>
      <ul class="fl">${r.findings.map(f => `<li class="l-${f.level}"><i>${ico[f.level]}</i><span>${esc(f.text)}</span></li>`).join("") || `<li class="l-pend"><i>…</i><span>No output yet.</span></li>`}</ul>
      <div class="afoot">${r.confidence ? `<div class="conf"><span style="width:${r.confidence}%"></span></div><small>Confidence ${r.confidence}%</small>` : ""}<small>${r.duration_ms ? (r.duration_ms / 1000).toFixed(1) + "s · " : ""}${r.inputs ? esc(r.inputs) + " · " : ""}${esc(g.model)}</small></div></div>`;
}
const STEPLIST = [["DocuMind - document analysis", ["DocuMind_Document_Analyzer"]], ["VisionAssess - image analysis", ["VisionAssess_Image_Analyzer"]], ["FraudShield - fraud check", ["FraudShield_Fraud_Check"]], ["RepairIQ - repair cost", ["RepairIQ_Repair_Cost"]], ["Save agent findings", ["Save_DocuMind_result", "Save_VisionAssess_result", "Save_FraudShield_result", "Save_RepairIQ_result"]], ["Consolidate findings", ["Consolidate_agent_findings"]], ["UnderwriteIQ - recommendation", ["UnderwriteIQ_Underwriting_Advisor"]], ["Save recommendation", ["Save_UnderwriteIQ_result"]]];
function progHtml(r, workerOk) {
  if (!r) return "";
  const done = r.status === "completed", failed = r.status === "failed", secs = Math.round(((r.finished_at ? new Date(r.finished_at) : Date.now()) - new Date(r.started_at || r.requested_at)) / 1000);
  const st = names => { const v = names.map(n => r.steps?.[n]); return v.every(x => x === "completed") ? "done" : v.some(x => x === "running" || x === "completed") ? "run" : "wait"; };
  const head = r.status === "queued" ? `<b>Request queued</b><small>${workerOk === false ? "The Kore bridge worker is offline - start it with <code>node ~/cto-workspace-build/ai-run-worker.mjs</code>" : "Waiting for the Kore bridge to start the workflow…"}</small>` : done ? `<b>✓ Completed on Kore Agent Platform</b><small>Execution ${esc((r.execution_id || "").slice(0, 8))} · ${secs}s</small>` : failed ? `<b style="color:var(--red)">Run failed</b><small>${esc(r.error || "")}</small>` : `<b>Running on Kore Agent Platform…</b><small>Execution ${esc((r.execution_id || "").slice(0, 8))} · ${secs}s</small>`;
  const res = done && r.result ? `<div class="tiles" style="margin-top:12px"><div class="tile"><small>Damage severity</small><b>${esc(r.result.damage_severity || "-")}</b></div><div class="tile"><small>Fraud risk</small><b>${esc(r.result.fraud_risk || "-")}</b></div><div class="tile"><small>Repair cost band</small><b>${money(r.result.repair_min)} - ${money(r.result.repair_max)}</b></div></div><p style="margin:10px 0 0"><b>Recommendation:</b> ${esc(r.result.recommendation || "-")}</p>` : "";
  return `<div class="card rprog"><div class="rph">${head}</div><ul class="rst">${STEPLIST.map(([l, n]) => { const x = done ? "done" : st(n); return `<li class="${x}"><i>${x === "done" ? "✓" : x === "run" ? "" : "○"}</i>${l}</li>`; }).join("")}</ul>${res}</div>`;
}
function runBar(d) {
  const has = d.runs.some(x => x.agent_key !== "uw");
  return `<div class="card runbar"><div><b>${has ? "Re-run the AI agents" : "Run the AI agents"}</b><small>Starts the Claim AI Analysis workflow on Kore Agent Platform - DocuMind, VisionAssess, FraudShield and RepairIQ run in parallel, then UnderwriteIQ recommends the decision. Results appear here when it finishes.</small></div><button class="btn" id="runai">${has ? "↻ Re-run AI agents" : "▶ Run AI agents"}</button></div><div id="runprog"></div>`;
}
function bindRun(d) {
  const id = d.c.id, btn = document.getElementById("runai"), box = document.getElementById("runprog"); if (!btn) return;
  let timer = null, wk = null;
  const poll = async () => {
    if (!document.getElementById("runai")) { clearInterval(timer); return; }
    const r = await rpc("uw_ai_run_status", { p_claim: id }); if (!r) return;
    if (r.status === "queued" && Date.now() - new Date(r.requested_at) > 15000 && wk === null) { try { const w = await api("uw_agent_stats?agent_key=eq.worker&select=updated_at"); wk = !!w[0] && Date.now() - new Date(w[0].updated_at) < 30000; } catch (_) { wk = false; } }
    box.innerHTML = progHtml(r, r.status === "queued" ? wk : true);
    if (r.status === "completed") { clearInterval(timer); toast("AI agents finished - results updated"); delete detailCache[id]; claims = null; refreshBadge(); setTimeout(() => renderClaim(id, "ai"), 1500); }
    else if (r.status === "failed") { clearInterval(timer); btn.disabled = false; btn.textContent = "↻ Retry"; }
  };
  const start = () => { btn.disabled = true; btn.textContent = "Running…"; wk = null; clearInterval(timer); timer = setInterval(poll, 2000); poll(); };
  btn.onclick = async () => { try { const r = await rpc("uw_request_ai_run", { p_claim: id, p_user: user.name }); if (r.error) throw new Error(r.error); start(); } catch (e) { toast(e.message); } };
  rpc("uw_ai_run_status", { p_claim: id }).then(r => { if (r && ["queued", "running"].includes(r.status) && Date.now() - new Date(r.requested_at) < 600000) start(); });
}
function aiTab(d) {
  const a = d.runs.some(x => x.agent_key !== "uw") ? d.ai : null, by = Object.fromEntries(d.runs.map(r => [r.agent_key, r]));
  const ico = { ok: "✓", warn: "!", risk: "✕" };
  const cards = AGENTS.filter(g => g.key !== "uw").map(g => agentCard(g, by[g.key])).join("");
  const banner = `<div class="ai-banner"><b>AI Document &amp; Image Analysis</b><br><small>Four specialised AI agents analyse the claim documents and images to detect damage, estimate repair cost and identify potential fraud indicators. Each agent's output is mapped into the consolidated findings below.</small></div>${runBar(d)}<div class="agents">${cards}</div>`;
  if (!a) return banner + `<div class="card empty">Consolidated analysis is not available yet - run the AI agents above to generate it.</div>`;
  const fr = by.fraud, rp = by.repair, im = by.img;
  const tag = k => { const g = AGENTS.find(x => x.key === k); return `<span class="chip" style="--ac:${g.color}"><img class="mini" alt="" src="${svgUri(g.avatar_svg)}">${esc(g.name)}</span>`; };
  const all = d.runs.filter(r => r.agent_key !== "uw").flatMap(r => r.findings.map(f => ({ ...f, k: r.agent_key })));
  return banner + `<h4 style="margin:6px 0 10px">Consolidated result</h4>
  <div class="tiles"><div class="tile"><small>Damage Severity ${tag("img")}</small><b class="t-${a.damage_severity}">${a.damage_severity}</b></div><div class="tile"><small>Estimated Repair Cost ${tag("repair")}</small><b>${money(a.repair_min)} – ${money(a.repair_max)}</b></div><div class="tile"><small>Fraud Risk ${tag("fraud")}</small><b class="t-${a.fraud_risk}">${a.fraud_risk}${fr?.metrics?.score != null ? ` <span style="font-size:13px;color:var(--mut)">(${fr.metrics.score}/100)</span>` : ""}</b></div></div>
  <div class="grid2"><div class="card"><h4>Key Findings</h4><ul class="fl big">${all.map(f => `<li class="l-${f.level}"><i>${ico[f.level]}</i><span>${esc(f.text)} ${tag(f.k)}</span></li>`).join("")}</ul></div>
  <div class="card"><h4>Damage Areas (AI Detection) ${tag("img")}</h4>${a.damage_areas.map(x => `<div style="padding:5px 0"><span class="dot dmg-${x.severity}"></span>${esc(x.name)} (${x.severity})</div>`).join("")}</div></div>`;
}
const ACTIONABLE = ["New", "Pending Underwriting", "In Review", "Pending Documents"];
function decision(d) {
  const a = d.runs.some(x => x.agent_key !== "uw") ? d.ai : null, c = d.c, rej = a && a.recommendation.startsWith("Reject");
  const rec = a ? `<div class="reco ${rej ? "rej" : ""}"><h3>${rej ? "✕" : "✔"} ${esc(a.recommendation)}</h3><small>${esc(a.recommendation_note)}</small></div>
    <div class="card" style="margin-bottom:14px"><h4>Recommended Actions</h4><ul class="ul ${rej ? "x" : ""}">${a.recommended_actions.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : `<div class="card empty" style="margin-bottom:14px">No AI recommendation yet (documents pending).</div>`;
  let form;
  if (d.dec) form = `<div class="card"><h4>Decision recorded</h4>${dl([["Decision", `<b>${esc(d.dec.decision)}</b>`], ["Comments", esc(d.dec.comments)], ["Decided on", fdt(d.dec.decided_at)]])}</div>`;
  else if (ACTIONABLE.includes(c.status)) form = `<div class="card"><h4>Underwriting Decision</h4><label style="font-size:12px;color:var(--mut)">Decision</label>
    <select id="dsel"><option value="approve" ${!rej && a ? "selected" : ""}>Approve claim</option><option value="reject" ${rej ? "selected" : ""}>Reject claim</option><option value="request_docs">Request more documents</option></select>
    <label style="font-size:12px;color:var(--mut);display:block;margin-top:12px">Comments</label><textarea id="dcm" placeholder="Add your comments (optional)…"></textarea>
    <button class="btn" style="width:100%;margin-top:12px" id="dsub">Submit Decision</button></div>`;
  else form = `<div class="card empty">No decision is required at this stage (status: ${esc(c.status)}).</div>`;
  const g = AGENTS.find(x => x.key === "uw"), ur = d.runs.find(x => x.agent_key === "uw");
  const mt = ur?.metrics || {};
  const stats = ur ? `<div class="tiles" style="margin-bottom:14px"><div class="tile"><small>Approval authority</small><b style="font-size:17px">${esc(mt.authority_level || "—")}</b></div><div class="tile"><small>Estimated payable (after deductible)</small><b style="font-size:17px">${Number(mt.estimated_payable_aed) > 0 ? money(mt.estimated_payable_aed) : "Not payable"}</b></div><div class="tile"><small>Agent confidence</small><b style="font-size:17px">${ur.confidence}%</b></div></div>` : "";
  return (g ? `<div class="ai-banner"><b>Underwriting Advisor - AI agent</b><br><small>UnderwriteIQ reads the four analysis agents' outputs and recommends the decision, conditions and actions below. The human underwriter makes the final decision.</small></div><div class="agents one">${agentCard(g, ur)}</div>${stats}` : "") + rec + form;
}
function garage(d) {
  const c = d.c, total = d.gar.reduce((s, x) => s + +x.estimated_cost, 0), net = Math.max(total - c.deductible, 0);
  let right;
  if (c.status === "Closed" && d.pay) right = `<div class="closed-card"><div class="tick">✔</div><h3>Claim Closed Successfully</h3><p style="color:var(--mut)">Claim ${c.claim_no} has been closed and payment has been released to the insured.</p>
    <div class="sumrow"><div><small>Final Amount Paid</small><b>${money(d.pay.amount)}</b></div><div><small>Payment Date</small><b>${fdate(d.pay.paid_on)}</b></div><div><small>Transaction Ref</small><b>${esc(d.pay.txn_ref)}</b></div></div>
    <button class="btn ghost" id="vt">View Timeline</button> <button class="btn" id="bl">Back to Claims List</button></div>`;
  else if (c.status === "Approved") right = `<div class="final"><h4>Final Approval</h4><div style="color:var(--green);font-weight:600">✔ Claim Approved</div><div class="big">${money(net)}</div><small style="color:var(--mut)">Amount after ${money(c.deductible)} deductible</small><br><br><button class="btn" style="width:100%" id="rp">Release Payment</button></div>`;
  else if (c.status === "Pending Garage Estimate") right = `<div class="final"><h4>Final Approval</h4><p style="color:var(--mut)">Claim approved in principle. Waiting for the garage to submit the final repair estimate.</p><button class="btn" id="rg">Simulate garage estimate received</button></div>`;
  else right = `<div class="final"><h4>Final Approval</h4><p style="color:var(--mut)">Not available until the claim is approved (current status: ${esc(c.status)}).</p></div>`;
  const left = d.gar.length ? `<table class="estimate"><thead><tr><th>Item</th><th class="r">Estimated Cost (AED)</th><th>Status</th></tr></thead><tbody>
    ${d.gar.map(x => `<tr><td>${esc(x.item)}</td><td class="r">${money(x.estimated_cost)}</td><td><span class="${x.status === "Approved" ? "ok" : "pend"}">${x.status}</span></td></tr>`).join("")}
    <tr><td><b>Total</b></td><td class="r"><b>${money(total)}</b></td><td></td></tr><tr><td>Deductible</td><td class="r">− ${money(c.deductible)}</td><td></td></tr><tr><td><b>Net payable</b></td><td class="r"><b>${money(net)}</b></td><td></td></tr></tbody></table>
    <p style="color:var(--mut)">Garage: ${esc(c.garage_name)}</p>` : `<div class="empty">No garage estimate has been received yet.</div>`;
  return `<div class="grid2" style="grid-template-columns:1.4fr 1fr"><div class="card"><h4>Garage Estimate</h4>${left}</div><div class="card">${right}</div></div>`;
}
function timeline(d) {
  return `<div class="card"><div class="timeline">${d.tl.map(t => `<div class="tl ${t.state}"><div class="pt">${t.state === "done" ? "✓" : t.state === "skipped" ? "–" : t.state === "current" ? "●" : ""}</div><div><b>${esc(t.title)}</b><small>${t.occurred_at ? fdt(t.occurred_at) : t.state === "current" ? "In progress" : "Pending"}</small><small>${esc(t.description)}</small></div></div>`).join("")}</div></div>`;
}
function bind(tab, d) {
  const id = d.c.id;
  if (tab === "ai") bindRun(d);
  document.querySelectorAll("[data-i]").forEach(el => el.onclick = () => { const x = d.docs.find(y => y.id === el.dataset.i); modal(`<img src="${imgSrc(x)}"><p><b>${esc(x.title)}</b></p>${x.credit ? `<p style="color:var(--mut);font-size:12px">${esc(x.credit)}${/^Uploaded/.test(x.credit) ? "" : ". Plates replaced with sample plates."}</p>` : ""}`); });
  document.querySelectorAll("[data-v]").forEach(el => el.onclick = () => { const x = d.docs.find(y => y.id === el.dataset.v); if (x.storage_path) modal(/^image\//.test(x.mime) ? `<img src="${fileUrl(x)}"><p><b>${esc(x.title)}</b> · ${esc(x.file_name)}</p>` : `<iframe src="${fileUrl(x)}"></iframe>`); else modal(`<iframe sandbox srcdoc="${esc(x.content)}"></iframe>`); });
  document.querySelectorAll("[data-d]").forEach(el => el.onclick = () => { const x = d.docs.find(y => y.id === el.dataset.d); if (x.storage_path) window.open(fileUrl(x), "_blank"); else download(x.file_name, x.mime, x.content); });
  const act = (btn, fn, msg) => btn && (btn.onclick = async () => { btn.disabled = true; try { await fn(); toast(msg); claims = null; await renderClaim(id, btn.dataset.next || tab); } catch (e) { toast(e.message); btn.disabled = false; } });
  act(document.getElementById("dsub"), () => rpc("uw_submit_decision", { p_claim: id, p_decision: dsel.value, p_comments: dcm.value, p_uw: user.id }), "Decision submitted");
  act(document.getElementById("rg"), () => rpc("uw_receive_garage_estimate", { p_claim: id }), "Garage estimate received");
  act(document.getElementById("rp"), () => rpc("uw_release_payment", { p_claim: id, p_uw: user.id }), "Payment released — claim closed");
  const vt = document.getElementById("vt"); if (vt) vt.onclick = () => go(`/claim/${id}/timeline`);
  const bl = document.getElementById("bl"); if (bl) bl.onclick = () => go("/dashboard");
}
function modal(html) {
  const m = document.createElement("div"); m.className = "modal"; m.innerHTML = `<div class="box">${html}</div>`;
  m.onclick = e => { if (e.target === m) m.remove(); }; document.body.appendChild(m);
}

if (JSON.parse(localStorage.getItem("uw_prefs") || "{}").density === "compact") document.body.classList.add("compact");
route();
})();
