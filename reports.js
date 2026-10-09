// Reports & dashboards: Portfolio, AI Agents, Risk & Fraud, Financial, Underwriting.
// Plain HTML/SVG charts (no libraries). Palette: validated categorical slots (blue, orange, aqua, yellow, violet) + reserved status colours.
(() => {
const C = { blue: "#2a78d6", orange: "#eb6834", aqua: "#1baf7a", yellow: "#eda100", violet: "#4a3aa7", magenta: "#e87ba4", green: "#008300", red: "#e34948" };
const AG = { doc: C.blue, img: C.orange, fraud: C.aqua, repair: C.yellow, uw: C.violet };
const ST = { ok: "#16a34a", warn: "#d97706", risk: "#dc2626" };
const ORDER = ["Pending Documents", "Pending Underwriting", "In Review", "Pending Garage Estimate", "Approved", "Closed", "Rejected"];
const OPEN = ["Pending Underwriting", "In Review", "Pending Documents", "Pending Garage Estimate"];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const aed = n => "AED " + Math.round(n || 0).toLocaleString("en-US");
const k = n => n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n || 0));
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const avg = a => a.length ? a.reduce((p, c) => p + c, 0) / a.length : 0;
const group = (arr, f) => arr.reduce((m, x) => ((m[f(x)] ||= []).push(x), m), {});
const sum = (arr, f) => arr.reduce((t, x) => t + (+f(x) || 0), 0);
const day = d => new Date(d).toISOString().slice(0, 10);

