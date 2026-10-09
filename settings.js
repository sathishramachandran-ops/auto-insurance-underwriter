// Settings console: AI configuration, limits & budgets, approval authority, fraud thresholds, SLA, privacy. Stored in Supabase (uw_settings).
(() => {
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const aed = n => "AED " + Math.round(n || 0).toLocaleString("en-US");
const kfmt = n => n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(Math.round(n));
const get = (o, p) => p.split(".").reduce((a, k) => a?.[k], o);
const setp = (o, p, v) => { const ks = p.split("."); let a = o; ks.slice(0, -1).forEach(k => a = a[k] ??= {}); a[ks.at(-1)] = v; };
const clone = o => JSON.parse(JSON.stringify(o));
const NAMES = { doc: "DocuMind", img: "VisionAssess", fraud: "FraudShield", repair: "RepairIQ", uw: "UnderwriteIQ" };
const MODELS = [["GPT-5.2", "Balanced quality and speed (current)"], ["GPT-5.2-mini", "Faster and cheaper, lighter reasoning"], ["GPT-5.4", "Highest quality, slower"]];
const TABS = [["profile", "Profile & preferences", "👤"], ["agents", "AI agents", "🤖"], ["limits", "Limits & budgets", "🎚️"], ["approval", "Approval authority", "✅"], ["fraud", "Fraud & risk", "🛡️"], ["sla", "SLA & alerts", "⏱️"], ["privacy", "Privacy & audit", "🔒"], ["log", "Change log", "🕘"]];
const SECTION_OF = { agents: ["ai_agents", "ai_global"], limits: ["ai_global"], approval: ["approval"], fraud: ["fraud"], sla: ["sla"], privacy: ["privacy"] };

// ---------- controls ----------
const badge = t => t === "e" ? `<span class="eb enf" title="Applied by the backend rules on the next AI run">Enforced</span>` : `<span class="eb adv" title="Stored policy / mirrors the Kore agent config; applied when the agent deployment is synced">Policy</span>`;
const sl = (path, label, { min, max, step = 1, fmt = v => v, hint = "", e = "a", marks = [] } = {}) => `<div class="sl" data-sl="${path}"><div class="slh"><label>${label} ${badge(e)}</label><b class="bub" data-show="${path}" data-fmt="${fmt.name}">…</b></div>
  <input type="range" data-path="${path}" data-num="1" min="${min}" max="${max}" step="${step}"><div class="sld"><span>${fmt(min)}</span>${marks.map(m => `<span>${m}</span>`).join("")}<span>${fmt(max)}</span></div>${hint ? `<small class="shint">${hint}</small>` : ""}</div>`;
const sw = (path, label, hint = "", e = "a") => `<label class="swr"><span><b>${label} ${badge(e)}</b>${hint ? `<small>${hint}</small>` : ""}</span><span class="sw"><input type="checkbox" data-path="${path}"><i></i></span></label>`;
const radios = (path, opts, cols = 3) => `<div class="rcs" style="grid-template-columns:repeat(${cols},1fr)">${opts.map(([v, t, d]) => `<label class="rc"><input type="radio" name="${path}" value="${esc(v)}" data-path="${path}"><span><b>${t}</b>${d ? `<small>${d}</small>` : ""}</span></label>`).join("")}</div>`;
const pills = (path, opts) => `<div class="pills">${opts.map(([v, t]) => `<label class="pl"><input type="radio" name="${path}" value="${esc(v)}" data-path="${path}"><span>${t}</span></label>`).join("")}</div>`;
const txt = (path, label, ph = "") => `<label class="tf"><span>${label}</span><input type="text" data-path="${path}" placeholder="${ph}"></label>`;
const card = (title, sub, body, cls = "") => `<div class="card stc ${cls}"><div class="sth"><h4>${title}</h4>${sub ? `<small>${sub}</small>` : ""}</div>${body}</div>`;
const FMT = { aed, kfmt, pct: v => v + "%", hrs: v => v + " h", days: v => v + " d", sec: v => v + " s", num: v => v, temp: v => (+v).toFixed(2), conf: v => v + "%", score: v => v + "/100", tamper: v => (+v).toFixed(2) };

// ---------- mount ----------
async function mount(el, ctx) {
  const { api, rpc, user, toast } = ctx;
  el.innerHTML = `<div class="spin">Loading settings…</div>`;
  const [rows, audit, stats, runs, claims] = await Promise.all([api("uw_settings?select=*"), api("uw_settings_audit?select=*&order=changed_at.desc&limit=60"), api("uw_agent_stats?select=*"), api("uw_ai_agent_runs?select=agent_key,completed_at"), ctx.claims()]);
  let cfg = Object.fromEntries(rows.map(r => [r.key, r.value])), draft = clone(cfg), log = audit, tab = TABS.some(x => x[0] === ctx.tab) ? ctx.tab : "profile";
  const prefs = JSON.parse(localStorage.getItem("uw_prefs") || '{"landing":"dashboard","density":"comfortable"}');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const runsToday = k => runs.filter(r => r.agent_key === k && new Date(r.completed_at) >= today).length;
  const st = Object.fromEntries(stats.map(s => [s.agent_key, s]));

  const diff = (sec) => { const out = []; const walk = (a, b, p) => { for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) { const x = a?.[k], y = b?.[k]; if (x && y && typeof x === "object" && typeof y === "object") walk(x, y, p + k + "."); else if (JSON.stringify(x) !== JSON.stringify(y)) out.push([p + k, x, y]); } }; walk(cfg[sec], draft[sec], ""); return out; };
  const dirtyOf = t => (SECTION_OF[t] || []).flatMap(s => diff(s).map(d => [s, ...d]));

  // ----- tab bodies -----
  const B = {};
  B.profile = () => card("Your profile", "", `<dl class="kv"><dt>Name</dt><dd>${esc(user.name)}</dd><dt>Email</dt><dd>${esc(user.email)}</dd><dt>Role</dt><dd>${esc(user.role)}</dd><dt>Data source</dt><dd>Supabase · Kore Agent Platform (prod)</dd></dl>`) +
    card("Preferences", "Saved in this browser", `<div class="fld"><label>Landing page after sign-in</label>${radios("p.landing", [["dashboard", "Dashboard", "KPIs and AI agent team"], ["claims", "Claims", "Full claims list"], ["reports", "Reports", "Analytics dashboards"]])}</div>
    <div class="fld"><label>Table density</label>${radios("p.density", [["comfortable", "Comfortable", "More breathing room"], ["compact", "Compact", "Fit more rows on screen"]], 2)}</div>`);

  B.agents = () => card("AI analysis pipeline", "Applies to all five agents", `${sw("ai_global.enabled", "AI analysis enabled", "Master switch. When off, no agent runs are started.")}
    <div class="fld"><label>Execution mode ${badge("a")}</label>${radios("ai_global.parallel_agents", [[true, "Parallel", "DocuMind, VisionAssess, FraudShield and RepairIQ run together (fastest, about 20s per claim)"], [false, "Sequential", "One agent at a time (slower, easier to trace)"]], 2)}</div>`) +
    Object.keys(NAMES).map(k => `<div class="card stc agp" data-agent="${k}"><div class="sth"><h4><img class="mini2" alt="" src="${ctx.avatar(k)}"> ${NAMES[k]} <small class="rl">${ctx.role(k)}</small></h4>${sw(`ai_agents.${k}.enabled`, "Enabled")}</div>
    <div class="fld"><label>Model ${badge("a")}</label>${radios(`ai_agents.${k}.model`, MODELS.map(([m, d]) => [m, m, d]))}</div>
    <div class="g3">${sl(`ai_agents.${k}.temperature`, "Temperature", { min: 0, max: 1, step: .05, fmt: FMT.temp, hint: "Lower = more deterministic" })}${sl(`ai_agents.${k}.max_tokens`, "Max tokens per call", { min: 500, max: 8000, step: 250, fmt: FMT.kfmt })}${sl(`ai_agents.${k}.max_iterations`, "Max reasoning iterations", { min: 2, max: 20, fmt: FMT.num })}</div>
    <div class="g3">${sl(`ai_agents.${k}.daily_run_limit`, "Daily run limit", { min: 0, max: 1000, step: 10, fmt: FMT.num, hint: `Today: <b>${runsToday(k)}</b> runs` })}${sl(`ai_agents.${k}.daily_token_budget`, "Daily token budget", { min: 100000, max: 5000000, step: 100000, fmt: FMT.kfmt })}${sl(`ai_agents.${k}.min_confidence`, "Minimum confidence", { min: 0, max: 100, step: 5, fmt: FMT.conf, hint: "Below this, flag for human review" })}</div></div>`).join("");

  B.limits = () => card("Run limits", "Control how much AI work can run", `<div class="g2s">${sl("ai_global.daily_run_cap", "Daily workflow runs (all claims)", { min: 0, max: 1000, step: 10, fmt: FMT.num })}${sl("ai_global.run_timeout_sec", "Run timeout", { min: 30, max: 300, step: 10, fmt: FMT.sec })}${sl("ai_global.max_retries", "Retries on failure", { min: 0, max: 5, fmt: FMT.num })}${sl("ai_global.per_claim_token_cap", "Token cap per claim analysis", { min: 5000, max: 100000, step: 1000, fmt: FMT.kfmt, hint: "All five agents combined" })}</div>`) +
    card("Token budget", "Monthly spend guardrail", `${sl("ai_global.monthly_token_budget", "Monthly token budget", { min: 1000000, max: 200000000, step: 1000000, fmt: FMT.kfmt })}${sl("ai_global.alert_threshold_pct", "Alert me at", { min: 50, max: 100, step: 5, fmt: FMT.pct, hint: "Notify when usage reaches this share of the budget" })}<div class="live" id="meters"></div>`) +
    card("Behaviour", "", `${sw("ai_global.auto_run_on_new_claim", "Auto-run AI analysis on new claims", "Starts the Claim AI Analysis workflow when a claim is registered.")}${sw("ai_global.human_review_required", "Human review required before any decision", "UnderwriteIQ only recommends; an underwriter always decides.")}
    <div class="fld"><label>Fallback model if the primary is unavailable ${badge("a")}</label>${radios("ai_global.fallback_model", MODELS.map(([m, d]) => [m, m, d]))}</div>`);

  B.approval = () => card("Decision mode", "", `<div class="fld">${radios("approval.decision_mode", [["advisory", "Advisory only", "AI recommends; a human always decides"], ["auto_low", "Auto-approve low value", "Approve automatically below the auto-approve limit when fraud risk is Low"], ["assisted", "Assisted approval", "AI pre-fills the decision; human confirms in one click"]])}</div>`) +
    card("Approval authority ladder", "Who can sign off, by estimated payout", `${sl("approval.underwriter_limit_aed", "Underwriter limit", { min: 0, max: 100000, step: 1000, fmt: FMT.aed, e: "e", hint: "Above this needs a Senior Underwriter" })}${sl("approval.senior_limit_aed", "Senior underwriter limit", { min: 0, max: 250000, step: 5000, fmt: FMT.aed, e: "e", hint: "Above this needs a Claims Manager" })}${sl("approval.dual_control_above_aed", "Dual control above", { min: 0, max: 500000, step: 10000, fmt: FMT.aed, hint: "Second approver required" })}
    <div class="live" id="ladder"></div>`) +
    card("Rules", "", `${sw("approval.medium_fraud_requires_senior", "Medium fraud risk requires Senior Underwriter", "", "e")}${sw("approval.reject_requires_senior", "Rejections require Senior Underwriter", "", "e")}${sw("approval.comment_required_on_override", "Comment required when overriding the AI recommendation")}
    ${sl("approval.auto_approve_limit_aed", "Auto-approve limit", { min: 0, max: 20000, step: 500, fmt: FMT.aed, hint: "Used by Auto-approve mode" })}${sl("approval.max_payable_pct_sum_insured", "Max payable as % of sum insured", { min: 10, max: 100, step: 5, fmt: FMT.pct })}`);

  B.fraud = () => card("Fraud score bands", "Drag to move the Low / Medium / High boundaries", `${sl("fraud.medium_threshold", "Medium risk from score", { min: 5, max: 90, fmt: FMT.score, e: "e" })}${sl("fraud.high_threshold", "High risk from score", { min: 10, max: 100, fmt: FMT.score, e: "e", hint: "High risk triggers a Reject recommendation and SIU referral" })}<div class="live" id="gauge"></div>`) +
    card("Detection sensitivity", "", `<div class="g2s">${sl("fraud.late_report_hours", "Late police report after", { min: 6, max: 168, step: 6, fmt: FMT.hrs, e: "e", hint: "Over 1.5× this adds the heavy penalty" })}${sl("fraud.tamper_threshold", "Image tampering alert at", { min: .05, max: .9, step: .05, fmt: FMT.tamper, e: "e" })}${sl("fraud.overlap_window_days", "Overlapping-claim window", { min: 7, max: 90, step: 1, fmt: FMT.days, e: "e" })}</div>${sw("fraud.siu_referral", "Recommend Special Investigations Unit referral for High risk")}`);

  B.sla = () => card("Decision SLA", "", `<div class="g2s">${sl("sla.decision_sla_hours", "Decision SLA", { min: 4, max: 168, step: 4, fmt: FMT.hrs })}${sl("sla.escalate_after_days", "Escalate after", { min: 1, max: 30, fmt: FMT.days })}</div><div class="live" id="slalive"></div>`) +
    card("Alerts & digests", "", `${sw("sla.notify_on_high_fraud", "Alert on High fraud risk", "Instant email and Slack alert to the SIU channel.")}${sw("sla.daily_digest", "Daily AI summary digest")}
    <div class="fld"><label>Digest time</label>${pills("sla.digest_time", [["07:00", "07:00"], ["08:00", "08:00"], ["09:00", "09:00"], ["18:00", "18:00"]])}</div><div class="g2s">${txt("sla.notify_email", "Notification email", "name@insurer.com")}${txt("sla.slack_channel", "Slack channel", "#claims-ai")}</div>`);

  B.privacy = () => card("Data protection", "", `${sw("privacy.pii_redaction", "Redact PII before sending to the model", "Emirates ID, phone and email are masked in prompts.")}${sw("privacy.audit_logging", "Audit logging", "Every AI run and settings change is recorded.")}${sw("privacy.store_prompts", "Store prompts and responses", "Keep full agent transcripts for troubleshooting.")}`) +
    card("Retention & residency", "", `<div class="fld"><label>Retention period</label>${pills("privacy.retention_days", [[90, "90 days"], [180, "180 days"], [365, "1 year"], [730, "2 years"]])}</div><div class="fld"><label>Data residency</label>${radios("privacy.data_residency", [["UAE (me-central)", "UAE", "me-central"], ["EU (Frankfurt)", "EU", "Frankfurt"], ["US (Virginia)", "US", "Virginia"]])}</div>`);

  B.log = () => card("Change log", "Every settings change, newest first", `<div class="tablewrap"><table><thead><tr><th>When</th><th>Section</th><th>Changed by</th><th>Changes</th></tr></thead><tbody>${log.map(a => { const ch = []; const w = (x, y, p) => { for (const k of new Set([...Object.keys(x || {}), ...Object.keys(y || {})])) { const u = x?.[k], v = y?.[k]; if (u && v && typeof u === "object" && typeof v === "object") w(u, v, p + k + "."); else if (JSON.stringify(u) !== JSON.stringify(v)) ch.push(`<code>${esc(p + k)}</code> ${esc(JSON.stringify(u) ?? "—")} → <b>${esc(JSON.stringify(v))}</b>`); } }; w(a.old_value, a.new_value, ""); return `<tr><td>${new Date(a.changed_at).toLocaleString("en-GB")}</td><td>${esc(a.key)}</td><td>${esc(a.changed_by)}</td><td>${ch.slice(0, 6).join("<br>") || "—"}${ch.length > 6 ? `<br><small>+${ch.length - 6} more</small>` : ""}</td></tr>`; }).join("") || `<tr><td colspan="4" class="empty">No changes yet.</td></tr>`}</tbody></table></div>`);

  // ----- live previews -----
  const meter = (label, used, cap, alertPct, fmt) => { const p = cap ? used / cap * 100 : 0, c = p >= 100 ? "#dc2626" : p >= alertPct ? "#d97706" : "#16a34a"; return `<div class="mt"><div class="mth"><span>${label}</span><b>${fmt(used)} / ${fmt(cap)} <small style="color:${c}">${Math.round(p)}%${p >= 100 ? " · over limit" : p >= alertPct ? " · alert" : ""}</small></b></div><div class="mtb"><i style="width:${Math.min(p, 100)}%;background:${c}"></i><u style="left:${alertPct}%"></u></div></div>`; };
  const live = {
    meters: () => { const g = draft.ai_global, tot = Object.values(st).filter(x => x.agent_key !== "workflow").reduce((t, x) => t + (x.tokens_in || 0) + (x.tokens_out || 0), 0), wf = st.workflow || {}; const runsT = Math.max(...Object.keys(NAMES).map(runsToday));
      return meter("Workflow runs today", runsT, g.daily_run_cap, g.alert_threshold_pct, v => v) + meter("Tokens used (all-time snapshot) vs monthly budget", tot, g.monthly_token_budget, g.alert_threshold_pct, kfmt) + meter("Avg tokens per claim analysis vs per-claim cap", Math.round(tot / Math.max(wf.runs || 1, 1)), g.per_claim_token_cap, g.alert_threshold_pct, kfmt); },
    ladder: () => { const a = draft.approval, u = a.underwriter_limit_aed, s = Math.max(a.senior_limit_aed, u), top = Math.max(s * 1.4, 1), sim = a._sim ?? 12000; const who = sim > s ? "Claims Manager" : sim > u ? "Senior Underwriter" : "Underwriter";
      return `<div class="lad"><div class="ladb"><span class="l1" style="width:${u / top * 100}%">Underwriter<br><small>up to ${aed(u)}</small></span><span class="l2" style="width:${(s - u) / top * 100}%">Senior<br><small>up to ${aed(s)}</small></span><span class="l3" style="width:${Math.max(0, 100 - s / top * 100)}%">Claims Manager</span></div></div>
      <div class="sim"><label>Try an estimated payout: <b>${aed(sim)}</b></label><input type="range" min="0" max="${Math.round(top)}" step="1000" value="${sim}" data-sim="approval"><div class="simr">Approver: <b class="pill2">${who}</b>${sim > a.dual_control_above_aed ? ` <b class="pill2 warn">+ dual control</b>` : ""}${a.decision_mode === "auto_low" && sim <= a.auto_approve_limit_aed ? ` <b class="pill2 ok">auto-approved if fraud Low</b>` : ""}</div></div>`; },
    gauge: () => { const f = draft.fraud, m = f.medium_threshold, h = Math.max(f.high_threshold, m + 1), sim = f._sim ?? 35, band = sim >= h ? "High" : sim >= m ? "Medium" : "Low", col = { Low: "#16a34a", Medium: "#d97706", High: "#dc2626" };
      return `<div class="gau"><span style="width:${m}%;background:#16a34a">Low 0-${m - 1}</span><span style="width:${h - m}%;background:#d97706">Medium ${m}-${h - 1}</span><span style="width:${100 - h}%;background:#dc2626">High ${h}+</span><i style="left:${sim}%"></i></div>
      <div class="sim"><label>Try a fraud score: <b>${sim}</b>/100</label><input type="range" min="0" max="100" value="${sim}" data-sim="fraud"><div class="simr">Result: <b class="pill2" style="background:${col[band]}22;color:${col[band]}">${band} risk</b> ${band === "High" ? "→ Reject recommendation + SIU referral" : band === "Medium" ? "→ extra verification, Senior sign-off" : "→ eligible for approval"}</div></div>`; },
    slalive: () => { const hrs = draft.sla.decision_sla_hours, esc_d = draft.sla.escalate_after_days, open = claims.filter(c => ["Pending Underwriting", "In Review", "Pending Documents", "Pending Garage Estimate"].includes(c.status)), age = c => (Date.now() - new Date(c.reported_on)) / 36e5;
      return `<div class="sim"><div class="simr">Right now: <b class="pill2 ${open.filter(c => age(c) > hrs).length ? "warn" : "ok"}">${open.filter(c => age(c) > hrs).length} of ${open.length} open claims exceed the ${hrs}h SLA</b> <b class="pill2 ${open.filter(c => age(c) > esc_d * 24).length ? "bad" : "ok"}">${open.filter(c => age(c) > esc_d * 24).length} would be escalated</b></div></div>`; },
  };

  // ----- render -----
  const paint = () => { // sync controls <- draft
    el.querySelectorAll("[data-path]").forEach(i => { const p = i.dataset.path, v = p.startsWith("p.") ? prefs[p.slice(2)] : get(draft, p); if (i.type === "checkbox") i.checked = !!v; else if (i.type === "radio") i.checked = String(v) === i.value; else if (document.activeElement !== i) i.value = v ?? ""; if (i.type === "range") i.style.setProperty("--p", ((i.value - i.min) / (i.max - i.min) * 100) + "%"); });
    el.querySelectorAll("[data-show]").forEach(b => { const v = get(draft, b.dataset.show), f = FMT[b.dataset.fmt] || (x => x); b.textContent = f(v); });
    Object.entries(live).forEach(([id, fn]) => { const n = el.querySelector("#" + id); if (n) { n.innerHTML = fn(); n.querySelectorAll("[data-sim]").forEach(r => { r.style.setProperty("--p", ((r.value - r.min) / (r.max - r.min) * 100) + "%"); }); } });
    const d = dirtyOf(tab), bar = el.querySelector("#savebar"); if (bar) { bar.classList.toggle("show", d.length > 0); bar.querySelector("span").textContent = `${d.length} unsaved change${d.length === 1 ? "" : "s"}`; }
    el.querySelectorAll(".nav2 button").forEach(b => { const n = dirtyOf(b.dataset.t).length; b.querySelector(".dot2")?.remove(); if (n) b.insertAdjacentHTML("beforeend", `<i class="dot2"></i>`); });
  };
  const draw = () => {
    el.innerHTML = `<div class="top"><div><h2>Settings</h2><p>AI configuration, limits and approval policy</p></div></div><div class="stl"><nav class="nav2">${TABS.map(([k, l, i]) => `<button data-t="${k}" class="${k === tab ? "on" : ""}"><span>${i}</span>${l}</button>`).join("")}</nav><div class="stb">${B[tab]()}<div id="savebar" class="savebar"><span></span><div><button class="btn ghost sm" id="sb-reset">Reset to defaults</button><button class="btn ghost sm" id="sb-discard">Discard</button><button class="btn sm" id="sb-save">Save changes</button></div></div></div></div>`;
    el.querySelectorAll(".nav2 button").forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
    paint();
    const secs = SECTION_OF[tab] || [];
    el.querySelector("#sb-discard").onclick = () => { secs.forEach(s => draft[s] = clone(cfg[s])); draw(); };
    el.querySelector("#sb-reset").onclick = async () => { if (!confirm("Reset this section to its default values?")) return; for (const s of secs) await rpc("uw_reset_setting", { p_key: s, p_user: user.name }); await reload(); toast("Reset to defaults"); };
    el.querySelector("#sb-save").onclick = async () => { const btn = el.querySelector("#sb-save"); btn.disabled = true; try { for (const s of secs) { const v = clone(draft[s]); delete v._sim; if (diff(s).length) await rpc("uw_save_setting", { p_key: s, p_value: v, p_user: user.name }); } await reload(); toast("Settings saved - applied to the next AI run"); } catch (e) { toast(e.message); btn.disabled = false; } };
  };
  const reload = async () => { const [r, a] = await Promise.all([api("uw_settings?select=*"), api("uw_settings_audit?select=*&order=changed_at.desc&limit=60")]); cfg = Object.fromEntries(r.map(x => [x.key, x.value])); draft = clone(cfg); log = a; draw(); };
  el.addEventListener("input", e => {
    const t = e.target;
    if (t.dataset.sim) { const sec = t.dataset.sim === "fraud" ? "fraud" : "approval"; draft[sec]._sim = +t.value; paint(); return; }
    const p = t.dataset.path; if (!p) return;
    let v = t.type === "checkbox" ? t.checked : t.type === "radio" ? (t.value === "true" ? true : t.value === "false" ? false : isNaN(+t.value) || t.value === "" ? t.value : (/^\d+$/.test(t.value) && /retention|digest/.test(p) ? +t.value : t.value)) : t.dataset.num ? +t.value : t.value;
    if (p.startsWith("p.")) { prefs[p.slice(2)] = v; localStorage.setItem("uw_prefs", JSON.stringify(prefs)); document.body.classList.toggle("compact", prefs.density === "compact"); toast("Preference saved"); paint(); return; }
    setp(draft, p, v);
    if (p === "approval.underwriter_limit_aed" && draft.approval.senior_limit_aed < v) draft.approval.senior_limit_aed = v;
    if (p === "fraud.medium_threshold" && draft.fraud.high_threshold <= v) draft.fraud.high_threshold = Math.min(100, v + 5);
    if (p === "fraud.high_threshold" && v <= draft.fraud.medium_threshold) draft.fraud.medium_threshold = Math.max(5, v - 5);
    paint();
  });
  draw();
}
window.Settings = { mount };
})();
