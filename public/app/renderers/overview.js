import {
  renderActionList,
  renderAlertList,
  renderDataTable,
  renderMetricCards,
  renderPanelHead,
  renderTimelineItems
} from "./shared.js";
import { escapeHtml } from "../utils.js";

export function renderOverview(dom, model) {
  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--overview">
      <header class="workspace-pagehead">
        <div>
          <span class="rail-label">${escapeHtml(model.hero.eyebrow)}</span>
          <h2>${escapeHtml(model.hero.title)}</h2>
        </div>
        <div class="pagehead-badge-cluster">
          <div class="pagehead-badge">
            <span>Posture</span>
            <strong>${escapeHtml(model.hero.status)}</strong>
          </div>
        </div>
      </header>

      <section class="metrics-grid metrics-grid--four overview-metrics-grid">
        ${renderMetricCards(model.metrics.slice(0, 4))}
      </section>

      <section class="workspace-grid workspace-grid--two overview-grid overview-grid--primary">
        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Attention",
            title: "Needs investigation",
            detail: "Ranked by evidence."
          })}
          <div class="stack-list">${renderAlertList(model.attentionQueue.slice(0, 2))}</div>
        </article>

        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Actions",
            title: "Next steps",
            detail: "Fast paths into the next workspace."
          })}
          ${renderActionList(model.quickActions.slice(0, 3))}
        </article>
      </section>

      <section class="workspace-grid workspace-grid--two overview-grid overview-grid--secondary">
        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Node watchlist",
            title: "Nodes",
            detail: "Health, outbound, proof."
          })}
          ${renderDataTable({
            columns: [
              { key: "node", label: "Node" },
              { key: "health", label: "Health" },
              { key: "outbound", label: "Outbound" },
              { key: "proof", label: "Proof" }
            ],
            rows: model.nodeWatchlist,
            emptyTitle: "No nodes",
            emptyMessage:
              "Node posture appears here after bootstrap or diagnostics."
          })}
        </article>

        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Investigations",
            title: "Recent activity",
            detail: "Incidents and changes."
          })}
          <div class="timeline-list">${renderTimelineItems(model.activeInvestigations)}</div>
        </article>
      </section>
    </section>
  `;
}