// ---------- chart primitives ----------
const tip = t => `data-tip="${esc(t)}"`;
function hbar(items, { fmt = v => v, color = C.blue, max } = {}) {
  const m = max || Math.max(1, ...items.map(i => i.value));
  return `<div class="hb">${items.map(i => `<div class="hr" ${tip(`${i.label}: ${fmt(i.value)}${i.sub ? " · " + i.sub : ""}`)}><span class="hl">${esc(i.label)}</span><span class="ht"><span class="hf" style="width:${Math.max(i.value > 0 ? 1.5 : 0, i.value / m * 100)}%;background:${i.color || color}"></span></span><b>${fmt(i.value)}</b></div>`).join("")}</div>`;
}
function stackedH(rows, { legend = true } = {}) {
  const names = [...new Map(rows.flatMap(r => r.parts).map(p => [p.name, p.color])).entries()];
  const mx = Math.max(1, ...rows.map(r => sum(r.parts, p => p.value)));
  const body = rows.map(r => { const t = sum(r.parts, p => p.value) || 1; return `<div class="hr"><span class="hl">${esc(r.label)}</span><span class="ht"><span class="stk" style="width:${t / mx * 100}%">${r.parts.filter(p => p.value > 0).map(p => `<span class="hf" ${tip(`${r.label} - ${p.name}: ${p.fmt ? p.fmt(p.value) : p.value}`)} style="width:${p.value / t * 100}%;background:${p.color}"></span>`).join("")}</span></span><b>${r.total ?? t}</b></div>`; }).join("");
  return `<div class="hb">${body}</div>${legend ? `<div class="lg">${names.map(([n, c]) => `<span><i style="background:${c}"></i>${esc(n)}</span>`).join("")}</div>` : ""}`;
}
function donut(parts, { center = "", sub = "" } = {}) {
  const t = sum(parts, p => p.value) || 1, R = 15.9155; let off = 25;
  const segs = parts.filter(p => p.value > 0).map(p => { const len = p.value / t * 100, d = `<circle cx="21" cy="21" r="${R}" fill="none" stroke="${p.color}" stroke-width="5.5" stroke-dasharray="${Math.max(len - 1, 0.5)} ${100 - Math.max(len - 1, 0.5)}" stroke-dashoffset="${off}" ${tip(`${p.label}: ${p.value} (${pct(p.value, t)}%)`)}/>`; off -= len; return d; }).join("");
  return `<div class="dn"><svg viewBox="0 0 42 42" width="170" height="170"><circle cx="21" cy="21" r="${R}" fill="none" stroke="#eef1f6" stroke-width="5.5"/>${segs}<text x="21" y="21.5" text-anchor="middle" font-size="7" font-weight="700" fill="#1d2433">${esc(center)}</text><text x="21" y="27" text-anchor="middle" font-size="2.8" fill="#6b7686">${esc(sub)}</text></svg>
  <ul class="lg v">${parts.map(p => `<li ${tip(`${p.label}: ${p.value}`)}><i style="background:${p.color}"></i>${esc(p.label)}<b>${p.value}</b><small>${pct(p.value, t)}%</small></li>`).join("")}</ul></div>`;
}
function columns(items, { color = C.blue, fmt = v => v, h = 170 } = {}) {
  const W = 560, m = Math.max(1, ...items.map(i => i.value)), bw = W / items.length;
  return `<svg class="ch" viewBox="0 0 ${W} ${h + 34}" preserveAspectRatio="none"><line x1="0" y1="${h}" x2="${W}" y2="${h}" stroke="#d9dee8"/>${[.5, 1].map(f => `<line x1="0" y1="${h - h * f * .92}" x2="${W}" y2="${h - h * f * .92}" stroke="#eef1f6"/>`).join("")}
  ${items.map((i, n) => { const bh = i.value / m * h * .92, x = n * bw + bw * .18; return `<g ${tip(`${i.label}: ${fmt(i.value)}`)}><rect x="${x}" y="${h - bh}" width="${bw * .64}" height="${Math.max(bh, 0)}" rx="3" fill="${i.color || color}"/><rect x="${n * bw}" y="0" width="${bw}" height="${h}" fill="transparent"/><text x="${n * bw + bw / 2}" y="${h - bh - 5}" text-anchor="middle" font-size="11" fill="#3b4557">${i.value ? fmt(i.value) : ""}</text><text x="${n * bw + bw / 2}" y="${h + 16}" text-anchor="middle" font-size="10.5" fill="#6b7686">${esc(i.label)}</text></g>`; }).join("")}</svg>`;
}
function line(points, { color = C.blue, h = 170, fmt = v => v } = {}) {
  const W = 560, m = Math.max(1, ...points.map(p => p.y)), n = Math.max(points.length - 1, 1), X = i => 8 + i / n * (W - 16), Y = v => h - 8 - v / m * (h - 26);
  const d = points.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(" ");
  const ticks = points.filter((_, i) => i % Math.ceil(points.length / 6) === 0 || i === points.length - 1);
  return `<svg class="ch" viewBox="0 0 ${W} ${h + 28}" preserveAspectRatio="none"><line x1="0" y1="${h - 8}" x2="${W}" y2="${h - 8}" stroke="#d9dee8"/><line x1="0" y1="${Y(m / 2)}" x2="${W}" y2="${Y(m / 2)}" stroke="#eef1f6"/>
  <path d="${d} L${X(points.length - 1)} ${h - 8} L${X(0)} ${h - 8}Z" fill="${color}" opacity=".10"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
  ${points.map((p, i) => `<g ${tip(`${p.x}: ${fmt(p.y)}`)}><circle cx="${X(i)}" cy="${Y(p.y)}" r="${points.length > 40 ? 0 : 3.5}" fill="${color}" stroke="#fff" stroke-width="2"/><rect x="${X(i) - 560 / n / 2}" y="0" width="${560 / n}" height="${h}" fill="transparent"/></g>`).join("")}
  ${ticks.map(p => `<text x="${X(points.indexOf(p))}" y="${h + 14}" text-anchor="${p === points[0] ? "start" : p === points[points.length - 1] ? "end" : "middle"}" font-size="10.5" fill="#6b7686">${esc(p.x.slice(5))}</text>`).join("")}</svg>`;
}
function scatter(pts, { xl = "", yl = "" } = {}) {
  const W = 560, H = 250, mx = Math.max(1, ...pts.map(p => Math.max(p.x, p.y))) * 1.08, X = v => 46 + v / mx * (W - 60), Y = v => H - 34 - v / mx * (H - 52);
  return `<svg class="ch" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><line x1="46" y1="${H - 34}" x2="${W - 10}" y2="${H - 34}" stroke="#d9dee8"/><line x1="46" y1="10" x2="46" y2="${H - 34}" stroke="#d9dee8"/>
  <line x1="${X(0)}" y1="${Y(0)}" x2="${X(mx)}" y2="${Y(mx)}" stroke="#9aa6b5" stroke-dasharray="4 4"/><text x="${X(mx) - 4}" y="${Y(mx) + 14}" text-anchor="end" font-size="10" fill="#6b7686">equal</text>
  ${pts.map(p => `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="5" fill="${p.color || C.blue}" fill-opacity=".85" stroke="#fff" stroke-width="2" ${tip(p.tip)}/>`).join("")}
  ${[0, .5, 1].map(f => `<text x="42" y="${Y(mx * f) + 3}" text-anchor="end" font-size="10" fill="#6b7686">${k(mx * f)}</text><text x="${X(mx * f)}" y="${H - 20}" text-anchor="middle" font-size="10" fill="#6b7686">${k(mx * f)}</text>`).join("")}
  <text x="${W / 2}" y="${H - 4}" text-anchor="middle" font-size="11" fill="#3b4557">${esc(xl)}</text><text x="12" y="${H / 2}" font-size="11" fill="#3b4557" transform="rotate(-90 12 ${H / 2})" text-anchor="middle">${esc(yl)}</text></svg>`;
}
const table = (cols, rows) => `<div class="tablewrap"><table><thead><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr class="${r.go ? "row" : ""}" ${r.go ? `data-go="${r.go}"` : ""}>${r.cells.map(c => `<td>${c}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${cols.length}" class="empty">No data</td></tr>`}</tbody></table></div>`;
const kpi = (l, v, sub = "") => `<div class="card kpi"><small>${l}</small><b>${v}</b><small class="sub">${sub}</small></div>`;
const panel = (t, body, note = "", span = "") => `<div class="card pn ${span}"><div class="pt"><h4>${t}</h4>${note ? `<small>${note}</small>` : ""}</div>${body}</div>`;
const csv = (name, head, rows) => { const t = [head, ...rows].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "text/csv" })); a.download = name; a.click(); };

