import {
  renderDataTable,
  renderMetricCards,
  renderPanelHead
} from "./shared.js";

export function renderNodes(dom, model) {
  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--nodes">
      <header class="workspace-pagehead">
        <div>
          <span class="rail-label">Observe / Nodes</span>
          <h2>Compare configured sender posture and node health</h2>
          <p>See which node is healthy, degraded, or route-limiting.</p>
        </div>
      </header>

      <section class="metrics-grid metrics-grid--four">
        ${renderMetricCards(model.metrics)}
      </section>

      <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Node inventory",
            title: "Configured nodes",
            detail: "Select a row for health and route detail."
          })}
        ${renderDataTable({
          columns: [
            { key: "name", label: "Node" },
            { key: "readiness", label: "Readiness" },
            { key: "peers", label: "Peers" },
            { key: "outbound", label: "Estimated outbound" },
            { key: "proof", label: "Route proof" },
            { key: "visibility", label: "Visibility" }
          ],
          rows: model.rows,
          selectedRowId: model.selected?.id,
          emptyTitle: "No nodes loaded",
          emptyMessage:
            "Bootstrap or diagnostics data has not populated node snapshots yet."
        })}
      </article>
    </section>
  `;
}
