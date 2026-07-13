import { renderDataTable, renderPanelHead } from "./shared.js";

export function renderLogs(dom, model) {
  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--logs">
      <header class="workspace-pagehead">
        <div>
          <span class="rail-label">Explain / Logs</span>
          <h2>Inspect recent errors, events, and runtime trace</h2>
          <p>Review recent errors, partial RPC failures, and runtime trace.</p>
        </div>
      </header>

      <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Recent log entries",
            title: "Runtime and event stream",
            detail: "Select a row for event detail."
          })}
        ${renderDataTable({
          columns: [
            { key: "time", label: "Time" },
            { key: "level", label: "Level" },
            { key: "subsystem", label: "Subsystem" },
            { key: "message", label: "Message" }
          ],
          rows: model.rows,
          selectedRowId: model.selected?.id,
          emptyTitle: "No log entries",
          emptyMessage:
            "Runtime events, partial RPC failures, and notifications appear here."
        })}
      </article>
    </section>
  `;
}