// ---------- data ----------
async function load(api) {
  const [claims, analysis, runs, payments, decisions, garage, stats, uws] = await Promise.all([
    api("uw_claims?select=id,claim_no,status,make_model,vehicle_year,damage_area,accident_type,reported_on,claimed_amount,deductible,assigned_to,insured_name,sum_insured"),
    api("uw_ai_analysis?select=claim_id,damage_severity,fraud_risk,repair_min,repair_max,recommendation"),
    api("uw_ai_agent_runs?select=claim_id,agent_key,status,confidence,headline,metrics,findings"),
    api("uw_payments?select=claim_id,amount,paid_on,txn_ref"), api("uw_decisions?select=claim_id,decision,decided_at"),
    api("uw_garage_estimates?select=claim_id,estimated_cost"), api("uw_agent_stats?select=*"), api("uw_underwriter_names?select=*")]);
  return { claims, analysis, runs, payments, decisions, garage, stats, uws };
}

// ---------- dashboards ----------
function build(D, tab, period) {
  const cutoff = period === "all" ? 0 : Date.now() - +period * 864e5;
  const claims = D.claims.filter(c => new Date(c.reported_on) >= cutoff), ids = new Set(claims.map(c => c.id)), byId = Object.fromEntries(claims.map(c => [c.id, c]));
  const an = D.analysis.filter(a => ids.has(a.claim_id)), anBy = Object.fromEntries(an.map(a => [a.claim_id, a]));
  const runs = D.runs.filter(r => ids.has(r.claim_id)), pays = D.payments.filter(p => ids.has(p.claim_id)), decs = D.decisions.filter(d => ids.has(d.claim_id));
  const gar = group(D.garage.filter(g => ids.has(g.claim_id)), g => g.claim_id), mid = a => a ? (+a.repair_min + +a.repair_max) / 2 : 0;
  const runOf = (cid, key) => runs.find(r => r.claim_id === cid && r.agent_key === key);
  const open = claims.filter(c => OPEN.includes(c.status));
  const link = c => `#/claim/${c.id}/ai`;
  const view = {};

  view.portfolio = () => {
    const bySt = group(claims, c => c.status), decided = claims.filter(c => ["Approved", "Closed", "Rejected"].includes(c.status));
    const days = [...Array(30)].map((_, i) => day(Date.now() - (29 - i) * 864e5)), perDay = group(claims, c => day(c.reported_on));
    const make = Object.entries(group(claims, c => c.make_model)).map(([l, a]) => ({ label: l, value: a.length })).sort((a, b) => b.value - a.value).slice(0, 8);
    const area = { rear: "Rear", front: "Front", side: "Side", roof: "Hail / roof", general: "Parking scrape" };
    return `<div class="kpis">${kpi("Total claims", claims.length, `${open.length} open`)}${kpi("Approval rate", pct(decided.filter(c => c.status !== "Rejected").length, decided.length) + "%", `${decided.length} decided`)}${kpi("Total claimed", aed(sum(claims, c => c.claimed_amount)), "all claims")}${kpi("Open exposure (AI est.)", aed(sum(open, c => mid(anBy[c.id]))), `${open.length} open claims`)}${kpi("Avg AI repair estimate", aed(avg(an.map(mid))), "per claim")}</div>
    <div class="g2">${panel("Claims pipeline by status", hbar(ORDER.filter(s => bySt[s]).map(s => ({ label: s, value: bySt[s].length })), { color: C.blue }))}
    ${panel("Claims reported per day", line(days.map(d => ({ x: d, y: (perDay[d] || []).length })), { fmt: v => v + " claims" }), "last 30 days")}
    ${panel("Damage type", donut(Object.entries(group(claims, c => c.damage_area)).map(([a, x], i) => ({ label: area[a] || a, value: x.length, color: [C.blue, C.orange, C.aqua, C.yellow, C.violet][i % 5] })), { center: claims.length, sub: "claims" }))}
    ${panel("Most claimed vehicle models", hbar(make, { color: C.blue }), "top 8")}</div>`;
  };

  view.agents = () => {
    const st = Object.fromEntries(D.stats.map(s => [s.agent_key, s])), keys = ["doc", "img", "fraud", "repair", "uw"], nm = { doc: "DocuMind", img: "VisionAssess", fraud: "FraudShield", repair: "RepairIQ", uw: "UnderwriteIQ" };
    const tot = keys.reduce((t, x) => t + (st[x]?.tokens_in || 0) + (st[x]?.tokens_out || 0), 0), wf = st.workflow || {};
    const conf = x => avg(runs.filter(r => r.agent_key === x && r.confidence).map(r => r.confidence));
    const mix = x => { const f = runs.filter(r => r.agent_key === x).flatMap(r => r.findings || []); return ["ok", "warn", "risk"].map(l => ({ name: { ok: "✓ OK", warn: "! Warning", risk: "✕ Risk" }[l], value: f.filter(y => y.level === l).length, color: ST[l] })); };
    const human = decs.filter(d => anBy[d.claim_id]), agree = human.filter(d => (anBy[d.claim_id].recommendation.startsWith("Approve") && d.decision === "Approved") || (anBy[d.claim_id].recommendation.startsWith("Reject") && d.decision === "Rejected"));
    const recs = Object.entries(group(an, a => a.recommendation)).map(([l, x], i) => ({ label: l, value: x.length, color: [C.aqua, C.orange, C.blue][i % 3] }));
    return `<div class="kpis">${kpi("Agents online", keys.filter(x => st[x]?.status === "Online").length + " / 5", "Kore Agent Platform")}${kpi("Workflow runs", wf.runs || 0, `${pct(wf.runs, wf.runs)}% success`)}${kpi("Tokens consumed", k(tot), `${k(sum(keys, x => st[x]?.tokens_in))} in · ${k(sum(keys, x => st[x]?.tokens_out))} out`)}${kpi("Avg time per claim", ((wf.avg_latency_ms || 0) / 1000).toFixed(1) + "s", "5 agents, end to end")}${kpi("AI vs human agreement", pct(agree.length, human.length) + "%", `${human.length} decided claims`)}</div>
    <div class="g2">${panel("Tokens by agent", stackedH(keys.map(x => ({ label: nm[x], total: k((st[x]?.tokens_in || 0) + (st[x]?.tokens_out || 0)), parts: [{ name: "Input tokens", value: st[x]?.tokens_in || 0, color: C.blue, fmt: k }, { name: "Output tokens", value: st[x]?.tokens_out || 0, color: C.orange, fmt: k }] }))))}
    ${panel("Average latency per run", hbar(keys.map(x => ({ label: nm[x], value: (st[x]?.avg_latency_ms || 0) / 1000, color: AG[x] })), { fmt: v => v.toFixed(1) + "s" }), "agents run in parallel except UnderwriteIQ")}
    ${panel("Average confidence", hbar(keys.map(x => ({ label: nm[x], value: Math.round(conf(x)), color: AG[x] })), { fmt: v => v + "%", max: 100 }))}
    ${panel("Tokens per run", hbar(keys.map(x => ({ label: nm[x], value: st[x]?.runs ? Math.round(((st[x].tokens_in || 0) + (st[x].tokens_out || 0)) / st[x].runs) : 0, color: AG[x] })), { fmt: k }), "efficiency")}
    ${panel("Finding mix by agent", stackedH(keys.map(x => ({ label: nm[x], parts: mix(x) }))), "OK / warning / risk")}
    ${panel("AI recommendations", donut(recs, { center: an.length, sub: "claims" }))}</div>
    ${panel("Agent scorecard", table(["Agent", "Runs", "Success", "Avg latency", "P95", "Tokens", "LLM calls", "Tool calls", "Avg confidence"], keys.map(x => ({ cells: [`<b>${nm[x]}</b>`, st[x]?.runs || 0, pct(st[x]?.successful_runs, st[x]?.runs) + "%", ((st[x]?.avg_latency_ms || 0) / 1000).toFixed(1) + "s", ((st[x]?.p95_latency_ms || 0) / 1000).toFixed(1) + "s", k((st[x]?.tokens_in || 0) + (st[x]?.tokens_out || 0)), st[x]?.llm_calls || 0, st[x]?.tool_calls || 0, Math.round(conf(x)) + "%"] }))), "snapshot of Kore workflow executions", "wide")}`;
  };

  view.risk = () => {
    const fr = claims.map(c => ({ c, a: anBy[c.id], r: runOf(c.id, "fraud") })).filter(x => x.r);
    const score = x => +x.r.metrics?.score || 0, band = x => x.a?.fraud_risk || x.r.metrics?.fraud_risk;
    const hist = [...Array(7)].map((_, i) => ({ label: `${i * 10}-${i * 10 + 9}`, value: fr.filter(x => score(x) >= i * 10 && score(x) < i * 10 + 10 || (i === 6 && score(x) >= 60)).length, color: i < 3 ? ST.ok : i < 6 ? ST.warn : ST.risk }));
    const lvl = ["Low", "Medium", "High"], col = { Low: ST.ok, Medium: ST.warn, High: ST.risk }, icon = { Low: "✓", Medium: "!", High: "✕" };
    const types = Object.entries(group(fr, x => x.c.accident_type || "Other")).map(([l, a]) => ({ label: l, parts: lvl.map(v => ({ name: `${icon[v]} ${v}`, value: a.filter(x => band(x) === v).length, color: col[v] })) }));
    const top = [...fr].sort((a, b) => score(b) - score(a)).slice(0, 10);
    const late = fr.filter(x => (x.r.findings || []).some(f => /filed .* hours|late report|reporting/i.test(f.text) && f.level !== "ok")).length;
    return `<div class="kpis">${kpi("High-risk claims", fr.filter(x => band(x) === "High").length, "SIU referral recommended")}${kpi("Medium-risk claims", fr.filter(x => band(x) === "Medium").length, "extra verification")}${kpi("Avg fraud score", Math.round(avg(fr.map(score))) + "/100", `${fr.length} scored`)}${kpi("Late-reporting flags", late, "police report delay")}${kpi("Claims value at High risk", aed(sum(fr.filter(x => band(x) === "High"), x => x.c.claimed_amount)), "claimed")}</div>
    <div class="g2">${panel("Fraud risk distribution", donut(lvl.map(v => ({ label: `${icon[v]} ${v}`, value: fr.filter(x => band(x) === v).length, color: col[v] })), { center: fr.length, sub: "scored" }))}
    ${panel("Fraud score distribution", columns(hist, { fmt: v => v }), "claims per score band (0-100)")}
    ${panel("Risk by accident type", stackedH(types))}
    ${panel("Average fraud score by damage type", hbar(Object.entries(group(fr, x => x.c.damage_area)).map(([l, a]) => ({ label: l, value: Math.round(avg(a.map(score))) })).sort((a, b) => b.value - a.value), { fmt: v => v + "/100", color: C.aqua }))}</div>
    ${panel("Top 10 highest-risk claims", table(["Claim", "Insured", "Vehicle", "Status", "Fraud score", "Risk"], top.map(x => ({ go: link(x.c), cells: [`<b>${x.c.claim_no}</b>`, esc(x.c.insured_name), esc(x.c.make_model), esc(x.c.status), `<b>${score(x)}</b>/100`, `<span style="color:${col[band(x)]};font-weight:700">${icon[band(x)]} ${band(x)}</span>`] }))), "", "wide")}`;
  };

  view.financial = () => {
    const paid = sum(pays, p => p.amount), withG = claims.filter(c => gar[c.id] && anBy[c.id]);
    const gt = c => sum(gar[c.id], g => g.estimated_cost), within = withG.filter(c => gt(c) >= anBy[c.id].repair_min * .95 && gt(c) <= anBy[c.id].repair_max * 1.05);
    const bins = [...Array(8)].map((_, i) => ({ label: `${i * 3}-${i * 3 + 3}k`, value: an.filter(a => mid(a) >= i * 3000 && (mid(a) < i * 3000 + 3000 || i === 7)).length }));
    const expo = ORDER.filter(s => OPEN.includes(s)).map(s => ({ label: s, value: sum(claims.filter(c => c.status === s), c => mid(anBy[c.id])) }));
    const make = Object.entries(group(claims.filter(c => anBy[c.id]), c => c.make_model)).map(([l, a]) => ({ label: l, value: Math.round(avg(a.map(c => mid(anBy[c.id])))) })).sort((a, b) => b.value - a.value).slice(0, 8);
    const pts = withG.map(c => ({ x: mid(anBy[c.id]), y: gt(c), color: within.includes(c) ? C.aqua : C.orange, tip: `${c.claim_no} - AI ${aed(mid(anBy[c.id]))} vs garage ${aed(gt(c))}` }));
    const recent = [...pays].sort((a, b) => b.paid_on.localeCompare(a.paid_on)).slice(0, 8);
    return `<div class="kpis">${kpi("Total paid out", aed(paid), `${pays.length} payments`)}${kpi("Avg payout", aed(pays.length ? paid / pays.length : 0), "after deductible")}${kpi("Open exposure (AI est.)", aed(sum(open, c => mid(anBy[c.id]))), `${open.length} open claims`)}${kpi("Deductibles recovered", aed(pays.length * 1000), "AED 1,000 per claim")}${kpi("Garage within AI band", pct(within.length, withG.length) + "%", `${withG.length} estimates compared`)}</div>
    <div class="g2">${panel("AI repair estimate distribution", columns(bins), "claims by estimate midpoint (AED)")}
    ${panel("Open exposure by status", hbar(expo, { fmt: aed, color: C.blue }))}
    ${panel("Average AI repair cost by vehicle", hbar(make, { fmt: aed, color: C.yellow }), "top 8")}
    ${panel("Garage estimate vs AI estimate", scatter(pts, { xl: "AI estimate midpoint (AED)", yl: "Garage estimate (AED)" }) + `<div class="lg"><span><i style="background:${C.aqua}"></i>Within AI band</span><span><i style="background:${C.orange}"></i>Outside band</span></div>`)}</div>
    ${panel("Recent payments released", table(["Claim", "Amount", "Paid on", "Transaction"], recent.map(p => ({ go: byId[p.claim_id] ? link(byId[p.claim_id]) : "", cells: [`<b>${byId[p.claim_id]?.claim_no}</b>`, aed(p.amount), new Date(p.paid_on).toLocaleDateString("en-GB"), p.txn_ref] }))), "", "wide")}`;
  };

  view.underwriting = () => {
    const nameOf = id => D.uws.find(u => u.id === id)?.name || "Unassigned", g = group(claims, c => nameOf(c.assigned_to));
    const rows = Object.entries(g).map(([n, a]) => ({ label: n, parts: [{ name: "Open", value: a.filter(c => OPEN.includes(c.status)).length, color: C.blue }, { name: "Approved / closed", value: a.filter(c => ["Approved", "Closed"].includes(c.status)).length, color: C.aqua }, { name: "Rejected", value: a.filter(c => c.status === "Rejected").length, color: C.orange }] }));
    const age = c => (Date.now() - new Date(c.reported_on)) / 864e5, buckets = [["0-2 days", 0, 2], ["3-7 days", 2, 7], ["8-14 days", 7, 14], ["15+ days", 14, 1e9]].map(([l, lo, hi]) => ({ label: l, value: open.filter(c => age(c) >= lo && age(c) < hi).length, color: lo >= 14 ? ST.risk : lo >= 7 ? ST.warn : C.blue }));
    const tt = decs.map(d => (new Date(d.decided_at) - new Date(byId[d.claim_id].reported_on)) / 36e5).filter(h => h > 0);
    const auth = Object.entries(group(runs.filter(r => r.agent_key === "uw"), r => r.metrics?.authority_level || "Underwriter")).map(([l, a], i) => ({ label: l, value: a.length, color: [C.blue, C.violet][i % 2] }));
    const dm = Object.entries(group(decs, d => d.decision)).map(([l, a], i) => ({ label: l, value: a.length, color: [C.aqua, C.orange, C.yellow][i % 3] }));
    const human = decs.filter(d => anBy[d.claim_id]), agree = human.filter(d => (anBy[d.claim_id].recommendation.startsWith("Approve") && d.decision === "Approved") || (anBy[d.claim_id].recommendation.startsWith("Reject") && d.decision === "Rejected"));
    const recent = [...decs].sort((a, b) => b.decided_at.localeCompare(a.decided_at)).slice(0, 8);
    return `<div class="kpis">${kpi("Decisions recorded", decs.length, "human decisions")}${kpi("Avg time to decision", tt.length ? (avg(tt) / 24).toFixed(1) + " days" : "—", "reported → decided")}${kpi("Open queue", open.length, "awaiting action")}${kpi("Senior sign-off needed", auth.filter(a => /Senior/.test(a.label)).reduce((t, a) => t + a.value, 0), "per UnderwriteIQ")}${kpi("AI-human agreement", pct(agree.length, human.length) + "%", `${human.length} claims`)}</div>
    <div class="g2">${panel("Workload by underwriter", stackedH(rows))}${panel("Open queue age", columns(buckets), "days since reported")}
    ${panel("Decision outcomes", donut(dm, { center: decs.length, sub: "decisions" }))}${panel("Approval authority required (AI)", donut(auth, { center: runs.filter(r => r.agent_key === "uw").length, sub: "claims" }))}</div>
    ${panel("Recent decisions", table(["Claim", "Insured", "AI recommendation", "Human decision", "Decided on"], recent.map(d => { const c = byId[d.claim_id]; return { go: link(c), cells: [`<b>${c.claim_no}</b>`, esc(c.insured_name), esc(anBy[c.id]?.recommendation || "—"), `<b>${esc(d.decision)}</b>`, new Date(d.decided_at).toLocaleDateString("en-GB")] }; })), "", "wide")}`;
  };

  view._csv = () => csv("claims-report.csv", ["Claim", "Status", "Vehicle", "Damage", "Reported", "Claimed AED", "AI severity", "Fraud risk", "AI est. low", "AI est. high", "AI recommendation"], claims.map(c => { const a = anBy[c.id] || {}; return [c.claim_no, c.status, c.make_model, c.damage_area, c.reported_on, c.claimed_amount, a.damage_severity, a.fraud_risk, a.repair_min, a.repair_max, a.recommendation]; }));
  return view;
}

