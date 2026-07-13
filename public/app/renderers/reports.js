import { renderDataTable, renderPanelHead } from "./shared.js";
import { escapeHtml } from "../utils.js";

export function renderReports(dom, model) {
  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--reports">
      <header class="workspace-pagehead">
        <div>
          <span class="rail-label">Validate / Reports</span>
          <h2>Export investigation and network summaries</h2>
          <p>Export the current investigation or network summary in one step.</p>
        </div>
      </header>

      <section class="workspace-grid workspace-grid--reports">
        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Available reports",
            title: "Exportable artifacts",
            detail: "Select a row to preview its scope in the inspector."
          })}
          ${renderDataTable({
            columns: [
              { key: "report", label: "Report" },
              { key: "type", label: "Type" },
              { key: "freshness", label: "Freshness" },
              { key: "summary", label: "Summary" }
            ],
            rows: model.rows,
            selectedRowId: model.selected?.id,
            emptyTitle: "No reports available",
            emptyMessage:
              "Run diagnostics or node collection to generate reportable context."
          })}
        </article>

        <article class="panel-surface panel-surface--hint">
          ${renderPanelHead({
            eyebrow: "Export actions",
            title: "Copy or share",
            detail: "Reports export the current app state."
          })}
          <div class="action-list">
            <button type="button" class="action-list__item" data-report-export="json">
              <div>
                <strong>Copy JSON bundle</strong>
                <p>Investigation, nodes, and activity.</p>
              </div>
              <span>JSON</span>
            </button>
            <button type="button" class="action-list__item" data-report-export="markdown">
              <div>
                <strong>Copy Markdown summary</strong>
                <p>Readable summary for notes or issues.</p>
              </div>
              <span>MD</span>
            </button>
            <button type="button" class="action-list__item" data-report-export="timeline">
              <div>
                <strong>Copy activity timeline</strong>
                <p>Condensed history with timestamps.</p>
              </div>
              <span>Log</span>
            </button>
          </div>
          <p class="panel-note">
            ${
              model.selected
                ? escapeHtml(`Selected report: ${model.selected.title}`)
                : "Select a report row to preview its scope in the inspector."
            }
          </p>
        </article>
      </section>
    </section>
  `;
}
