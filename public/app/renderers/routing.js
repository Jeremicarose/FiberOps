import {
  renderEmptyState,
  renderMetricCards,
  renderRouteCandidateList
} from "./shared.js";

export function renderRouting(dom, model) {
  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--routing">
      <header class="workspace-header">
        <div>
          <p class="workspace-kicker">Routing</p>
          <h2>Preview payment path readiness</h2>
          <p>Run route checks in place, compare candidates, and inspect blockers.</p>
        </div>
      </header>
      <div class="workspace-layout workspace-layout--routing">
        <section class="panel-surface panel-surface--form">
          <div class="panel-surface__head"><h3>Route inputs</h3></div>
          <form id="routing-form" class="form-grid">
            <label class="field-group"><span>Target pubkey</span><input name="targetPubkey" type="text" value="${dom.state.routingDraft.targetPubkey || ""}" placeholder="0x02..." /></label>
            <label class="field-group"><span>Amount</span><input name="amount" type="text" value="${dom.state.routingDraft.amount || ""}" placeholder="150000000" /></label>
            <label class="field-group"><span>Invoice</span><textarea name="invoice" rows="5" placeholder="Optional invoice">${dom.state.routingDraft.invoice || ""}</textarea></label>
            <button type="submit" class="button-primary">Preview route</button>
          </form>
        </section>
        <section class="panel-surface">
          <div class="panel-surface__head"><h3>Route summary</h3></div>
          ${model.summary.length ? `<div class="metric-grid">${renderMetricCards(model.summary)}</div>` : renderEmptyState("No route preview", "Submit a target and amount to build route evidence.")}
          ${model.blockingReason ? `<div class="inline-banner inline-banner--warning">${model.blockingReason}</div>` : ""}
          ${model.feeHint ? `<p class="panel-note">${model.feeHint}</p>` : ""}
          ${model.limitations.length ? `<div class="detail-list"><h4>Limitations</h4><ul>${model.limitations.map((item) => `<li>${item}</li>`).join("")}</ul></div>` : ""}
        </section>
        <aside class="panel-surface panel-surface--supporting">
          <div class="panel-surface__head"><h3>Inspector workflow</h3></div>
          ${renderEmptyState(
            "Shared inspector",
            "Chosen routes now open in the dockable inspector so the main routing workspace stays focused on candidates and evidence."
          )}
        </aside>
      </div>
      <section class="panel-surface">
        <div class="panel-surface__head"><h3>Candidate routes</h3></div>
        <div class="candidate-grid">${renderRouteCandidateList(model.candidates)}</div>
      </section>
    </section>
  `;
}
