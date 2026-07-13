import {
  renderDataTable,
  renderMetricCards,
  renderPanelHead
} from "./shared.js";

export function renderPayments(dom, model) {
  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--payments">
      <header class="workspace-pagehead">
        <div>
          <span class="rail-label">Observe / Payments</span>
          <h2>Search payment history, retries, and failure clusters</h2>
          <p>See which payments succeed, repeat, or fail for the same reason.</p>
        </div>
      </header>

      <section class="metrics-grid metrics-grid--four">
        ${renderMetricCards(model.metrics)}
      </section>

      <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Payment records",
            title: "Recent payment history",
            detail: "Select a row for diagnosis and route detail."
          })}
        ${renderDataTable({
          columns: [
            { key: "payment", label: "Payment" },
            { key: "status", label: "Status" },
            { key: "amount", label: "Amount" },
            { key: "routeProof", label: "Route proof" },
            { key: "time", label: "Time" },
            { key: "reason", label: "Why it matters" }
          ],
          rows: model.rows,
          selectedRowId: model.selected?.id,
          emptyTitle: "No payment records",
          emptyMessage:
            "Run diagnostics or enable history to populate payment records."
        })}
      </article>
    </section>
  `;
}
