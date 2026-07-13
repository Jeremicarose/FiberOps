import { renderDataTable } from "./shared.js";

export function renderNodes(dom, model) {
  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--nodes">
      <header class="workspace-header">
        <div>
          <p class="workspace-kicker">Nodes</p>
          <h2>Compare configured senders and peers</h2>
          <p>Inspect node health snapshots, route readiness, and outbound capacity.</p>
        </div>
      </header>
      <div class="workspace-layout workspace-layout--single">
        <section class="panel-surface">
          ${renderDataTable({
            columns: [
              { key: "name", label: "Node" },
              { key: "readiness", label: "Readiness" },
              { key: "endpoint", label: "Endpoint" },
              { key: "outbound", label: "Outbound" },
              { key: "readyChannels", label: "Ready" },
              { key: "probe", label: "Probe" }
            ],
            rows: model.rows,
            selectedRowId: model.selected?.id,
            emptyTitle: "No nodes loaded",
            emptyMessage:
              "Bootstrap or diagnostics data has not populated node snapshots yet."
          })}
        </section>
      </div>
    </section>
  `;
}
