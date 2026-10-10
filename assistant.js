// ClaimAssist Assistant: natural-language chat over live Supabase data. Answers conversationally AND drives the app (filters, navigation, alerts, reports, settings, AI runs).
(() => {
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const aed = n => "AED " + Math.round(n || 0).toLocaleString("en-US");
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|\s)_(.+?)_(?=\s|$)/g, "$1<i>$2</i>").replace(/\n/g, "<br>");
const CL = n => "CLM-" + String(n).padStart(7, "0");
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ago = d => { const s = (Date.now() - new Date(d)) / 1000; return s < 3600 ? Math.max(1, Math.round(s / 60)) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " days ago"; };
const STAT_BADGE = { "New": "#0284c7", "Pending Underwriting": "#d97706", "In Review": "#2563eb", "Pending Documents": "#c2410c", "Pending Garage Estimate": "#6d28d9", "Approved": "#15803d", "Closed": "#64748b", "Rejected": "#b91c1c" };
let ctx, D = null, msgs = [], tab = "chat", opened = false, wide = false, pending = null, last = { claim: null, ids: null, label: "" }, root, fab, rec = null, busy = false;

async function load(force) {
  if (D && !force && Date.now() - D.t < 45000) return D;
  const [claims, an, runs, alerts, stats, pays, decs, uws] = await Promise.all([
    ctx.api("uw_claims?select=id,claim_no,status,make_model,vehicle_year,reg_no,damage_area,accident_type,reported_on,loss_date,claimed_amount,insured_name,assigned_to,source,location,policy_no,garage_name,sum_insured"),
    ctx.api("uw_ai_analysis?select=claim_id,damage_severity,fraud_risk,repair_min,repair_max,recommendation"), ctx.api("uw_ai_agent_runs?select=claim_id,agent_key,status,confidence,headline,metrics,findings"),
    ctx.api("uw_alerts?select=id,type,severity,title,summary,status,entity_key"), ctx.api("uw_agent_stats?select=*"), ctx.api("uw_payments?select=claim_id,amount"), ctx.api("uw_decisions?select=claim_id,decision"), ctx.api("uw_underwriter_names?select=*")]);
  const R = {}; runs.forEach(r => (R[r.claim_id] ||= {})[r.agent_key] = r);
  D = { t: Date.now(), claims, an: Object.fromEntries(an.map(a => [a.claim_id, a])), R, alerts, stats: Object.fromEntries(stats.map(s => [s.agent_key, s])), pays, decs, uws,
    byNo: Object.fromEntries(claims.map(c => [c.claim_no, c])), makes: [...new Set(claims.map(c => c.make_model))], names: [...new Set(claims.map(c => c.insured_name))] };
  return D;
}
const fraudOf = c => D.R[c.id]?.fraud?.metrics?.fraud_risk || D.an[c.id]?.fraud_risk || null;
const scoreOf = c => D.R[c.id]?.fraud?.metrics?.score;
const midOf = c => { const a = D.an[c.id]; return a && a.repair_min ? (+a.repair_min + +a.repair_max) / 2 : 0; };
const authOf = c => D.R[c.id]?.uw?.metrics?.authority_level;
const recOf = c => D.an[c.id]?.recommendation || "";
const OPEN = ["New", "Pending Underwriting", "In Review", "Pending Documents", "Pending Garage Estimate"];

