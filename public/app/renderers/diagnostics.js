import {
  renderBulletList,
  renderEmptyState,
  renderMetricCards,
  renderPanelHead,
  renderReferenceList,
  renderStatusPill,
  toneFromSeverity
} from "./shared.js";
import { escapeHtml } from "../utils.js";

export function renderDiagnostics(dom, model) {
  const draft = dom.state.diagnosticsDraft || {};
  const errorMessage = dom.state.ui.error?.message || "";

  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--diagnostics">
      <header class="workspace-pagehead">
        <div>
          <span class="rail-label">${escapeHtml(model.hero.eyebrow)}</span>
          <h2>${escapeHtml(model.hero.title)}</h2>
        </div>
        ${renderStatusPill(model.severity, toneFromSeverity(model.severity.toLowerCase()))}
      </header>

      <section class="workspace-grid workspace-grid--three">
        ${model.contextCards
          .map(
            (item) => `
              <article class="mini-card">
                <span>${escapeHtml(item.label)}</span>
                <strong>${escapeHtml(item.value)}</strong>
                <p>${escapeHtml(item.detail)}</p>
              </article>
            `
          )
          .join("")}
      </section>

      <section class="workspace-grid workspace-grid--diagnostics">
        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Investigation input",
            title: "Request context",
            detail: "Tie the question to one scenario, node, or payment."
          })}
          <form id="diagnostics-form" class="form-grid form-grid--diagnostics">
            <label class="field-group">
              <span>Mode</span>
              <select name="mode-select">
                <option value="demo" ${dom.state.mode === "demo" ? "selected" : ""}>Replay</option>
                <option value="live" ${dom.state.mode === "live" ? "selected" : ""}>Live</option>
              </select>
            </label>
            <label class="field-group">
              <span>Scenario</span>
              <select name="scenarioId">
                ${(dom.state.bootstrap?.scenarios || [])
                  .map(
                    (scenario) => `
                      <option
                        value="${escapeHtml(scenario.id)}"
                        ${draft.scenarioId === scenario.id ? "selected" : ""}
                      >
                        ${escapeHtml(scenario.name)}
                      </option>
                    `
                  )
                  .join("")}
              </select>
            </label>
            <label class="field-group field-group--full">
              <span>Endpoint</span>
              <input
                name="endpoint"
                type="url"
                value="${escapeHtml(draft.endpoint || "")}"
                placeholder="http://127.0.0.1:8227"
              />
            </label>
            <label class="field-group field-group--full">
              <span>Bearer token</span>
              <textarea name="token" rows="3" placeholder="Optional read-only token">${escapeHtml(
                draft.token || ""
              )}</textarea>
            </label>
            <label class="field-group field-group--full">
              <span>Invoice</span>
              <textarea name="invoice" rows="4" placeholder="Paste a Fiber invoice">${escapeHtml(
                draft.invoice || ""
              )}</textarea>
            </label>
            <label class="field-group">
              <span>Payment hash</span>
              <input
                name="paymentHash"
                type="text"
                value="${escapeHtml(draft.paymentHash || "")}"
                placeholder="0x..."
              />
            </label>
            <label class="field-group">
              <span>Amount</span>
              <input
                name="amount"
                type="text"
                value="${escapeHtml(draft.amount || "")}"
                placeholder="150000000"
              />
            </label>
            <label class="field-group">
              <span>Target pubkey</span>
              <input
                name="targetPubkey"
                type="text"
                value="${escapeHtml(draft.targetPubkey || "")}"
                placeholder="0x02..."
              />
            </label>
            <label class="field-group">
              <span>Analysis depth</span>
              <select name="analysisDepth">
                <option value="standard" ${draft.analysisDepth !== "deep" ? "selected" : ""}>Standard</option>
                <option value="deep" ${draft.analysisDepth === "deep" ? "selected" : ""}>Deep</option>
              </select>
            </label>
            <button type="submit" class="button-primary">
              ${dom.state.ui.loading ? "Running investigation…" : "Run investigation"}
            </button>
          </form>
          ${
            errorMessage
              ? `<div class="inline-banner inline-banner--critical">${escapeHtml(errorMessage)}</div>`
              : ""
          }
        </article>

        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Verdict",
            title: "Summary",
            detail: "Result and next steps."
          })}
          ${
            model.metrics.length
              ? `<div class="metrics-grid metrics-grid--four">${renderMetricCards(model.metrics)}</div>`
              : renderEmptyState(
                  "No result yet",
                  "Run a request to populate the investigation summary."
                )
          }
          <div class="detail-list detail-list--workflow">
            <h4>Next actions</h4>
            ${renderBulletList(model.actions)}
          </div>
        </article>

        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Evidence",
            title: "Checks, evidence, references",
            detail: "Observed facts, inferred context, and references."
          })}
          <div class="diagnostics-column">
            <section class="detail-list diagnostics-section diagnostics-section--checks">
              <h4>Checks</h4>
              ${renderBulletList(
                model.checks.map(
                  (item) =>
                    `${item.label || "Check"}: ${item.value || item.result || "Unknown"}`
                )
              )}
            </section>
            <section class="detail-list diagnostics-section diagnostics-section--evidence">
              <h4>Evidence</h4>
              ${renderBulletList(
                model.evidence.map(
                  (item) =>
                    `${item.label || "Evidence"}: ${item.value || item.detail || "Unknown"}`
                )
              )}
            </section>
            <section class="detail-list diagnostics-section diagnostics-section--references">
              <h4>References</h4>
              ${renderReferenceList(model.references)}
            </section>
          </div>
        </article>
      </section>
    </section>
  `;
}
