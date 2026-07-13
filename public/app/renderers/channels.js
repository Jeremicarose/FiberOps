import {
  renderDataTable,
  renderMetricCards,
  renderPanelHead
} from "./shared.js";

export function renderChannels(dom, model) {
  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--channels">
      <header class="workspace-pagehead">
        <div>
          <span class="rail-label">Observe / Channels</span>
          <h2>Inspect liquidity, readiness, and peer-side bottlenecks</h2>
          <p>Review balance concentration and route-limiting channels.</p>
        </div>
      </header>

      <section class="metrics-grid metrics-grid--four">
        ${renderMetricCards(model.metrics)}
      </section>

      <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Channel inventory",
            title: "Tracked channels",
            detail: "Select a row for balance and route-fit detail."
          })}
        ${renderDataTable({
          columns: [
            { key: "channel", label: "Channel" },
            { key: "state", label: "State" },
            { key: "peer", label: "Peer" },
            { key: "balance", label: "Balances" },
            { key: "readiness", label: "Readiness" },
            { key: "capacity", label: "Capacity" }
          ],
          rows: model.rows,
          selectedRowId: model.selected?.id,
          emptyTitle: "No channels available",
          emptyMessage:
            "Channel rows appear after bootstrap, live data collection, or node snapshots."
        })}
      </article>
    </section>
  `;
}