// ---------- mount ----------
let tipEl;
function bindTip(root) {
  tipEl ||= Object.assign(document.body.appendChild(document.createElement("div")), { className: "tt" });
  root.onmousemove = e => { const t = e.target.closest("[data-tip]"); if (!t) { tipEl.style.display = "none"; return; } tipEl.textContent = t.dataset.tip; tipEl.style.display = "block"; tipEl.style.left = Math.min(e.clientX + 14, innerWidth - 270) + "px"; tipEl.style.top = e.clientY + 16 + "px"; };
  root.onmouseleave = () => tipEl.style.display = "none";
}
const TABS = [["portfolio", "Portfolio"], ["agents", "AI Agents"], ["risk", "Risk & Fraud"], ["financial", "Financial"], ["underwriting", "Underwriting"]];
let cur = "portfolio", per = "all";
function mount(el, D, go, tab) {
  if (tab && TABS.some(t => t[0] === tab)) cur = tab;
  const draw = () => {
    const v = build(D, cur, per);
    el.innerHTML = `<div class="top"><div><h2>Reports & Dashboards</h2><p>Live analytics from Supabase and the Kore AI agent runs</p></div><div style="display:flex;gap:10px"><select id="rpp" style="width:auto">${[["all", "All time"], ["90", "Last 90 days"], ["30", "Last 30 days"], ["7", "Last 7 days"]].map(([a, b]) => `<option value="${a}" ${a === per ? "selected" : ""}>${b}</option>`).join("")}</select><button class="btn ghost sm" id="rpe">⤓ Export CSV</button></div></div>
      <div class="tabs">${TABS.map(([a, b]) => `<button data-t="${a}" class="${a === cur ? "on" : ""}">${b}</button>`).join("")}</div><div class="rp">${v[cur]()}</div>`;
    el.querySelectorAll(".tabs button").forEach(b => b.onclick = () => { cur = b.dataset.t; draw(); });
    el.querySelector("#rpp").onchange = e => { per = e.target.value; draw(); };
    el.querySelector("#rpe").onclick = () => v._csv();
    el.querySelectorAll("tr[data-go]").forEach(r => r.onclick = () => go(r.dataset.go.replace(/^#/, "")));
    bindTip(el);
  };
  draw();
}
window.Reports = { load, mount };
window.Charts = { columns, hbar, bindTip };
})();
