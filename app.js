(() => {
const { SUPABASE_URL: URL_, SUPABASE_ANON_KEY: KEY } = window.CONFIG;
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };
const $app = document.getElementById("app");
let user = JSON.parse(sessionStorage.getItem("uw_user") || "null");
let claims = null;            // cached list
const detailCache = {};
let AGENTS = null;

// ---------- helpers ----------
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => "AED " + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fdate = d => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-") : "—";
const fdt = d => d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(/(\d{4}),/, "$1") : "";
const BADGE = { "Pending Underwriting": "b-pu", "In Review": "b-ir", "Approved": "b-ap", "Pending Documents": "b-pd", "Rejected": "b-rj", "Pending Garage Estimate": "b-pg", "Closed": "b-cl" };
const badge = s => `<span class="badge ${BADGE[s] || ""}">${esc(s)}</span>`;
const toast = m => { const t = document.getElementById("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2600); };
const imgSrc = x => x.storage_path ? `${URL_}/storage/v1/object/public/claim-photos/${x.storage_path}` : svgUri(x.content);
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
    if (page === "reports") return await renderReports();
    if (page === "settings") return renderSettings();
    return await renderList("dashboard");
  } catch (e) { shell("", `<div class="card empty">Failed to load: ${esc(e.message)}</div>`); }
}

// ---------- shell / login ----------
function renderLogin() {
  $app.innerHTML = `<div class="login-wrap"><form class="login-card" id="lf">
    <div class="logo">☂️🚗</div><h1>Auto Insurance</h1><div class="sub">Claim Underwriter Portal</div>
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
      user = u; sessionStorage.setItem("uw_user", JSON.stringify(u)); location.hash = "#/dashboard"; route();
    } catch (er) { document.getElementById("le").textContent = er.message; b.disabled = false; b.textContent = "Login"; }
  };
}
function shell(active, inner, top = "") {
  const ini = user.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const nav = [["dashboard", "Dashboard", "▦"], ["claims", "Claims", "▤"], ["queue", "My Queue", "☰"], ["reports", "Reports", "◔"], ["settings", "Settings", "⚙"]]
    .map(([k, l, i]) => `<a href="#/${k}" class="${active === k ? "on" : ""}">${i}&nbsp; ${l}</a>`).join("");
  $app.innerHTML = `<div class="shell"><aside class="side"><div class="brand"><i>☂️</i> Auto Insurance</div><nav class="nav">${nav}</nav>
    <div class="me"><div class="av">${ini}</div><div><b>${esc(user.name)}</b><small>${esc(user.role)}</small></div><button title="Sign out" id="so">⏻</button></div></aside>
    <main class="main">${top}${inner}</main></div>`;
  document.getElementById("so").onclick = () => { sessionStorage.removeItem("uw_user"); user = null; location.hash = ""; renderLogin(); };
}

// ---------- list / dashboard ----------
let F = { status: "All Status", period: "90", q: "", card: null };
async function renderList(mode) {
  shell(mode, `<div class="spin">Loading claims…</div>`);
  const all = await loadClaims(true);
  draw();
  function draw() {
    let rows = all;
    if (mode === "queue") rows = rows.filter(c => c.assigned_to === user.id && ["Pending Underwriting", "In Review", "Pending Garage Estimate", "Approved", "Pending Documents"].includes(c.status));
    const cnt = s => all.filter(c => Array.isArray(s) ? s.includes(c.status) : c.status === s).length;
    const days = F.period === "all" ? 99999 : +F.period;
    const cutoff = Date.now() - days * 864e5;
    let list = rows.filter(c => new Date(c.reported_on) >= cutoff);
    if (F.status !== "All Status") list = list.filter(c => c.status === F.status);
    if (F.q) { const q = F.q.toLowerCase(); list = list.filter(c => [c.claim_no, c.policy_no, c.insured_name, c.make_model, c.reg_no].join(" ").toLowerCase().includes(q)); }
    const titles = { dashboard: ["Claims Dashboard", "View and manage all assigned claims"], claims: ["All Claims", "Browse every claim in the system"], queue: ["My Queue", "Claims assigned to you that need action"] };
    const top = `<div class="top"><div><h2>${titles[mode][0]}</h2><p>${titles[mode][1]}</p></div><input class="search" id="q" placeholder="🔍 Search by claim number, policy no, vehicle no…" value="${esc(F.q)}"></div>`;
    const cards = mode === "dashboard" ? `<div class="stats">
      ${[["Total Claims", all.length, null, ""], ["Pending Underwriting", cnt("Pending Underwriting"), "Pending Underwriting", "color:var(--amber)"], ["In Review", cnt("In Review"), "In Review", "color:var(--blue)"],
         ["Approved", cnt(["Approved", "Closed"]), "Approved", "color:var(--green)"], ["Rejected", cnt("Rejected"), "Rejected", "color:var(--red)"]]
        .map(([l, n, s, st]) => `<div class="card stat ${F.status === s && s ? "on" : ""}" data-s="${s || ""}"><small>${l}</small><b style="${st}">${n}</b></div>`).join("")}</div>` : "";
    const statuses = ["All Status", "Pending Underwriting", "In Review", "Pending Documents", "Pending Garage Estimate", "Approved", "Rejected", "Closed"];
    shell(mode, `${cards}<div class="card"><div class="toolbar"><h3>Claims List <small style="color:var(--mut);font-weight:400">(${list.length})</small></h3>
      <select id="fs">${statuses.map(s => `<option ${s === F.status ? "selected" : ""}>${s}</option>`).join("")}</select>
      <select id="fp">${[["30", "Last 30 days"], ["60", "Last 60 days"], ["90", "Last 90 days"], ["all", "All time"]].map(([v, l]) => `<option value="${v}" ${v === F.period ? "selected" : ""}>${l}</option>`).join("")}</select>
      <button class="btn ghost sm" id="ex">⤓ Export</button></div>
      <div class="tablewrap"><table><thead><tr><th>Claim No.</th><th>Policy No.</th><th>Insured Name</th><th>Vehicle</th><th>Loss Date</th><th>Status</th><th>Action</th></tr></thead><tbody>
      ${list.map(c => `<tr class="row" data-id="${c.id}"><td><b>${c.claim_no}</b></td><td>${c.policy_no}</td><td>${esc(c.insured_name)}</td><td>${esc(c.make_model)}</td><td>${fdate(c.loss_date)}</td><td>${badge(c.status)}</td><td><a href="#/claim/${c.id}">View</a></td></tr>`).join("") || `<tr><td colspan="7" class="empty">No claims match the filters.</td></tr>`}
      </tbody></table></div></div>`, top);
    const q = document.getElementById("q"); q.oninput = () => { F.q = q.value; const p = q.selectionStart; draw(); const n = document.getElementById("q"); n.focus(); n.setSelectionRange(p, p); };
    document.getElementById("fs").onchange = e => { F.status = e.target.value; draw(); };
    document.getElementById("fp").onchange = e => { F.period = e.target.value; draw(); };
    document.querySelectorAll(".stat").forEach(el => el.onclick = () => { F.status = el.dataset.s || "All Status"; draw(); });
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
async function renderReports() {
  shell("reports", `<div class="spin">Loading…</div>`);
  const all = await loadClaims(true);
  const ai = await api("uw_ai_analysis?select=claim_id,damage_severity,fraud_risk,repair_min,repair_max");
  const pays = await api("uw_payments?select=amount");
  const by = (arr, k) => arr.reduce((m, x) => (m[x[k]] = (m[x[k]] || 0) + 1, m), {});
  const bars = (obj, max) => Object.entries(obj).map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><div class="fill" style="width:${Math.max(4, v / max * 320)}px"></div><b>${v}</b></div>`).join("");
  const st = by(all, "status"), sev = by(ai, "damage_severity"), fr = by(ai, "fraud_risk");
  shell("reports", `<div class="grid2"><div class="card bars"><h4>Claims by status</h4>${bars(st, Math.max(...Object.values(st)))}</div>
    <div class="card bars"><h4>AI damage severity</h4>${bars(sev, Math.max(...Object.values(sev)))}<h4 style="margin-top:20px">Fraud risk</h4>${bars(fr, Math.max(...Object.values(fr)))}</div></div>
    <div class="stats" style="margin-top:16px;grid-template-columns:repeat(3,1fr)"><div class="card"><small>Total claims</small><b style="font-size:28px;display:block">${all.length}</b></div>
    <div class="card"><small>Payments released</small><b style="font-size:28px;display:block">${pays.length}</b></div><div class="card"><small>Total paid out</small><b style="font-size:28px;display:block">${money(pays.reduce((s, p) => s + +p.amount, 0))}</b></div></div>`,
    `<div class="top"><div><h2>Reports</h2><p>Portfolio summary from live Supabase data</p></div></div>`);
}
function renderSettings() {
  shell("settings", `<div class="card"><dl class="kv"><dt>Name</dt><dd>${esc(user.name)}</dd><dt>Email</dt><dd>${esc(user.email)}</dd><dt>Role</dt><dd>${esc(user.role)}</dd><dt>Data source</dt><dd>Supabase (${esc(URL_)})</dd></dl></div>`,
    `<div class="top"><div><h2>Settings</h2><p>Your profile</p></div></div>`);
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
  const d = await fetchDetail(id); const c = d.c;
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
function carThumb(d) { const i = d.docs.find(x => x.kind === "image" && x.file_name === "vehicle_1.jpg"); return i ? `<img src="${imgSrc(i)}" style="width:100%;border-radius:8px">` : ""; }
function overview(d) {
  const c = d.c;
  return `<div class="grid2"><div class="card"><h4>Claim Information</h4>${dl([["Claim Type", esc(c.claim_type)], ["Accident Type", esc(c.accident_type)], ["Location", esc(c.location)], ["Description", esc(c.description)], ["Police report", esc(c.police_report_no)], ["Claimed amount", money(c.claimed_amount)], ["Assigned garage", esc(c.garage_name)]])}</div>
  <div class="card"><h4>Vehicle Information</h4><div class="grid2" style="grid-template-columns:150px 1fr">${carThumb(d)}${dl([["Make / Model", esc(c.make_model)], ["Reg No", esc(c.reg_no)], ["Year", c.vehicle_year], ["VIN", esc(c.vin)], ["Color", esc(c.color)]])}</div></div>
  <div class="card"><h4>Insured &amp; Policy</h4>${dl([["Insured", esc(c.insured_name)], ["Phone", esc(c.insured_phone)], ["Email", esc(c.insured_email)], ["Policy No", c.policy_no], ["Policy period", `${fdate(c.policy_start)} → ${fdate(c.policy_end)}`], ["Sum insured", money(c.sum_insured)], ["Deductible", money(c.deductible)]])}</div></div>`;
}
function vehicle(d) { const c = d.c; return `<div class="grid2"><div class="card">${carThumb(d)}</div><div class="card"><h4>${esc(c.make_model)}</h4>${dl([["Reg No", esc(c.reg_no)], ["Year", c.vehicle_year], ["VIN", esc(c.vin)], ["Color", esc(c.color)], ["Damage area", esc(c.damage_area)], ["Registered owner", esc(c.insured_name)]])}</div></div>`; }
function documents(d) {
  const imgs = d.docs.filter(x => x.kind === "image"), docs = d.docs.filter(x => x.kind === "document");
  return `<div class="card" style="margin-bottom:16px"><h4>Images</h4><p style="color:var(--mut);font-size:12px;margin:-6px 0 12px">Real photographs of this vehicle model from Wikimedia Commons (credits shown on open). Plates replaced with sample Dubai plates; damage on the close-up and overview is simulated digitally.</p><div class="gallery">${imgs.map((x, i) => `<figure data-i="${x.id}"><img loading="lazy" src="${imgSrc(x)}" alt=""><figcaption>${i + 1}. ${esc(x.title)}</figcaption></figure>`).join("")}</div></div>
  <div class="card"><h4>Documents</h4>${docs.map(x => `<div class="doc"><span class="ic">📄</span><div><b>${esc(x.title)}</b><small>Uploaded: ${fdate(x.uploaded_on)}</small></div><div class="sp"><button class="btn ghost sm" data-v="${x.id}">View</button><button class="btn ghost sm" data-d="${x.id}">⤓ Download</button></div></div>`).join("") || `<div class="empty">No documents uploaded.</div>`}
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
function aiTab(d) {
  const a = d.ai, by = Object.fromEntries(d.runs.map(r => [r.agent_key, r]));
  const ico = { ok: "✓", warn: "!", risk: "✕" };
  const cards = AGENTS.filter(g => g.key !== "uw").map(g => agentCard(g, by[g.key])).join("");
  const banner = `<div class="ai-banner"><b>AI Document &amp; Image Analysis</b><br><small>Four specialised AI agents analysed the claim documents and images to detect damage, estimate repair cost and identify potential fraud indicators. Each agent's output is mapped into the consolidated findings below.</small></div><div class="agents">${cards}</div>`;
  if (!a) return banner + `<div class="card empty">Consolidated analysis is not available yet — required documents are still pending.</div>`;
  const fr = by.fraud, rp = by.repair, im = by.img;
  const tag = k => { const g = AGENTS.find(x => x.key === k); return `<span class="chip" style="--ac:${g.color}"><img class="mini" alt="" src="${svgUri(g.avatar_svg)}">${esc(g.name)}</span>`; };
  const all = d.runs.filter(r => r.agent_key !== "uw").flatMap(r => r.findings.map(f => ({ ...f, k: r.agent_key })));
  return banner + `<h4 style="margin:6px 0 10px">Consolidated result</h4>
  <div class="tiles"><div class="tile"><small>Damage Severity ${tag("img")}</small><b class="t-${a.damage_severity}">${a.damage_severity}</b></div><div class="tile"><small>Estimated Repair Cost ${tag("repair")}</small><b>${money(a.repair_min)} – ${money(a.repair_max)}</b></div><div class="tile"><small>Fraud Risk ${tag("fraud")}</small><b class="t-${a.fraud_risk}">${a.fraud_risk}${fr?.metrics?.score != null ? ` <span style="font-size:13px;color:var(--mut)">(${fr.metrics.score}/100)</span>` : ""}</b></div></div>
  <div class="grid2"><div class="card"><h4>Key Findings</h4><ul class="fl big">${all.map(f => `<li class="l-${f.level}"><i>${ico[f.level]}</i><span>${esc(f.text)} ${tag(f.k)}</span></li>`).join("")}</ul></div>
  <div class="card"><h4>Damage Areas (AI Detection) ${tag("img")}</h4>${a.damage_areas.map(x => `<div style="padding:5px 0"><span class="dot dmg-${x.severity}"></span>${esc(x.name)} (${x.severity})</div>`).join("")}</div></div>`;
}
const ACTIONABLE = ["Pending Underwriting", "In Review", "Pending Documents"];
function decision(d) {
  const a = d.ai, c = d.c, rej = a && a.recommendation.startsWith("Reject");
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
  document.querySelectorAll("[data-i]").forEach(el => el.onclick = () => { const x = d.docs.find(y => y.id === el.dataset.i); modal(`<img src="${imgSrc(x)}"><p><b>${esc(x.title)}</b></p>${x.credit ? `<p style="color:var(--mut);font-size:12px">${esc(x.credit)}. Plates replaced with sample plates.</p>` : ""}`); });
  document.querySelectorAll("[data-v]").forEach(el => el.onclick = () => { const x = d.docs.find(y => y.id === el.dataset.v); modal(`<iframe sandbox srcdoc="${esc(x.content)}"></iframe>`); });
  document.querySelectorAll("[data-d]").forEach(el => el.onclick = () => { const x = d.docs.find(y => y.id === el.dataset.d); download(x.file_name, x.mime, x.content); });
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

route();
})();