// ---------- natural-language understanding ----------
function parse(q) {
  const t = " " + q.toLowerCase().replace(/[?!]+/g, " ").replace(/\s+/g, " ") + " ", e = { t, nos: [], desc: [] };
  for (const m of t.matchAll(/clm[-\s]?0*(\d{3,7})/g)) e.nos.push(CL(m[1]));
  for (const m of t.matchAll(/\bclaim\s*(?:no\.?|number|#)?\s*0*(\d{4,7})\b/g)) e.nos.push(CL(m[1]));
  e.nos = [...new Set(e.nos)];
  const S = [[/pending garage|garage estimate|awaiting (the )?garage/, "Pending Garage Estimate"], [/pending doc|missing doc|documents? (needed|missing|pending)|awaiting documents/, "Pending Documents"], [/pending underwriting|awaiting underwriting|waiting for underwriting|in the queue/, "Pending Underwriting"], [/in review|under review|being reviewed/, "In Review"], [/\bnew\b|newly|just (submitted|received)|unopened|not (yet )?opened|customer[- ]submitted/, "New"], [/\bapproved\b/, "Approved"], [/\bclosed\b|settled|\bpaid\b/, "Closed"], [/rejected|declined|denied/, "Rejected"]];
  for (const [re, s] of S) if (re.test(t)) { e.status = s; e.desc.push("status " + s); break; }
  if (/high[- ]?(risk )?fraud|fraud(ulent)?( risk)?( is)? high|high[- ]risk|suspicious|highest fraud|riskiest/.test(t)) { e.fraud = ["High"]; e.desc.push("High fraud risk"); }
  else if (/medium[- ]?(risk )?fraud|fraud( risk)? medium|medium[- ]risk/.test(t)) { e.fraud = ["Medium"]; e.desc.push("Medium fraud risk"); }
  else if (/low[- ]?(risk )?fraud|fraud( risk)? low|low[- ]risk|clean/.test(t)) { e.fraud = ["Low"]; e.desc.push("Low fraud risk"); }
  else if (/\bfraud|\brisky\b|\bflagged\b/.test(t) && !/alert|score|threshold/.test(t)) { e.fraud = ["High", "Medium"]; e.desc.push("fraud risk Medium or High"); }
  if (/severe|major damage|high damage|serious damage|heavily damaged/.test(t)) { e.sev = "High"; e.desc.push("severe damage"); } else if (/minor damage|light damage/.test(t)) { e.sev = "Low"; e.desc.push("minor damage"); }
  const dm = [[/rear|back[- ]end|from behind/, "rear", "rear damage"], [/\bfront\b|head[- ]on|bonnet|bumper/, "front", "front damage"], [/\bside\b|door|sideswipe/, "side", "side damage"], [/hail|roof/, "roof", "hail damage"], [/parking|scratch|scrape/, "general", "parking damage"]];
  for (const [re, k, d] of dm) if (re.test(t)) { e.damage = k; e.desc.push(d); break; }
  const hi = t.match(/(?:over|above|more than|greater than|exceed(?:ing|s)?|bigger than|>)\s*(?:aed\s*)?(\d[\d,.]*)\s*(k|m)?/), lo = t.match(/(?:under|below|less than|smaller than|<)\s*(?:aed\s*)?(\d[\d,.]*)\s*(k|m)?/);
  const num = (x, u) => parseFloat(x.replace(/,/g, "")) * (u === "k" ? 1e3 : u === "m" ? 1e6 : 1);
  if (hi) { e.min = num(hi[1], hi[2]); e.desc.push("claimed over " + aed(e.min)); } if (lo) { e.max = num(lo[1], lo[2]); e.desc.push("claimed under " + aed(e.max)); }
  if (/\btoday\b/.test(t)) { e.since = new Date().setHours(0, 0, 0, 0); e.desc.push("reported today"); } else if (/yesterday/.test(t)) { e.since = new Date().setHours(0, 0, 0, 0) - 864e5; e.desc.push("reported since yesterday"); }
  else if (/last (\d+) days?/.test(t)) { const n = +t.match(/last (\d+) days?/)[1]; e.since = Date.now() - n * 864e5; e.desc.push(`last ${n} days`); } else if (/this week|past week|last week|last 7/.test(t)) { e.since = Date.now() - 7 * 864e5; e.desc.push("last 7 days"); } else if (/this month|past month|last month/.test(t)) { e.since = Date.now() - 30 * 864e5; e.desc.push("last 30 days"); }
  if (/\bmy (claims|queue|work|cases)|assigned to me/.test(t)) { e.mine = true; e.desc.push("assigned to you"); }
  if (/sign[- ]?off|senior underwriter|claims manager|escalat/.test(t) && !/set|change/.test(t)) { e.auth = true; e.desc.push("needing senior sign-off"); }
  if (/(recommend\w*|ai).*(reject|decline)|reject recommend/.test(t)) { e.rec = "Reject"; e.desc.push("AI recommends rejecting"); } else if (/(recommend\w*|ai).*approv/.test(t)) { e.rec = "Approve"; e.desc.push("AI recommends approving"); }
  if (/not (yet )?analy[sz]ed|no ai|without ai|awaiting ai|ai not run|never analy[sz]ed/.test(t)) { e.noAI = true; e.desc.push("not yet analysed by AI"); }
  if (/overdue|sla|breach|waiting too long|stuck|old(est)? claims?|aging|ageing/.test(t)) { e.overdue = true; e.desc.push("older than the decision SLA"); }
  const mk = D ? D.makes.filter(m => { const [a, ...b] = m.toLowerCase().split(" "), model = b.join(" "); return t.includes(m.toLowerCase()) || (model && new RegExp(`\\b${model}\\b`).test(t) && model !== "city") || (new RegExp(`\\b${a}\\b`).test(t) && !t.includes(" " + a + " " + b[0] + "x")); }) : [];
  if (mk.length) { e.makes = mk; e.desc.push(mk.length > 3 ? "that make" : mk.join(" / ")); }
  const STOP = new Set(["claim", "claims", "show", "list", "with", "that", "have", "dubai", "this", "from", "your", "mine", "open", "find", "which", "what", "about", "high", "medium", "risk", "fraud"]);
  const nm = D ? D.names.filter(n => t.includes(n.toLowerCase()) || n.toLowerCase().split(" ").some(w => w.length >= 4 && !STOP.has(w) && new RegExp(`\\b${w}\\b`).test(t))) : [];
  if (nm.length && nm.length <= 4) { e.names = nm; e.desc.push("insured " + nm.join(" / ")); }
  e.hasFilter = !!(e.status || e.fraud || e.sev || e.damage || e.min != null || e.max != null || e.since || e.mine || e.auth || e.rec || e.noAI || e.overdue || e.makes || e.names);
  return e;
}
function filterClaims(e, only) {
  const slaMs = 48 * 36e5, f = c => (!e.text || [c.claim_no, c.insured_name, c.make_model, c.reg_no, c.location, c.policy_no].join(" ").toLowerCase().includes(e.text)) && (!e.authName || (authOf(c) || "").toLowerCase() === e.authName.toLowerCase()) && (!e.status || c.status === e.status) && (!e.fraud || e.fraud.includes(fraudOf(c))) && (!e.sev || D.an[c.id]?.damage_severity === e.sev) && (!e.damage || c.damage_area === e.damage) && (e.min == null || +c.claimed_amount > e.min) && (e.max == null || +c.claimed_amount < e.max)
    && (!e.since || new Date(c.reported_on) >= e.since) && (!e.mine || c.assigned_to === ctx.user.id) && (!e.auth || (authOf(c) && authOf(c) !== "Underwriter" && OPEN.includes(c.status))) && (!e.rec || recOf(c).startsWith(e.rec)) && (!e.noAI || !D.R[c.id]?.fraud)
    && (!e.overdue || (OPEN.includes(c.status) && Date.now() - new Date(c.reported_on) > slaMs)) && (!e.makes || e.makes.includes(c.make_model)) && (!e.names || e.names.includes(c.insured_name));
  return only ? f(only) : D.claims.filter(f);
}

// ---------- response building ----------
const row = c => `<div class="cmr" data-open="${c.id}"><b>${c.claim_no}</b><span>${esc(c.insured_name)} · ${esc(c.make_model)}</span><i style="background:${STAT_BADGE[c.status] || "#64748b"}22;color:${STAT_BADGE[c.status] || "#64748b"}">${esc(c.status)}</i>${fraudOf(c) ? `<small>${fraudOf(c)} fraud</small>` : ""}</div>`;
const reply = (text, o = {}) => ({ text, ...o });
const nameOf = id => D.uws.find(u => u.id === id)?.name || "Unassigned";
const SETS = [[/senior (underwriter )?(approval )?limit/, "approval", "senior_limit_aed", "Senior underwriter limit", "AED", "approval"], [/underwriter (approval )?limit|underwriter authority/, "approval", "underwriter_limit_aed", "Underwriter approval limit", "AED", "approval"], [/medium (fraud )?(risk )?threshold/, "fraud", "medium_threshold", "Medium fraud threshold", "", "fraud"], [/high (fraud )?(risk )?threshold/, "fraud", "high_threshold", "High fraud threshold", "", "fraud"], [/late[- ]report(ing)?( hours| window)?/, "fraud", "late_report_hours", "Late-report window (hours)", "", "fraud"], [/daily (run|workflow)( cap| limit)?|run cap/, "ai_global", "daily_run_cap", "Daily AI run cap", "", "limits"], [/monthly token budget|token budget/, "ai_global", "monthly_token_budget", "Monthly token budget", "", "limits"], [/sla( hours)?|decision sla/, "sla", "decision_sla_hours", "Decision SLA (hours)", "", "sla"], [/latency alert|p95/, "ai_global", "alert_p95_latency_sec", "Latency alert (P95 seconds)", "", "limits"]];

async function localAnswer(q) {
  await load(); const e = parse(q), t = e.t, trim = t.trim();
  // pending confirmation
  if (pending) { const p = pending; if (/^(yes|y|yep|yeah|confirm|do it|go ahead|sure|ok|okay|apply|proceed)\b/.test(trim)) { pending = null; return p.run(); } if (/^(no|n|nope|cancel|stop|never ?mind|don'?t)\b/.test(trim)) { pending = null; return reply("No problem - I've cancelled that. Nothing was changed."); } pending = null; }
  if (/^(hi|hello|hey|good (morning|afternoon|evening)|yo)\b/.test(trim) && trim.split(" ").length <= 4) return reply(`Hello ${ctx.user.name.split(" ")[0]}! I can find claims, explain AI findings, open pages and run the AI agents. What would you like to do?`, { chips: ["Which claims need my attention?", "Show high fraud risk claims", "How are the AI agents performing?"] });
  if (/^(thanks|thank you|thx|great|perfect|cool|nice)\b/.test(trim)) return reply("You're welcome! Anything else you'd like me to look at?");
  if (/\bhelp\b|what can you do|how do i use/.test(t)) return reply("Ask me in plain English. For example:\n- **Find**: \"show high fraud risk rear collisions over 10k\", \"Toyota claims in review\"\n- **Explain**: \"why is CLM-0007806 flagged?\"\n- **Open**: \"open CLM-0007823 documents\"\n- **Alerts & reports**: \"critical alerts\", \"financial report\", \"agent latency\"\n- **Act**: \"run AI agents on CLM-0007840\", \"set underwriter limit to 30000\"\nWhatever I find, I also show in the app.");
  // change a setting
  if (/\b(set|change|update|increase|decrease|raise|lower|make)\b/.test(t) && /\d/.test(t)) { for (const [re, sec, key, label, unit, tabk] of SETS) if (re.test(t)) { const m = t.match(/(?:to|=|at)\s*(?:aed\s*)?(\d[\d,.]*)\s*(k|m)?/) || t.match(/(\d[\d,.]*)\s*(k|m)?\s*$/); if (!m) break; const v = Math.round(parseFloat(m[1].replace(/,/g, "")) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1));
    const cur = (await ctx.api(`uw_settings?key=eq.${sec}&select=value`))[0]?.value || {}; pending = { run: async () => { const nv = { ...cur, [key]: v }; await ctx.rpc("uw_save_setting", { p_key: sec, p_value: nv, p_user: ctx.user.name }); ctx.go("/settings/" + tabk); return reply(`Done - **${label}** is now **${unit ? aed(v) : v.toLocaleString()}** (was ${unit ? aed(cur[key]) : cur[key]}). I've opened the settings page. It takes effect on the next AI run.`, { applied: "Setting saved" }); } };
    return reply(`I can change **${label}** from **${unit ? aed(cur[key]) : cur[key]}** to **${unit ? aed(v) : v.toLocaleString()}**. Shall I apply it?`, { chips: ["Yes, apply it", "No, cancel"] }); } }
  const target = e.nos[0] || (/\b(it|this claim|that claim|this one|that one|the claim)\b/.test(t) && last.claim ? last.claim : null);
  // run AI agents
  if (/\b(run|start|trigger|kick ?off|re-?run|execute|analy[sz]e)\b/.test(t) && /\b(ai|agents?|analysis|claim)\b/.test(t) && target) { const c = D.byNo[target]; if (!c) return reply(`I couldn't find ${target}.`); last.claim = target; window.__autoRun = c.id; ctx.go(`/claim/${c.id}/ai`); return reply(`Starting the AI agents on **${c.claim_no}** now. I've opened its AI Analysis tab - you'll see DocuMind, VisionAssess, FraudShield, RepairIQ and UnderwriteIQ progress live, then the outcome.`, { applied: "Opened AI Analysis and started the Kore workflow" }); }
  // open / explain a claim
  if (target && D.byNo[target]) { const c = D.byNo[target]; last.claim = target;
    const tabw = /document|attachment|photo|image|upload/.test(t) ? "documents" : /decision|recommend|approve|reject authority|sign[- ]?off/.test(t) ? "decision" : /garage|estimate/.test(t) ? "garage" : /timeline|progress|history/.test(t) ? "timeline" : /vehicle|car details/.test(t) ? "vehicle" : /\bai\b|analysis|agents?|fraud|findings/.test(t) ? "ai" : "overview";
    if (/\b(open|show|view|go to|take me|display|pull up)\b/.test(t) || trim.replace(/clm[-\s]?\d+/i, "").trim().length < 3) { ctx.go(`/claim/${c.id}/${tabw}`); return reply(`Opening **${c.claim_no}** (${c.insured_name}, ${c.make_model}) - ${tabw === "overview" ? "overview" : tabw} tab.`, { applied: "Navigated to the claim", chips: ["Why is it flagged?", "Run AI agents on it"] }); }
    return explain(c); }
  if (e.nos.length && !D.byNo[e.nos[0]]) return reply(`I couldn't find **${e.nos[0]}**. Claim numbers run from CLM-0007770 upwards - try one of those, or describe the claim.`);
  // alerts
  if (/alert|alarm|notification|warnings?\b/.test(t)) { const types = [[/latency|slow/, "latency"], [/token/, "tokens"], [/fraud/, "fraud"], [/sla|overdue/, "sla"], [/fail/, "failure"], [/confidence/, "confidence"], [/garage/, "garage"], [/run cap|daily run/, "runcap"], [/new claims?|intake/, "intake"]], ty = types.find(([re]) => re.test(t))?.[1], sev = /critical|urgent|severe/.test(t) ? "critical" : /warning/.test(t) ? "warning" : null, status = /resolved|closed/.test(t) ? "resolved" : "open";
    const list = D.alerts.filter(a => (status === "open" ? a.status !== "resolved" : a.status === "resolved") && (!ty || a.type === ty) && (!sev || a.severity === sev)); window.__alertPreset = { type: ty, sev, status }; ctx.go("/alerts");
    const cs = list.filter(a => a.severity === "critical").length; return reply(`You have **${list.length}** ${status === "open" ? "open " : "resolved "}${sev || ""} ${ty ? ty + " " : ""}alert${list.length === 1 ? "" : "s"}${list.length ? ` (${cs} critical)` : ""}. I've opened **My Alerts** with that filter.${list.length ? "\n\nTop items:\n" + list.slice(0, 4).map(a => "- " + a.title).join("\n") : ""}`, { applied: "Opened My Alerts with filters", chips: ["Critical alerts only", "Latency alerts"] }); }
  // agent performance
  if (/\b(agents?|documind|visionassess|fraudshield|repairiq|underwriteiq)\b|latency|tokens?|failure rate|throughput|confidence/.test(t) && !e.hasFilter) { const st = D.stats, keys = ["doc", "img", "fraud", "repair", "uw"], nm = { doc: "DocuMind", img: "VisionAssess", fraud: "FraudShield", repair: "RepairIQ", uw: "UnderwriteIQ" }, tot = keys.reduce((a, k) => a + (st[k]?.tokens_in || 0) + (st[k]?.tokens_out || 0), 0), one = keys.find(k => new RegExp(nm[k].toLowerCase()).test(t));
    ctx.go("/reports/agents"); if (one) { const s = st[one]; return reply(`**${nm[one]}**: ${s.runs} runs, ${Math.round(s.successful_runs / s.runs * 100)}% success, average latency **${(s.avg_latency_ms / 1000).toFixed(1)}s** (P95 ${(s.p95_latency_ms / 1000).toFixed(1)}s), **${((s.tokens_in + s.tokens_out) / 1000).toFixed(0)}K** tokens (${Math.round((s.tokens_in + s.tokens_out) / s.runs).toLocaleString()} per run). I've opened the AI Agents report.`, { applied: "Opened Reports → AI Agents" }); }
    return reply(`All **5 agents are online**. Across **${st.workflow?.runs || 0}** workflow runs they've used **${(tot / 1e6).toFixed(2)}M tokens**; an end-to-end claim takes about **${((st.workflow?.avg_latency_ms || 0) / 1000).toFixed(0)}s**. Slowest: ${keys.sort((a, b) => st[b].avg_latency_ms - st[a].avg_latency_ms).slice(0, 2).map(k => `${nm[k]} (${(st[k].avg_latency_ms / 1000).toFixed(1)}s)`).join(", ")}. I've opened the AI Agents report.`, { applied: "Opened Reports → AI Agents", chips: ["Show latency alerts", "Token usage by agent"] }); }
  // navigation to pages
  const nav = trim.match(/\b(go to|open|show|take me to|navigate to|switch to)\b.*\b(dashboard|home|my queue|queue|reports?|settings?|claims list|all claims|alerts)\b/);
  if (nav && !e.hasFilter) { const w = nav[2]; if (/report/.test(w)) { const tb = /financ|money|payout|cost/.test(t) ? "financial" : /fraud|risk/.test(t) ? "risk" : /underwrit|workload|sla/.test(t) ? "underwriting" : /agent|ai/.test(t) ? "agents" : "portfolio"; ctx.go("/reports/" + tb); return reply(`Opened the **${{ financial: "Financial", risk: "Risk & Fraud", underwriting: "Underwriting", agents: "AI Agents", portfolio: "Portfolio" }[tb]}** report.`, { applied: "Navigated to Reports" }); }
    if (/setting/.test(w)) { const tb = /approval|authority|limit/.test(t) ? "approval" : /fraud/.test(t) ? "fraud" : /agent|model/.test(t) ? "agents" : /budget|token|run/.test(t) ? "limits" : /sla|alert/.test(t) ? "sla" : /privacy/.test(t) ? "privacy" : "profile"; ctx.go("/settings/" + tb); return reply(`Opened **Settings**${tb !== "profile" ? " → " + tb : ""}.`, { applied: "Navigated to Settings" }); }
    const dest = /queue/.test(w) ? "/queue" : /alert/.test(w) ? "/alerts" : /claims list|all claims/.test(w) ? "/claims" : "/dashboard"; ctx.go(dest); return reply(`Taking you to ${dest.slice(1)}.`, { applied: "Navigated" }); }
  if (/report|analytics|insights?/.test(t) && !e.hasFilter) { const tb = /financ|money|payout|cost/.test(t) ? "financial" : /fraud|risk/.test(t) ? "risk" : /underwrit|workload|sla/.test(t) ? "underwriting" : /agent|ai/.test(t) ? "agents" : "portfolio"; ctx.go("/reports/" + tb); return reply(`Here's the **${tb}** report - I've opened it for you.`, { applied: "Navigated to Reports" }); }
  // statistics
  if (/how many|count|number of|total|average|avg|sum of|how much|approval rate|rejection rate|payout|paid out|exposure/.test(t)) { const list = filterClaims(e), desc = e.desc.join(", ");
    if (/paid out|payout|payments?/.test(t) && !e.hasFilter) { const tot = D.pays.reduce((a, p) => a + +p.amount, 0); return reply(`**${D.pays.length}** payments have been released, totalling **${aed(tot)}** (average ${aed(tot / Math.max(D.pays.length, 1))}).`, { chips: ["Show closed claims", "Financial report"] }); }
    if (/approval rate|rejection rate/.test(t)) { const dec = D.claims.filter(c => ["Approved", "Closed", "Rejected"].includes(c.status)), ok = dec.filter(c => c.status !== "Rejected").length; return reply(`Of **${dec.length}** decided claims, **${ok}** were approved (**${Math.round(ok / dec.length * 100)}%**) and **${dec.length - ok}** rejected.`); }
    if (/exposure/.test(t)) { const open = D.claims.filter(c => OPEN.includes(c.status)); return reply(`Open exposure is about **${aed(open.reduce((a, c) => a + midOf(c), 0))}** across **${open.length}** open claims (AI repair estimates).`, { chips: ["Financial report"] }); }
    if (/average|avg/.test(t)) { const v = list.filter(c => midOf(c)); return reply(`The average AI repair estimate${desc ? " for " + desc : ""} is **${aed(v.reduce((a, c) => a + midOf(c), 0) / Math.max(v.length, 1))}** across ${v.length} claims.`); }
    ctx.showClaims(list.map(c => c.id), desc || "all claims"); last.ids = list.map(c => c.id); last.label = desc;
    return reply(`There ${list.length === 1 ? "is" : "are"} **${list.length}** claim${list.length === 1 ? "" : "s"}${desc ? " matching " + desc : " in total"}, worth **${aed(list.reduce((a, c) => a + (+c.claimed_amount || 0), 0))}** claimed. I've filtered the Claims list so you can see them.`, { list: list.slice(0, 5), applied: "Filtered the Claims list" }); }
  // open the latest / newest claim
  if (/\b(open|go to|take me|view|pull up|show me)\b/.test(t) && /\b(latest|newest|most recent|last)\b/.test(t)) { const pool = (e.status ? D.claims.filter(c => c.status === e.status) : D.claims).slice().sort((x, y) => new Date(y.reported_on) - new Date(x.reported_on)), c = pool[0];
    if (!c) return reply(`There are no ${e.status ? e.status.toLowerCase() + " " : ""}claims right now.`, { chips: ["Show all open claims"] }); last.claim = c.claim_no; ctx.go(`/claim/${c.id}/overview`); return reply(`${e.status === "New" && c.status !== "New" ? "There are no unopened new claims right now - " : ""}Opening the most recent${e.status ? " " + e.status.toLowerCase() : ""} claim: **${c.claim_no}** (${c.insured_name}, ${c.make_model}), reported ${ago(c.reported_on)}.`, { applied: "Opened the claim", chips: ["Why is it flagged?", "Run AI agents on it"] }); }
  // filter / list claims
  if (e.hasFilter || /\b(show|list|find|which|search|get me|display|who|any)\b/.test(t)) { if (e.hasFilter) { const list = filterClaims(e), label = e.desc.join(" · "); list.sort((a, b) => (scoreOf(b) || 0) - (scoreOf(a) || 0) || new Date(b.reported_on) - new Date(a.reported_on)); last.ids = list.map(c => c.id); last.label = label;
      if (!list.length) return reply(`I couldn't find any claims matching **${label}**. Try loosening the criteria.`, { chips: ["Show all open claims", "Show high fraud risk claims"] });
      ctx.showClaims(list.map(c => c.id), label); const top = list[0];
      return reply(`I found **${list.length}** claim${list.length === 1 ? "" : "s"} matching **${label}**. I've filtered the Claims list in the app.${e.fraud ? ` The highest fraud score is **${top.claim_no}** (${scoreOf(top) ?? "n/a"}/100).` : ""}`, { list: list.slice(0, 6), applied: "Filtered the Claims list", chips: list.length > 1 ? ["Open " + top.claim_no, "Why is " + top.claim_no + " flagged?"] : ["Run AI agents on it"] }); }
    const words = t.replace(/\b(show|list|find|which|search|get|me|display|who|any|for|the|of|claims?|all|please|about)\b/g, " ").trim(); if (words.length > 2) { const hits = D.claims.filter(c => [c.claim_no, c.insured_name, c.make_model, c.reg_no, c.policy_no, c.location].join(" ").toLowerCase().includes(words)); if (hits.length) { ctx.showClaims(hits.map(c => c.id), `"${words}"`); return reply(`I found **${hits.length}** claim${hits.length === 1 ? "" : "s"} matching "${words}" and filtered the Claims list.`, { list: hits.slice(0, 5), applied: "Filtered the Claims list" }); } } }
  // "needs attention"
  if (/attention|priorit|urgent|what should i|to ?do|where (do|should) i start|focus/.test(t)) { const crit = D.alerts.filter(a => a.status !== "resolved" && a.severity === "critical").length, newc = D.claims.filter(c => c.status === "New"), highF = D.claims.filter(c => fraudOf(c) === "High" && OPEN.includes(c.status)), over = D.claims.filter(c => OPEN.includes(c.status) && Date.now() - new Date(c.reported_on) > 5 * 864e5);
    const ids = [...new Set([...newc, ...highF].map(c => c.id))]; ctx.showClaims(ids.length ? ids : over.map(c => c.id), "needs attention"); return reply(`Here's where I'd start:\n- **${newc.length}** new claim${newc.length === 1 ? "" : "s"} not yet opened\n- **${highF.length}** open claim${highF.length === 1 ? "" : "s"} with High fraud risk\n- **${over.length}** open claims older than 5 days (escalation)\n- **${crit}** critical alerts in My Alerts\n\nI've filtered the Claims list to the most urgent ones.`, { applied: "Filtered the Claims list", chips: ["Show critical alerts", "Show claims older than the SLA"] }); }
  return reply("I'm not sure I understood that. I can search claims, explain a claim's AI findings, open pages, show alerts and reports, run the AI agents, or change thresholds. Try one of these:", { chips: ["Show high fraud risk claims", "Which claims need my attention?", "How many claims are in review?", "Critical alerts"] });
}
function explain(c) {
  const a = D.an[c.id], r = D.R[c.id] || {}, f = r.fraud, docsNote = c.status === "Pending Documents" ? "Documents are still outstanding." : "";
  let txt = `**${c.claim_no}** - ${c.insured_name}, ${c.make_model} (${c.reg_no}). Status **${c.status}**, reported ${ago(c.reported_on)} after a ${String(c.accident_type || "").toLowerCase()} at ${c.location}. Claimed ${aed(c.claimed_amount)}.`;
  if (!f) txt += `\n\nThe AI agents **haven't analysed this claim yet**. Shall I run them?`;
  else { const flags = (f.findings || []).filter(x => x.level !== "ok").slice(0, 3).map(x => "- " + x.text);
    txt += `\n\n**Fraud:** ${f.metrics.fraud_risk} (${f.metrics.score}/100)${flags.length ? " because:\n" + flags.join("\n") : " - no concerns raised."}\n**Damage:** ${a?.damage_severity || "n/a"}${a?.repair_min ? `, repair band ${aed(a.repair_min)} - ${aed(a.repair_max)}` : ""}.\n**UnderwriteIQ:** ${r.uw?.headline || recOf(c) || "no recommendation yet"}${authOf(c) ? ` (approval authority: ${authOf(c)})` : ""}. ${docsNote}`; }
  return reply(txt, { actions: [["Open claim", `/claim/${c.id}/overview`], ["AI analysis", `/claim/${c.id}/ai`], ["Decision", `/claim/${c.id}/decision`]], chips: f ? [] : ["Run AI agents on it"] });
}

// ---------- LLM path (Kore chat agent via the bridge worker) ----------
const CAN = { status: ["New", "Pending Underwriting", "In Review", "Pending Documents", "Pending Garage Estimate", "Approved", "Closed", "Rejected"], sev: ["High", "Medium", "Low"] };
const canon = (v, list) => list.find(x => x.toLowerCase() === String(v || "").toLowerCase());
function specToE(f) {
  const e = { desc: [] }; if (!f) return e; const n = x => (x === "" || x == null ? null : parseFloat(String(x).replace(/,/g, "")));
  if (canon(f.status, CAN.status)) e.status = canon(f.status, CAN.status);
  if (f.fraud) e.fraud = String(f.fraud).split(",").map(x => canon(x.trim(), ["High", "Medium", "Low"])).filter(Boolean);
  if (canon(f.severity, CAN.sev)) e.sev = canon(f.severity, CAN.sev);
  if (f.damage) e.damage = String(f.damage).toLowerCase();
  if (n(f.min_claimed) != null) e.min = n(f.min_claimed); if (n(f.max_claimed) != null) e.max = n(f.max_claimed);
  if (n(f.days)) e.since = Date.now() - n(f.days) * 864e5;
  if (String(f.overdue) === "true") e.overdue = true; if (String(f.no_ai) === "true") e.noAI = true;
  if (f.recommendation) e.rec = /reject/i.test(f.recommendation) ? "Reject" : /approv/i.test(f.recommendation) ? "Approve" : "Request";
  if (f.authority) e.authName = String(f.authority);
  if (f.make) e.makes = D.makes.filter(m => m.toLowerCase().includes(String(f.make).toLowerCase()));
  if (f.insured) e.names = D.names.filter(m => m.toLowerCase().includes(String(f.insured).toLowerCase()));
  if (f.text) e.text = String(f.text).toLowerCase();
  return e;
}
const SETKEYS = { "approval.underwriter_limit_aed": ["Underwriter approval limit", "AED", "approval"], "approval.senior_limit_aed": ["Senior underwriter limit", "AED", "approval"], "fraud.medium_threshold": ["Medium fraud threshold", "", "fraud"], "fraud.high_threshold": ["High fraud threshold", "", "fraud"], "fraud.late_report_hours": ["Late-report window (hours)", "", "fraud"], "ai_global.daily_run_cap": ["Daily AI run cap", "", "limits"], "ai_global.monthly_token_budget": ["Monthly token budget", "", "limits"], "sla.decision_sla_hours": ["Decision SLA (hours)", "", "sla"], "ai_global.alert_p95_latency_sec": ["Latency alert (P95 seconds)", "", "limits"] };
async function runActions(actions, out) {
  for (const x of (actions || []).slice(0, 3)) {
    try {
      if (x.type === "show_claims") { const e = specToE(x.filter), list = D.claims.filter(c => filterClaims(e, c)).sort((p, q) => (scoreOf(q) || 0) - (scoreOf(p) || 0) || new Date(q.reported_on) - new Date(p.reported_on)); last.ids = list.map(c => c.id); last.label = x.label || "results"; ctx.showClaims(last.ids, last.label); out.list = list.slice(0, 6); out.applied = `Filtered the Claims list (${list.length})`; }
      else if (x.type === "open_claim" && D.byNo[String(x.claim_no).toUpperCase()]) { const c = D.byNo[String(x.claim_no).toUpperCase()]; last.claim = c.claim_no; ctx.go(`/claim/${c.id}/${x.tab || "overview"}`); out.applied = `Opened ${c.claim_no}`; }
      else if (x.type === "open_page") { const p = x.page, tb = x.tab; ctx.go(p === "reports" ? "/reports/" + (tb || "portfolio") : p === "settings" ? "/settings/" + (tb || "profile") : "/" + (p === "claims" ? "claims" : p)); out.applied = "Opened " + p + (tb ? " → " + tb : ""); }
      else if (x.type === "alerts_filter") { window.__alertPreset = { type: x.alert_type, sev: x.severity, status: x.status || "open" }; ctx.go("/alerts"); out.applied = "Opened My Alerts with filters"; }
      else if (x.type === "run_ai" && D.byNo[String(x.claim_no).toUpperCase()]) { const c = D.byNo[String(x.claim_no).toUpperCase()]; last.claim = c.claim_no; window.__autoRun = c.id; ctx.go(`/claim/${c.id}/ai`); out.applied = `Started the AI agents on ${c.claim_no}`; }
      else if (x.type === "set_setting" && SETKEYS[x.setting] && Number.isFinite(+x.value)) { const [sec, key] = x.setting.split("."), [label, unit, tabk] = SETKEYS[x.setting], v = Math.round(+x.value);
        const cur = (await ctx.api(`uw_settings?key=eq.${sec}&select=value`))[0]?.value || {};
        pending = { run: async () => { await ctx.rpc("uw_save_setting", { p_key: sec, p_value: { ...cur, [key]: v }, p_user: ctx.user.name }); ctx.go("/settings/" + tabk); return reply(`Done - **${label}** is now **${unit ? aed(v) : v.toLocaleString()}** (was ${unit ? aed(cur[key]) : cur[key]}). It takes effect on the next AI run.`, { applied: "Setting saved" }); } };
        out.chips = ["Yes, apply it", "No, cancel"]; out.applied = null; }
    } catch (_) { /* skip a bad action */ }
  }
}
async function llmAnswer(q) {
  const hist = msgs.slice(-8).map(m => ({ role: m.role, text: String(m.text || "").replace(/\*\*/g, "").slice(0, 400) })), prompt = JSON.stringify({ message: q, history: hist, context: { page: location.hash, last_claim: last.claim, active_list: last.label || null, user: ctx.user.name.split(" ")[0] } });
  const j = await ctx.rpc("uw_chat_request", { p_session: ctx.user.id, p_prompt: prompt }); const t0 = Date.now();
  for (;;) { await sleep(700); const r = await ctx.rpc("uw_chat_poll", { p_id: j.id }); if (r && r.status === "done") { var raw = r.reply; break; } if (r && r.status === "failed") throw new Error(r.error || "failed"); if (Date.now() - t0 > 45000) throw new Error("timeout"); }
  let p; try { p = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()); } catch (_) { const m = raw.match(/\{[\s\S]*\}/); try { p = JSON.parse(m[0]); } catch (__) { p = { reply: raw, actions: [], chips: [] }; } }
  const out = { chips: (p.chips || []).slice(0, 3) }; await runActions(p.actions, out); return reply(p.reply || "Done.", out);
}
async function workerUp() { try { const w = await ctx.api("uw_agent_stats?agent_key=eq.worker&select=updated_at"); return !!w[0] && Date.now() - new Date(w[0].updated_at) < 25000; } catch (_) { return false; } }
let kore = null;
async function answer(q) {
  await load(); const trim = q.toLowerCase().trim();
  if (pending && /^(yes|y|yep|yeah|confirm|do it|go ahead|sure|ok|okay|apply|proceed|no|n|nope|cancel|stop|never ?mind)\b/.test(trim)) return localAnswer(q);
  pending = null; kore = await workerUp(); setBadge();
  if (kore) { try { return await llmAnswer(q); } catch (e) { kore = false; setBadge(); } }
  const r = await localAnswer(q); r.text += "\n\n_Kore AI is offline, so I used the built-in search._"; return r;
}
function setBadge() { const b = root?.querySelector("#cmode"); if (b) { b.className = kore ? "on" : ""; b.textContent = kore ? "Powered by Kore Agent Platform · GPT-5.2" : "Offline mode · built-in search"; } }
// ---------- UI ----------
const sug = ["Which claims need my attention today?", "Show high fraud risk claims", "How are the AI agents performing?", "Open the latest new claim"];
function build() {
  fab = document.createElement("button"); fab.className = "cfab"; fab.title = "ClaimAssist Assistant"; fab.innerHTML = ctx.logo();
  root = document.createElement("aside"); root.className = "cpanel"; document.body.append(fab, root); fab.onclick = () => toggle(true);
}
function toggle(v) { opened = v; if (v && kore === null) workerUp().then(x => { kore = x; setBadge(); }); root.classList.toggle("open", v); fab.style.display = v ? "none" : ""; document.body.classList.toggle("chat-open", v); document.body.classList.toggle("chat-wide", v && wide); if (v) { render(); setTimeout(() => root.querySelector("#cin")?.focus(), 250); } }
function bubble(m, i) {
  if (m.role === "user") return `<div class="cm u"><div class="cb">${esc(m.text)}</div></div>`;
  const star = (LS.get("uw_bm", []).some(b => b.a === m.text)) ? "★" : "☆";
  return `<div class="cm a"><div class="cav">${ctx.logo()}</div><div class="cb">${md(m.text)}${m.list ? `<div class="cml">${m.list.map(row).join("")}</div>` : ""}${m.actions ? `<div class="cac">${m.actions.map(([l, h]) => `<button data-go="${h}">${l}</button>`).join("")}</div>` : ""}${m.applied ? `<div class="capp">✓ ${esc(m.applied)}</div>` : ""}<div class="ctl"><button data-bm="${i}" title="Bookmark">${star}</button></div></div></div>${m.chips ? `<div class="cch">${m.chips.map(c => `<button data-chip="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : ""}`;
}
function render() {
  const first = ctx.user.name.split(" ")[0];
  let body;
  if (tab === "chat") body = msgs.length ? `<div class="cms" id="cms">${msgs.map(bubble).join("")}${busy ? `<div class="cm a"><div class="cav">${ctx.logo()}</div><div class="cb typing"><i></i><i></i><i></i></div></div>` : ""}</div>` :
    `<div class="chello"><h2>Hello ${esc(first)}!</h2><h2 class="dim">What would you like to do?</h2></div><div class="csug">${sug.map(s => `<button data-chip="${esc(s)}"><span>${esc(s)}</span><i>➜</i></button>`).join("")}</div>`;
  else if (tab === "queries") { const q = LS.get("uw_q", []); body = `<div class="clist">${q.length ? q.map(x => `<button data-chip="${esc(x.q)}"><b>${esc(x.q)}</b><small>${ago(x.t)}</small></button>`).join("") : `<div class="cempty">Your recent questions will appear here.</div>`}</div>`; }
  else { const b = LS.get("uw_bm", []); body = `<div class="clist">${b.length ? b.map((x, i) => `<div class="cbm"><button data-chip="${esc(x.q)}"><b>${esc(x.q)}</b><small>${esc(x.a.replace(/\*\*/g, "").slice(0, 140))}…</small></button><button class="rm" data-rmbm="${i}" title="Remove">✕</button></div>`).join("") : `<div class="cempty">Star an answer (☆) to bookmark it.</div>`}</div>`; }
  root.innerHTML = `<div class="chd"><div><b>ClaimAssist Assistant</b><small id="cmode"></small></div><div><button id="cnew" title="New chat">＋</button><button id="cexp" title="Expand">⤢</button><button id="cx" title="Close">✕</button></div></div>
    <div class="ctabs">${[["chat", "Chat"], ["queries", "Queries"], ["bm", "Bookmarks"]].map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? "on" : ""}">${l}</button>`).join("")}</div><div class="cbody">${body}</div>
    <div class="cinp"><button id="cmic" title="Voice input">🎙</button><input id="cin" placeholder="Ask me anything" autocomplete="off"><button id="csend" title="Send">➤</button></div>`;
  setBadge(); const sc = root.querySelector("#cms"); if (sc) sc.scrollTop = sc.scrollHeight;
  root.querySelector("#cx").onclick = () => toggle(false); root.querySelector("#cnew").onclick = () => { msgs = []; pending = null; sessionStorage.removeItem("uw_chat"); tab = "chat"; render(); };
  root.querySelector("#cexp").onclick = () => { wide = !wide; document.body.classList.toggle("chat-wide", wide); };
  root.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
  root.querySelectorAll("[data-chip]").forEach(b => b.onclick = () => { tab = "chat"; send(b.dataset.chip); });
  root.querySelectorAll("[data-go]").forEach(b => b.onclick = () => ctx.go(b.dataset.go));
  root.querySelectorAll("[data-open]").forEach(b => b.onclick = () => ctx.go(`/claim/${b.dataset.open}/overview`));
  root.querySelectorAll("[data-bm]").forEach(b => b.onclick = () => { const m = msgs[+b.dataset.bm], q = msgs[+b.dataset.bm - 1]?.text || "", bm = LS.get("uw_bm", []), ix = bm.findIndex(x => x.a === m.text); if (ix >= 0) bm.splice(ix, 1); else bm.unshift({ q, a: m.text, t: Date.now() }); LS.set("uw_bm", bm.slice(0, 40)); render(); });
  root.querySelectorAll("[data-rmbm]").forEach(b => b.onclick = () => { const bm = LS.get("uw_bm", []); bm.splice(+b.dataset.rmbm, 1); LS.set("uw_bm", bm); render(); });
  const inp = root.querySelector("#cin"); inp.onkeydown = e => { if (e.key === "Enter" && inp.value.trim()) { send(inp.value.trim()); } if (e.key === "ArrowUp") { const q = LS.get("uw_q", [])[0]; if (q && !inp.value) inp.value = q.q; } };
  root.querySelector("#csend").onclick = () => { if (inp.value.trim()) send(inp.value.trim()); };
  root.querySelector("#cmic").onclick = () => { const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return ctx.toast("Voice input isn't supported in this browser"); if (rec) { rec.stop(); return; } rec = new SR(); rec.lang = "en-US"; rec.onresult = ev => { inp.value = ev.results[0][0].transcript; }; rec.onend = () => { rec = null; root.querySelector("#cmic")?.classList.remove("rec"); if (inp.value.trim()) send(inp.value.trim()); }; root.querySelector("#cmic").classList.add("rec"); rec.start(); };
}
async function send(text) {
  if (busy) return; tab = "chat"; msgs.push({ role: "user", text }); busy = true; const q = LS.get("uw_q", []).filter(x => x.q !== text); q.unshift({ q: text, t: Date.now() }); LS.set("uw_q", q.slice(0, 40)); render();
  let r; try { r = await answer(text); } catch (e) { r = reply("Sorry, something went wrong while looking that up: " + e.message); }
  msgs.push({ role: "assistant", ...r }); busy = false; sessionStorage.setItem("uw_chat", JSON.stringify(msgs.slice(-30))); if (!opened) toggle(true); else render();
}
window.Assistant = {
  init(c) { ctx = c; msgs = JSON.parse(sessionStorage.getItem("uw_chat") || "[]"); build(); load().catch(() => { }); },
  destroy() { root?.remove(); fab?.remove(); document.body.classList.remove("chat-open", "chat-wide"); D = null; msgs = []; sessionStorage.removeItem("uw_chat"); },
};
})();
