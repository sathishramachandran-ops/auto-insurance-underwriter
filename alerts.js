// My Alerts: generated from run telemetry, settings thresholds and claim data. Click an alert to drill into its data.
(() => {
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const aed = n => "AED " + Math.round(n || 0).toLocaleString("en-US");
const num = n => Math.round(n || 0).toLocaleString("en-US");
const ago = d => { const s = (Date.now() - new Date(d)) / 1000; return s < 90 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " d ago"; };
const SEV = { critical: ["#dc2626", "✕", "Critical"], warning: ["#d97706", "!", "Warning"], info: ["#2a78d6", "i", "Info"] };
const TYPE = { latency: ["⏱️", "Latency"], tokens: ["🪙", "Tokens"], runcap: ["📈", "Run cap"], failure: ["⚠️", "Agent failures"], confidence: ["🎯", "Confidence"], fraud: ["🛡️", "Fraud risk"], sla: ["⏳", "SLA"], authority: ["✅", "Approval"], garage: ["🔧", "Garage variance"], intake: ["📥", "New claims"] };
const AGN = { doc: "DocuMind", img: "VisionAssess", fraud: "FraudShield", repair: "RepairIQ", uw: "UnderwriteIQ" };
const tile = (l, v, sub = "") => `<div class="tile"><small>${l}</small><b style="font-size:19px">${v}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
const claimLink = (id, no, tab = "ai") => `<a href="#/claim/${id}/${tab}">${esc(no)}</a>`;
const tbl = (cols, rows) => `<div class="tablewrap"><table><thead><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${cols.length}" class="empty">No data</td></tr>`}</tbody></table></div>`;

function lineChart(pts, thr, label) {
  if (!pts.length) return `<div class="empty">No runs logged</div>`;
  const W = 560, h = 170, mx = Math.max(thr * 1.15, ...pts.map(p => p.y)) , X = i => 8 + i / Math.max(pts.length - 1, 1) * (W - 16), Y = v => h - 10 - v / mx * (h - 24);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(" ");
  return `<svg class="ch" viewBox="0 0 ${W} ${h + 22}" preserveAspectRatio="none"><line x1="0" y1="${h - 10}" x2="${W}" y2="${h - 10}" stroke="#d9dee8"/>
  <line x1="0" y1="${Y(thr)}" x2="${W}" y2="${Y(thr)}" stroke="#dc2626" stroke-dasharray="5 4"/><text x="${W - 4}" y="${Y(thr) - 5}" text-anchor="end" font-size="11" fill="#dc2626">threshold ${label(thr)}</text>
  <path d="${d}" fill="none" stroke="#2a78d6" stroke-width="1.8" stroke-linejoin="round"/>
  ${pts.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.y)}" r="${p.y > thr ? 3.5 : 2}" fill="${p.y > thr ? "#dc2626" : "#2a78d6"}" data-tip="${esc(p.tip)}"/>`).join("")}
  <text x="4" y="${h + 14}" font-size="10.5" fill="#6b7686">older</text><text x="${W - 4}" y="${h + 14}" text-anchor="end" font-size="10.5" fill="#6b7686">latest runs</text></svg>`;
}
function bars(items, fmt = num, color = "#2a78d6") { const m = Math.max(1, ...items.map(i => i.v)); return `<div class="hb">${items.map(i => `<div class="hr" data-tip="${esc(i.l)}: ${fmt(i.v)}"><span class="hl">${esc(i.l)}</span><span class="ht"><span class="hf" style="width:${i.v / m * 100}%;background:${i.c || color}"></span></span><b>${fmt(i.v)}</b></div>`).join("")}</div>`; }
function gauge(score, med, high) { return `<div class="gau"><span style="width:${med}%;background:#16a34a">Low</span><span style="width:${high - med}%;background:#d97706">Medium</span><span style="width:${100 - high}%;background:#dc2626">High</span><i style="left:${Math.min(score, 99)}%"></i></div><div style="text-align:center;margin-top:6px;font-weight:700">Score ${score}/100</div>`; }

async function mount(el, ctx) {
  const { api, rpc, user, toast, go } = ctx;
  const pre = window.__alertPreset || {}; window.__alertPreset = null; let alerts = [], sel = ctx.id || null, f = { status: pre.status || "open", sev: pre.sev || "all", type: pre.type || "all" }, cfgFraud = { medium_threshold: 30, high_threshold: 60 };
  const load = async (regen) => {
    if (regen) { try { await rpc("uw_generate_alerts", {}); } catch (_) { /* ignore */ } }
    alerts = await api("uw_alerts?select=*&order=created_at.desc");
    try { const s = await api("uw_settings?key=eq.fraud&select=value"); if (s[0]) cfgFraud = s[0].value; } catch (_) { /* default */ }
    const order = { critical: 0, warning: 1, info: 2 }; alerts.sort((a, b) => order[a.severity] - order[b.severity] || new Date(b.updated_at) - new Date(a.updated_at));
  };
  el.innerHTML = `<div class="spin">Evaluating alerts…</div>`; await load(true);
  const isOpen = a => a.status !== "resolved";
  const filtered = () => alerts.filter(a => (f.status === "all" || (f.status === "open" ? isOpen(a) : f.status === a.status)) && (f.sev === "all" || a.severity === f.sev) && (f.type === "all" || a.type === f.type));

  async function detail(a) {
    const d = a.detail || {}, m = a.metric || {}, back = k => `<a class="btn ghost sm" href="#/settings/${k}">⚙ Adjust threshold in Settings</a>`;
    if (a.type === "latency") {
      const log = await api(`uw_agent_run_log?agent_key=eq.${a.entity_key}&select=duration_ms,claim_no,started_at&order=started_at.desc&limit=120`); const pts = log.reverse().map(r => ({ y: r.duration_ms / 1000, tip: `${r.claim_no || "run"}: ${(r.duration_ms / 1000).toFixed(1)}s` }));
      return `<div class="tiles" style="grid-template-columns:repeat(4,1fr)">${tile("P95 latency", (d.p95_ms / 1000).toFixed(1) + "s")}${tile("Average", (d.avg_ms / 1000).toFixed(1) + "s")}${tile("Threshold", (m.threshold / 1000).toFixed(0) + "s")}${tile("Runs analysed", d.runs)}</div>
      <h4>Latency per run - ${AGN[a.entity_key]}</h4>${lineChart(pts, m.threshold / 1000, v => v.toFixed(0) + "s")}
      <h4 style="margin-top:14px">Slowest runs</h4>${tbl(["Claim", "Duration", "When"], (d.slowest || []).map(r => `<tr><td><b>${esc(r.claim_no || "-")}</b></td><td>${(r.duration_ms / 1000).toFixed(1)}s</td><td>${new Date(r.started_at).toLocaleString("en-GB")}</td></tr>`))}
      <div class="why"><b>Suggested actions</b><ul><li>Lower max tokens or reasoning iterations for ${AGN[a.entity_key]} to shorten runs.</li><li>Try the faster model (GPT-5.2-mini) for this agent.</li><li>Raise the P95 latency alert if this is acceptable.</li></ul>${back("limits")} <a class="btn ghost sm" href="#/settings/agents">Open agent settings</a></div>`;
    }
    if (a.type === "tokens" && a.entity_type === "agent") {
      const log = await api(`uw_agent_run_log?agent_key=eq.${a.entity_key}&select=tokens_in,tokens_out,claim_no&order=started_at.desc&limit=40`);
      return `<div class="tiles" style="grid-template-columns:repeat(4,1fr)">${tile("Used today", num(m.value))}${tile("Daily budget", num(m.threshold))}${tile("Budget used", m.pct + "%")}${tile("Avg per run", num(d.avg_tokens_per_run))}</div>
      <h4>Input vs output tokens today</h4>${bars([{ l: "Input tokens", v: d.tokens_in, c: "#2a78d6" }, { l: "Output tokens", v: d.tokens_out, c: "#eb6834" }])}
      <h4 style="margin-top:14px">Tokens per run (latest 40)</h4>${Charts.columns(log.reverse().slice(-20).map((r, i) => ({ label: String(i + 1), value: r.tokens_in + r.tokens_out })), { fmt: v => (v / 1000).toFixed(1) + "K", h: 140 })}
      <div class="why"><b>Suggested actions</b><ul><li>Raise the daily token budget for ${AGN[a.entity_key]} if this volume is expected.</li><li>Reduce max tokens per call or tighten the agent instructions.</li></ul><a class="btn ghost sm" href="#/settings/agents">Open agent settings</a> ${back("limits")}</div>`;
    }
    if (a.entity_key === "monthly") return `<div class="tiles" style="grid-template-columns:repeat(3,1fr)">${tile("Used this month", num(m.value))}${tile("Monthly budget", num(m.threshold))}${tile("Budget used", m.pct + "%")}</div><h4>Tokens by agent</h4>${bars(Object.entries(d.by_agent || {}).map(([k, v]) => ({ l: AGN[k] || k, v })))}<div class="why">${back("limits")}</div>`;
    if (a.entity_key === "claimcap") return `<div class="tiles" style="grid-template-columns:repeat(2,1fr)">${tile("Highest claim analysis", num(m.value) + " tokens")}${tile("Per-claim cap", num(m.threshold) + " tokens")}</div><h4>Claims over the cap</h4>${tbl(["Claim", "Tokens used"], (d.claims || []).map(c => `<tr><td><b>${esc(c.claim_no)}</b></td><td>${num(c.tokens)}</td></tr>`))}<div class="why">${back("limits")}</div>`;
    if (a.type === "runcap") return `<div class="tiles" style="grid-template-columns:repeat(3,1fr)">${tile("Workflow runs today", m.value)}${tile("Daily cap", m.threshold)}${tile("Cap used", m.pct + "%")}</div><h4>Runs by hour</h4>${Charts.columns((d.by_hour || []).map(h => ({ label: h.hour, value: h.runs })), { h: 140 })}<div class="why"><b>Suggested actions</b><ul><li>Raise the daily run cap in Settings, or batch analyses overnight.</li></ul>${back("limits")}</div>`;
    if (a.type === "failure" && a.entity_key === "doc") return `<h4>Claims with incomplete document analysis</h4>${tbl(["Claim", "Insured", "Result"], (d.claims || []).map(c => `<tr class="row" data-go="/claim/${esc(c.claim_no)}"><td><b>${esc(c.claim_no)}</b></td><td>${esc(c.insured)}</td><td>${esc(c.headline)}</td></tr>`))}<div class="why"><b>Suggested actions</b><ul><li>Request the missing documents from the customer.</li><li>Re-run the AI analysis once they are uploaded.</li></ul></div>`;
    if (a.type === "failure") return `<div class="tiles" style="grid-template-columns:repeat(3,1fr)">${tile("Failure rate", m.value + "%")}${tile("Failed runs", d.failed)}${tile("Total runs", d.runs)}</div><h4>Recent failures</h4>${tbl(["Claim", "Status", "When"], (d.recent_failures || []).map(r => `<tr><td><b>${esc(r.claim_no || "-")}</b></td><td>${esc(r.status)}</td><td>${new Date(r.started_at).toLocaleString("en-GB")}</td></tr>`))}<div class="why">${back("limits")}</div>`;
    if (a.type === "confidence") return `<div class="tiles" style="grid-template-columns:repeat(2,1fr)">${tile("Claims below threshold", m.value)}${tile("Minimum confidence", m.threshold + "%")}</div><h4>Claims to review</h4>${tbl(["Claim", "Confidence", "Agent result"], (d.claims || []).map(c => `<tr class="row" data-go="/claim/${esc(c.claim_no)}"><td><b>${esc(c.claim_no)}</b></td><td><b style="color:#d97706">${c.confidence}%</b></td><td>${esc(c.headline)}</td></tr>`))}<div class="why"><a class="btn ghost sm" href="#/settings/agents">Adjust minimum confidence</a></div>`;
    if (a.type === "fraud") { const c = d; return `<div class="tiles" style="grid-template-columns:repeat(4,1fr)">${tile("Claim", esc(c.claim_no))}${tile("Insured", esc(c.insured))}${tile("Vehicle", esc(c.vehicle))}${tile("Claimed", aed(c.claimed_amount))}</div>${gauge(m.value, cfgFraud.medium_threshold, cfgFraud.high_threshold)}
      <h4 style="margin-top:16px">${esc(c.headline)}</h4><ul class="fl big">${(c.findings || []).map(x => `<li class="l-${x.level}"><i>${{ ok: "✓", warn: "!", risk: "✕" }[x.level]}</i><span>${esc(x.text)}</span></li>`).join("")}</ul>
      <div class="why"><b>Claim status:</b> ${esc(c.status)}<div style="margin-top:10px"><a class="btn sm" href="#/claim/${c.claim_id}/ai">Open AI analysis</a> <a class="btn ghost sm" href="#/claim/${c.claim_id}/decision">Underwriting decision</a> <a class="btn ghost sm" href="#/settings/fraud">Adjust fraud thresholds</a></div></div>`; }
    if (a.type === "sla") return `<div class="tiles" style="grid-template-columns:repeat(2,1fr)">${tile("Claims affected", m.value)}${tile("Threshold", m.threshold + (a.entity_key === "sla" ? " h" : " days"))}</div><h4>Oldest open claims</h4>${tbl(["Claim", "Insured", "Status", "Waiting"], (d.claims || []).map(c => `<tr class="row" data-go="/claim/${esc(c.claim_no)}"><td><b>${esc(c.claim_no)}</b></td><td>${esc(c.insured_name)}</td><td>${esc(c.status)}</td><td><b>${c.age_days != null ? c.age_days + " days" : Math.round(c.age_hours / 24) + " days"}</b></td></tr>`))}<div class="why"><a class="btn ghost sm" href="#/settings/sla">Adjust SLA</a> <a class="btn ghost sm" href="#/queue">Open My Queue</a></div>`;
    if (a.type === "authority") return `<h4>Claims awaiting senior sign-off</h4>${tbl(["Claim", "Insured", "Required authority", "Est. payable", "Status"], (d.claims || []).map(c => `<tr class="row" data-go="/claim/${esc(c.claim_no)}"><td><b>${esc(c.claim_no)}</b></td><td>${esc(c.insured)}</td><td><b>${esc(c.authority)}</b></td><td>${aed(c.payable)}</td><td>${esc(c.status)}</td></tr>`))}<div class="why"><a class="btn ghost sm" href="#/settings/approval">Adjust approval limits</a></div>`;
    if (a.type === "garage") return `<div class="tiles" style="grid-template-columns:repeat(4,1fr)">${tile("Claim", esc(d.claim_no))}${tile("Garage", esc(d.garage))}${tile("AI band", aed(d.ai_min) + " - " + aed(d.ai_max))}${tile("Garage estimate", aed(d.garage_total))}</div><h4>Garage vs AI band</h4>${bars([{ l: "AI low", v: d.ai_min, c: "#1baf7a" }, { l: "AI high", v: d.ai_max, c: "#1baf7a" }, { l: "Garage estimate", v: d.garage_total, c: "#eb6834" }], aed)}<div class="why"><b>Suggested actions</b><ul><li>Ask the garage to justify the difference or re-quote.</li><li>Escalate for senior review before approving payment.</li></ul><a class="btn sm" href="#/claim/${d.claim_id}/garage">Open garage estimate</a></div>`;
    if (a.type === "intake") return `<h4>New customer-submitted claims</h4>${tbl(["Claim", "Insured", "Vehicle", "Submitted"], (d.claims || []).map(c => `<tr class="row" data-go="/claim/${esc(c.claim_no)}"><td><b>${esc(c.claim_no)}</b></td><td>${esc(c.insured)}</td><td>${esc(c.vehicle)}</td><td>${ago(c.submitted)}</td></tr>`))}<div class="why">Opening a new claim moves it to <b>In Review</b> and assigns it to you.</div>`;
    return `<pre>${esc(JSON.stringify(a.detail, null, 2))}</pre>`;
  }

  async function draw() {
    const list = filtered(), openN = s => alerts.filter(a => isOpen(a) && a.severity === s).length, cur = alerts.find(a => a.id === sel);
    const types = [...new Set(alerts.map(a => a.type))];
    el.innerHTML = `<div class="top"><div><h2>My Alerts</h2><p>Latency, token, fraud, failure and SLA alerts generated from live data and your Settings thresholds</p></div><button class="btn ghost sm" id="al-ref">↻ Refresh alerts</button></div>
    <div class="kpis" style="grid-template-columns:repeat(5,1fr)"><div class="card kpi"><small>Critical</small><b style="color:#dc2626">${openN("critical")}</b><small class="sub">open</small></div><div class="card kpi"><small>Warnings</small><b style="color:#d97706">${openN("warning")}</b><small class="sub">open</small></div><div class="card kpi"><small>Info</small><b style="color:#2a78d6">${openN("info")}</b><small class="sub">open</small></div><div class="card kpi"><small>Acknowledged</small><b>${alerts.filter(a => a.status === "ack").length}</b><small class="sub">being handled</small></div><div class="card kpi"><small>Resolved</small><b style="color:#16a34a">${alerts.filter(a => a.status === "resolved").length}</b><small class="sub">closed</small></div></div>
    <div class="alw"><div class="card al-list"><div class="alf"><div class="pills">${[["open", "Open"], ["ack", "Acknowledged"], ["resolved", "Resolved"], ["all", "All"]].map(([v, t]) => `<label class="pl"><input type="radio" name="fs" value="${v}" ${f.status === v ? "checked" : ""}><span>${t}</span></label>`).join("")}</div>
      <div class="alf2"><select id="fsev"><option value="all">All severities</option>${["critical", "warning", "info"].map(s => `<option value="${s}" ${f.sev === s ? "selected" : ""}>${SEV[s][2]}</option>`).join("")}</select><select id="ftype"><option value="all">All types</option>${types.map(t => `<option value="${t}" ${f.type === t ? "selected" : ""}>${(TYPE[t] || ["", t])[1]}</option>`).join("")}</select></div></div>
      <div class="als">${list.map(a => { const [c, ic] = SEV[a.severity]; return `<div class="ali ${a.id === sel ? "on" : ""} ${a.status === "resolved" ? "done" : ""}" data-id="${a.id}"><span class="sev" style="background:${c}">${ic}</span><div class="alb"><b>${esc(a.title)}</b><small>${esc(a.summary)}</small><div class="alm"><span class="chip2">${(TYPE[a.type] || ["", a.type])[0]} ${(TYPE[a.type] || ["", a.type])[1]}</span><span>${ago(a.updated_at)}</span>${a.status !== "new" ? `<span class="chip2 st-${a.status}">${a.status === "ack" ? "Acknowledged" : "Resolved"}</span>` : ""}</div></div></div>`; }).join("") || `<div class="empty">No alerts match these filters.</div>`}</div></div>
      <div class="card al-detail" id="al-detail">${cur ? `<div class="spin">Loading…</div>` : `<div class="empty" style="padding:70px 20px">Select an alert to see the data behind it.</div>`}</div></div>`;
    el.querySelectorAll('input[name="fs"]').forEach(r => r.onchange = () => { f.status = r.value; draw(); });
    el.querySelector("#fsev").onchange = e => { f.sev = e.target.value; draw(); }; el.querySelector("#ftype").onchange = e => { f.type = e.target.value; draw(); };
    el.querySelector("#al-ref").onclick = async () => { await load(true); toast("Alerts refreshed"); ctx.badge(); draw(); };
    el.querySelectorAll(".ali").forEach(n => n.onclick = () => { sel = n.dataset.id; draw(); });
    if (cur) {
      const box = el.querySelector("#al-detail"); const [c, ic, sevName] = SEV[cur.severity];
      let body; try { body = await detail(cur); } catch (e) { body = `<div class="empty">Could not load details: ${esc(e.message)}</div>`; }
      box.innerHTML = `<div class="adh"><span class="sev lg" style="background:${c}">${ic}</span><div><h3>${esc(cur.title)}</h3><small>${sevName} · ${(TYPE[cur.type] || ["", cur.type])[1]} · first seen ${new Date(cur.created_at).toLocaleString("en-GB")}${cur.ack_by ? ` · acknowledged by ${esc(cur.ack_by)}` : ""}${cur.resolved_by ? ` · resolved by ${esc(cur.resolved_by)}` : ""}</small></div></div><p class="sum">${esc(cur.summary)}</p>
      <div class="ada">${cur.status === "new" ? `<button class="btn sm" data-st="ack">Acknowledge</button>` : ""}${cur.status !== "resolved" ? `<button class="btn ghost sm" data-st="resolved">Mark resolved</button>` : `<button class="btn ghost sm" data-st="new">Reopen</button>`}</div>${body}`;
      box.querySelectorAll("[data-st]").forEach(b => b.onclick = async () => { await rpc("uw_alert_set_status", { p_id: cur.id, p_status: b.dataset.st, p_user: user.name }); await load(false); toast(b.dataset.st === "ack" ? "Alert acknowledged" : b.dataset.st === "resolved" ? "Alert resolved" : "Alert reopened"); ctx.badge(); draw(); });
      box.querySelectorAll("tr[data-go]").forEach(r => r.onclick = async () => { const x = (await ctx.claims()).find(c => c.claim_no === r.dataset.go.split("/").pop()); if (x) go("/claim/" + x.id + "/ai"); });
      Charts.bindTip(box);
    }
  }
  draw();
}
window.Alerts = { mount };
})();
