import { renderDataTable, renderTimelineItems } from "./shared.js";

export function renderActivity(dom, model) {
  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--activity">
      <header class="workspace-header">
        <div>
          <p class="workspace-kicker">Activity</p>
          <h2>History, incidents, and timeline</h2>
          <p>Server-backed history and resilient local incident tracking are merged here.</p>
        </div>
      </header>
      <div class="workspace-two-up">
        <section class="panel-surface">
          <div class="panel-surface__head"><h3>Recent records</h3></div>
          ${renderDataTable({
            columns: [
              { key: "timestamp", label: "Timestamp" },
              { key: "type", label: "Type" },
              { key: "headline", label: "Headline" },
              { key: "readiness", label: "Readiness" },
              { key: "source", label: "Source" }
            ],
            rows: model.rows,
            selectedRowId: model.selected?.id,
            emptyTitle: "No activity rows",
            emptyMessage:
              "Run diagnostics or load history to populate the activity feed."
          })}
        </section>
        <section class="panel-surface">
          <div class="panel-surface__head"><h3>Timeline</h3></div>
          <div class="timeline-list">${renderTimelineItems(model.timeline)}</div>
        </section>
      </div>
    </section>
  `;
}
