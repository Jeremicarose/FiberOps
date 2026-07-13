import {
  renderBulletList,
  renderEmptyState,
  renderMetricCards,
  renderPanelHead,
  renderRouteCandidateList
} from "./shared.js";
import { escapeHtml } from "../utils.js";

export function renderRouting(dom, model) {
  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--routing">
      <header class="workspace-pagehead">
        <div>
          <span class="rail-label">${escapeHtml(model.hero.eyebrow)}</span>
          <h2>${escapeHtml(model.hero.title)}</h2>
        </div>
      </header>

      <section class="workspace-grid workspace-grid--routing">
        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Route question",
            title: "Inputs",
            detail: "Keep the question small: sender, target, amount, invoice."
          })}
          <form id="routing-form" class="form-grid form-grid--routing">
            <label class="field-group">
              <span>Target pubkey</span>
              <input
                name="targetPubkey"
                type="text"
                value="${escapeHtml(dom.state.routingDraft.targetPubkey || "")}"
                placeholder="0x02..."
              />
            </label>
            <label class="field-group">
              <span>Amount</span>
              <input
                name="amount"
                type="text"
                value="${escapeHtml(dom.state.routingDraft.amount || "")}"
                placeholder="150000000"
              />
            </label>
            <label class="field-group field-group--full">
              <span>Invoice</span>
              <textarea
                name="invoice"
                rows="5"
                placeholder="Optional invoice"
              >${escapeHtml(dom.state.routingDraft.invoice || "")}</textarea>
            </label>
            <button type="submit" class="button-primary">
              ${dom.state.ui.loading ? "Previewing route…" : "Preview route"}
            </button>
          </form>
        </article>

        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Route posture",
            title: "Current summary",
            detail: "Viability, confidence, and sender-side limits."
          })}
          ${
            model.summary.length
              ? `<div class="metrics-grid metrics-grid--four">${renderMetricCards(model.summary)}</div>`
              : renderEmptyState(
                  "No route preview yet",
                  "Submit a target and amount to build route evidence."
                )
          }
          ${
            model.blockingReason
              ? `<div class="inline-banner inline-banner--warning">${escapeHtml(model.blockingReason)}</div>`
              : ""
          }
          ${
            model.feeHint
              ? `<p class="panel-note">${escapeHtml(model.feeHint)}</p>`
              : ""
          }
          <div class="detail-list detail-list--workflow">
            <h4>Operator workflow</h4>
            ${renderBulletList(model.workflowTips)}
          </div>
        </article>
      </section>

      <section class="workspace-stack workspace-stack--routing-candidates">
        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Candidate routes",
            title: "Candidates",
            detail: "Best paths and blockers."
          })}
          <div class="candidate-grid">${renderRouteCandidateList(model.candidates)}</div>
        </article>
      </section>
    </section>
  `;
}
