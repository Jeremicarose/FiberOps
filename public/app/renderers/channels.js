import { renderDataTable } from "./shared.js";

export function renderChannels(dom, model) {
  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--channels">
      <header class="workspace-header">
        <div>
          <p class="workspace-kicker">Channels</p>
          <h2>Liquidity and channel readiness</h2>
          <p>Review channel state, local capacity, and likely bottlenecks.</p>
        </div>
      </header>
      <div class="workspace-layout workspace-layout--single">
        <section class="panel-surface">
          ${renderDataTable({
            columns: [
              { key: "channel", label: "Channel" },
              { key: "state", label: "State" },
              { key: "node", label: "Node" },
              { key: "balance", label: "Local balance" },
              { key: "readiness", label: "Readiness" },
              { key: "peer", label: "Peer" }
            ],
            rows: model.rows,
            selectedRowId: model.selected?.id,
            emptyTitle: "No channels available",
            emptyMessage:
              "Channel rows appear after bootstrap, live data collection, or node snapshots."
          })}
        </section>
      </div>
    </section>
  `;
}
