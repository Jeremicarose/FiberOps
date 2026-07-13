import {
  renderAlertList,
  renderEmptyState,
  renderMetricCards,
  renderTimelineItems
} from "./shared.js";

export function renderOverview(dom, model) {
  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--overview">
      <header class="workspace-header">
        <div>
          <p class="workspace-kicker">Overview</p>
          <h2>System state at a glance</h2>
          <p>Immediate health, routing posture, and recent operational movement.</p>
        </div>
      </header>
      <section class="metric-grid">${renderMetricCards(model.metrics)}</section>
      <section class="workspace-two-up">
        <div class="panel-surface">
          <div class="panel-surface__head"><h3>Active alerts</h3></div>
          <div class="stack-list">${renderAlertList(model.alerts)}</div>
        </div>
        <div class="panel-surface">
          <div class="panel-surface__head"><h3>Quick actions</h3></div>
          <div class="action-grid">
            ${model.quickActions
              .map(
                (action) => `
                  <button
                    type="button"
                    class="action-tile"
                    data-quick-action="${action.id}"
                  >
                    <strong>${action.label}</strong>
                    <span>${action.detail}</span>
                  </button>
                `
              )
              .join("")}
          </div>
        </div>
      </section>
      <section class="panel-surface">
        <div class="panel-surface__head"><h3>Recent activity</h3></div>
        <div class="timeline-list">
          ${model.recentActivity?.length ? renderTimelineItems(model.recentActivity) : renderEmptyState("No activity", "Recent incidents and history-backed changes appear here.")}
        </div>
      </section>
    </section>
  `;
}
