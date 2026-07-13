import {
  renderDataTable,
  renderMetricCards,
  renderPanelHead,
  renderTimelineItems
} from "./shared.js";

export function renderActivity(dom, model) {
  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--activity">
      <header class="workspace-pagehead">
        <div>
          <span class="rail-label">Explain / Activity</span>
          <h2>Review investigations, state changes, and incident history</h2>
          <p>Review history and investigation changes before opening raw logs.</p>
        </div>
      </header>

      <section class="metrics-grid metrics-grid--three">
        ${renderMetricCards(model.metrics)}
      </section>

      <section class="workspace-grid workspace-grid--two">
        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Event ledger",
            title: "Recent activity",
            detail:
              "Select a row to inspect the event in the right-hand inspector."
          })}
          ${renderDataTable({
            columns: [
              { key: "timestamp", label: "Time" },
              { key: "type", label: "Type" },
              { key: "headline", label: "Headline" },
              { key: "readiness", label: "Readiness" }
            ],
            rows: model.rows,
            selectedRowId: model.selected?.id,
            emptyTitle: "No activity rows",
            emptyMessage:
              "Run diagnostics or load history to populate the activity feed."
          })}
        </article>
        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Timeline",
            title: "What changed?",
            detail: "A condensed stream of changes."
          })}
          <div class="timeline-list">${renderTimelineItems(model.timeline)}</div>
        </article>
      </section>
    </section>
  `;
}
