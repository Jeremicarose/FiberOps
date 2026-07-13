import {
  escapeHtml,
  formatTimestamp,
  humanize,
  sanitizeReferenceUrl,
  shortenHash,
  valueOrDash
} from "../utils.js";

export function renderKeyValueList(items = []) {
  if (!items.length) {
    return '<div class="empty-state-inline">No details available.</div>';
  }

  return `
    <dl class="kv-list">
      ${items
        .map(
          (item) => `
            <div class="kv-row">
              <dt>${escapeHtml(item.label)}</dt>
              <dd>${escapeHtml(String(item.value ?? "—"))}</dd>
            </div>
          `
        )
        .join("")}
    </dl>
  `;
}

export function renderMetricCards(items = []) {
  if (!items.length) {
    return "";
  }

  return items
    .map(
      (item) => `
        <article class="metric-card metric-card--${safeTone(item.tone)}">
          <span class="metric-card__label">${escapeHtml(item.label)}</span>
          <strong class="metric-card__value">${escapeHtml(String(item.value ?? "—"))}</strong>
          ${item.detail ? `<p class="metric-card__detail">${escapeHtml(item.detail)}</p>` : ""}
        </article>
      `
    )
    .join("");
}

export function renderActionList(items = []) {
  if (!items.length) {
    return renderEmptyState(
      "No recommended actions",
      "Fiber Desktop will list the next useful operator actions here."
    );
  }

  return `
    <div class="action-list">
      ${items
        .map(
          (item) => `
            <button
              type="button"
              class="action-list__item"
              data-quick-action="${escapeHtml(item.id)}"
            >
              <div>
                <strong>${escapeHtml(item.label)}</strong>
                <p>${escapeHtml(item.detail || "")}</p>
              </div>
              <span>${escapeHtml(item.workspace || "Open")}</span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

export function renderPanelHead({ eyebrow, title, detail = "", actions = "" }) {
  return `
    <div class="panel-head">
      <div>
        ${eyebrow ? `<span class="rail-label">${escapeHtml(eyebrow)}</span>` : ""}
        <h3>${escapeHtml(title)}</h3>
        ${detail ? `<p>${escapeHtml(detail)}</p>` : ""}
      </div>
      ${actions}
    </div>
  `;
}

export function renderEmptyState(title, message, actionMarkup = "", options = {}) {
  const compactClass = options.compact ? " empty-state-panel--compact" : "";

  return `
    <div class="empty-state-panel${compactClass}">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
      ${actionMarkup}
    </div>
  `;
}

export function renderInspectorSection(title, body) {
  return `
    <section class="inspector-section">
      <div class="inspector-section__head">
        <h4>${escapeHtml(title)}</h4>
      </div>
      ${body}
    </section>
  `;
}

export function renderInspectorBody({ title, subtitle, sections = [] } = {}) {
  return `
    <article class="inspector-body">
      <header class="inspector-body__header">
        <div>
          <h3>${escapeHtml(title || "Inspector")}</h3>
          ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
        </div>
      </header>
      <div class="inspector-body__sections">
        ${sections.join("")}
      </div>
    </article>
  `;
}

export function renderStatusPill(value, tone = "neutral") {
  return `<span class="status-pill status-pill--${safeTone(tone)}">${escapeHtml(value)}</span>`;
}

export function toneFromSeverity(value) {
  switch (value) {
    case "critical":
    case "high":
    case "blocked":
    case "fail":
    case "failed":
      return "critical";
    case "medium":
    case "warning":
    case "degraded":
      return "warning";
    case "low":
    case "ready":
    case "healthy":
    case "success":
      return "positive";
    default:
      return "neutral";
  }
}

function safeTone(value) {
  return ["neutral", "positive", "warning", "critical", "muted"].includes(value)
    ? value
    : "neutral";
}

function safeDataAttribute(value) {
  return String(value ?? "").replace(/[^a-zA-Z0-9:_-]/g, "");
}

function renderTableCell(cell) {
  if (cell && typeof cell === "object") {
    const text = cell.text ?? "—";
    return `
      <td>
        <div class="table-cell ${cell.mono ? "table-cell--mono" : ""}">
          <strong class="table-cell__primary ${cell.tone ? `table-cell__primary--${safeTone(cell.tone)}` : ""}">${escapeHtml(String(text))}</strong>
          ${cell.meta ? `<span class="table-cell__meta">${escapeHtml(String(cell.meta))}</span>` : ""}
        </div>
      </td>
    `;
  }

  return `<td>${escapeHtml(String(cell ?? "—"))}</td>`;
}

export function renderTrustedReferenceLink(reference) {
  const url = sanitizeReferenceUrl(reference?.url);
  if (!url) {
    return `<span>${escapeHtml(reference?.label || "Reference")}</span>`;
  }

  return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(reference?.label || url)}</a>`;
}

export function renderAlertList(items = []) {
  if (!items.length) {
    return renderEmptyState(
      "No active alerts",
      "Current signals do not require immediate operator action."
    );
  }

  return items
    .map(
      (item) => `
        <article class="signal-card signal-card--${safeTone(
          toneFromSeverity(item.severity || item.status || "neutral")
        )}">
          <div class="signal-card__top">
            <strong>${escapeHtml(item.title)}</strong>
            ${renderStatusPill(
              humanize(item.severity || item.status || "info"),
              toneFromSeverity(item.severity || item.status || "neutral")
            )}
          </div>
          <p>${escapeHtml(item.message || item.detail || "No additional detail.")}</p>
          ${item.meta ? `<div class="signal-card__meta">${escapeHtml(item.meta)}</div>` : ""}
        </article>
      `
    )
    .join("");
}

export function renderTimelineItems(items = []) {
  if (!items.length) {
    return renderEmptyState(
      "No activity yet",
      "Recent incidents, investigations, and state changes will appear here."
    );
  }

  return items
    .map(
      (item) => `
        <article class="timeline-item timeline-item--${safeTone(
          toneFromSeverity(item.severity || item.status || "neutral")
        )}">
          <div class="timeline-item__top">
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(formatTimestamp(item.timestamp || Date.now()))}</span>
          </div>
          <p>${escapeHtml(item.message || "")}</p>
          <div class="timeline-item__meta">
            ${item.tags?.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") || ""}
          </div>
        </article>
      `
    )
    .join("");
}

export function renderDataTable({
  columns = [],
  rows = [],
  emptyTitle,
  emptyMessage,
  selectedRowId = null,
  compact = false
}) {
  if (!rows.length) {
    return renderEmptyState(
      emptyTitle || "No rows",
      emptyMessage || "No data available."
    );
  }

  return `
    <div class="data-table-wrap${compact ? " data-table-wrap--compact" : ""}">
      <table class="data-table${compact ? " data-table--compact" : ""}">
        <thead>
          <tr>
            ${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr
                  data-row-id="${safeDataAttribute(row.id || "")}"
                  ${row.clickable ? 'tabindex="0" role="button"' : ""}
                  ${
                    selectedRowId && row.id === selectedRowId
                      ? 'data-selected="true" aria-selected="true"'
                      : ""
                  }
                >
                  ${columns
                    .map((column) => renderTableCell(row.cells?.[column.key]))
                    .join("")}
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function renderRouteCandidateList(candidates = []) {
  if (!candidates.length) {
    return renderEmptyState(
      "No route candidates",
      "Preview a route to populate candidate paths and blockers."
    );
  }

  return candidates
    .map(
      (candidate) => `
        <article class="candidate-card candidate-card--${safeTone(
          toneFromSeverity(candidate.status || "neutral")
        )}">
          <div class="candidate-card__top">
            <strong>${escapeHtml(
              candidate.title || `Candidate ${candidate.rank || "?"}`
            )}</strong>
            ${renderStatusPill(
              humanize(candidate.status || "unknown"),
              toneFromSeverity(candidate.status || "neutral")
            )}
          </div>
          <p>${escapeHtml(candidate.path || "No path available")}</p>
          <div class="candidate-card__facts">
            <span>Hops ${escapeHtml(String(candidate.hops ?? "—"))}</span>
            <span>Fee ${escapeHtml(String(candidate.fee ?? "—"))}</span>
            <span>Amount ${escapeHtml(String(candidate.amount ?? "—"))}</span>
          </div>
          ${
            candidate.reason
              ? `<div class="candidate-card__reason">${escapeHtml(candidate.reason)}</div>`
              : ""
          }
        </article>
      `
    )
    .join("");
}

export function renderReferenceList(items = []) {
  if (!items.length) {
    return '<div class="empty-state-inline">No references available.</div>';
  }

  return `
    <ul class="reference-list">
      ${items
        .map(
          (item) => `
            <li>${renderTrustedReferenceLink(item)}</li>
          `
        )
        .join("")}
    </ul>
  `;
}

export function renderBulletList(items = []) {
  if (!items.length) {
    return '<div class="empty-state-inline">No items available.</div>';
  }

  return `
    <ul class="bullet-list">
      ${items.map((item) => `<li>${escapeHtml(String(item))}</li>`).join("")}
    </ul>
  `;
}

export function renderNodeBadge(node) {
  return `${escapeHtml(node.name || "Node")} · ${escapeHtml(
    shortenHash(node.endpoint || "", 28) || valueOrDash(node.endpoint)
  )}`;
}
