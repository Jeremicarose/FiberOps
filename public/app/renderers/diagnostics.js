import {
  renderEmptyState,
  renderKeyValueList,
  renderMetricCards,
  renderTrustedReferenceLink,
  renderStatusPill,
  toneFromSeverity
} from "./shared.js";
import { escapeHtml } from "../utils.js";

export function renderDiagnostics(dom, model) {
  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--diagnostics">
      <header class="workspace-header">
        <div>
          <p class="workspace-kicker">Diagnostics</p>
          <h2>Run diagnosis without leaving context</h2>
          <p>Inputs, result summary, and detailed evidence remain visible in one workspace.</p>
        </div>
        ${renderStatusPill(model.severity, toneFromSeverity(model.severity))}
      </header>
      <div class="workspace-layout workspace-layout--diagnostics">
        <section class="panel-surface panel-surface--form">
          <div class="panel-surface__head"><h3>Inputs and presets</h3></div>
          <form id="diagnostics-form" class="form-grid">
            <input type="hidden" name="mode" value="${dom.state.mode}" />
            <label class="field-group"><span>Mode</span>
              <select name="mode-select">
                <option value="demo" ${dom.state.mode === "demo" ? "selected" : ""}>Demo</option>
                <option value="live" ${dom.state.mode === "live" ? "selected" : ""}>Live</option>
              </select>
            </label>
            <label class="field-group"><span>Scenario</span><select name="scenarioId" ${dom.state.mode === "demo" ? "required" : "disabled"}>${(dom.state.bootstrap?.scenarios || []).map((scenario) => `<option value="${escapeHtml(scenario.id)}" ${dom.state.diagnosticsDraft.scenarioId === scenario.id ? "selected" : ""}>${escapeHtml(scenario.name)}</option>`).join("")}</select></label>
            <label class="field-group ${dom.state.mode === "live" ? "" : "is-hidden"}"><span>Endpoint</span><input name="endpoint" type="url" ${dom.state.mode === "live" ? "" : "disabled"} value="${escapeHtml(dom.state.diagnosticsDraft.endpoint || "")}" placeholder="http://127.0.0.1:8227" /></label>
            <label class="field-group ${dom.state.mode === "live" ? "" : "is-hidden"}"><span>Token</span><textarea name="token" rows="3" ${dom.state.mode === "live" ? "" : "disabled"} placeholder="Optional bearer token">${escapeHtml(dom.state.diagnosticsDraft.token || "")}</textarea></label>
            <label class="field-group"><span>Invoice</span><textarea name="invoice" rows="4" placeholder="Paste a Fiber invoice">${escapeHtml(dom.state.diagnosticsDraft.invoice || "")}</textarea></label>
            <label class="field-group"><span>Payment hash</span><input name="paymentHash" type="text" value="${escapeHtml(dom.state.diagnosticsDraft.paymentHash || "")}" placeholder="0x..." /></label>
            <label class="field-group"><span>Amount</span><input name="amount" type="text" value="${escapeHtml(dom.state.diagnosticsDraft.amount || "")}" placeholder="150000000" /></label>
            <label class="field-group"><span>Target pubkey</span><input name="targetPubkey" type="text" value="${escapeHtml(dom.state.diagnosticsDraft.targetPubkey || "")}" placeholder="0x02..." /></label>
            <label class="field-group ${dom.state.mode === "live" ? "" : "is-hidden"}"><span>Analysis depth</span><select name="analysisDepth" ${dom.state.mode === "live" ? "" : "disabled"}><option value="standard" ${dom.state.diagnosticsDraft.analysisDepth !== "deep" ? "selected" : ""}>Standard</option><option value="deep" ${dom.state.diagnosticsDraft.analysisDepth === "deep" ? "selected" : ""}>Deep</option></select></label>
            <button type="submit" class="button-primary">${dom.state.ui.loading ? "Running…" : "Run diagnosis"}</button>
            ${dom.state.ui.error ? `<div class="inline-banner inline-banner--warning">${escapeHtml(dom.state.ui.error.message || dom.state.ui.error)}</div>` : ""}
          </form>
        </section>
        <section class="panel-surface">
          <div class="panel-surface__head"><h3>Summary and next actions</h3></div>
          <article class="hero-diagnosis">
            <h3>${escapeHtml(model.headline)}</h3>
            <p>${escapeHtml(model.explanation)}</p>
          </article>
          ${model.metrics.length ? `<div class="metric-grid">${renderMetricCards(model.metrics)}</div>` : renderEmptyState("No result yet", "Run a request to populate diagnosis summary cards.")}
          <div class="detail-list">
            <h4>Next actions</h4>
            ${model.actions.length ? `<ul>${model.actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ul>` : "<p>No suggested actions yet.</p>"}
          </div>
        </section>
        <aside class="panel-surface inspector-panel">
          <div class="panel-surface__head"><h3>Checks, evidence, references</h3></div>
          <div class="detail-list"><h4>Checks</h4>${model.checks.length ? `<ul>${model.checks.map((check) => `<li><strong>${escapeHtml(check.title)}</strong><span>${escapeHtml(check.detail)}</span></li>`).join("")}</ul>` : "<p>No checks yet.</p>"}</div>
          <div class="detail-list"><h4>Evidence</h4>${model.evidence.length ? renderKeyValueList(model.evidence.map((item) => ({ label: item.label, value: item.value }))) : "<p>No evidence yet.</p>"}</div>
          <div class="detail-list"><h4>References</h4>${model.references.length ? `<ul>${model.references.map((reference) => `<li>${renderTrustedReferenceLink(reference)}</li>`).join("")}</ul>` : "<p>No references yet.</p>"}</div>
        </aside>
      </div>
    </section>
  `;
}
