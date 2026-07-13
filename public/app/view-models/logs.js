import { humanize, shortenHash } from "../utils.js";

export function createLogsViewModel(state) {
  const rows = deriveLogs(state);
  const selected =
    rows.find((item) => item.id === state.selectedLogId) || rows[0] || null;

  return {
    rows: rows.map((item) => ({
      id: item.id,
      clickable: true,
      cells: {
        time: {
          text: item.timestampLabel,
          meta: item.source
        },
        level: {
          text: humanize(item.level),
          tone: item.tone
        },
        subsystem: {
          text: item.subsystem,
          meta: item.nodeName || null
        },
        message: {
          text: item.message,
          meta: item.meta
        }
      }
    })),
    selected,
    inspector: selected
      ? {
          entityType: "log",
          entityId: selected.id,
          title: `${humanize(selected.level)} · ${selected.subsystem}`,
          subtitle: `${selected.timestampLabel} · ${selected.source}`,
          sections: [
            {
              title: "Event detail",
              fields: [
                { label: "Level", value: humanize(selected.level) },
                { label: "Subsystem", value: selected.subsystem },
                { label: "Source", value: selected.source },
                { label: "Node", value: selected.nodeName || "N/A" }
              ]
            },
            {
              title: "Message",
              fields: [
                { label: "Summary", value: selected.message },
                { label: "Meta", value: selected.meta || "None" },
                {
                  label: "Reference",
                  value: selected.reference || "Not linked"
                }
              ]
            }
          ]
        }
      : null
  };
}

function deriveLogs(state) {
  const entries = [];
  const now = Date.now();

  for (const notification of state.ui.notifications || []) {
    entries.push({
      id: notification.id,
      timestamp: notification.timestamp,
      timestampLabel: new Date(notification.timestamp).toLocaleString(),
      level:
        notification.kind === "error"
          ? "critical"
          : notification.kind === "warning"
            ? "warning"
            : "info",
      tone:
        notification.kind === "error"
          ? "critical"
          : notification.kind === "warning"
            ? "warning"
            : "neutral",
      subsystem: "Notification center",
      source: notification.source || "ui",
      nodeName: null,
      message: notification.title,
      meta: notification.message
    });
  }

  for (const node of state.nodesSnapshot?.nodes || []) {
    if (node.error) {
      entries.push({
        id: `${node.id}-fatal`,
        timestamp: now,
        timestampLabel: new Date(now).toLocaleString(),
        level: "critical",
        tone: "critical",
        subsystem: "Node transport",
        source: "node snapshot",
        nodeName: node.name,
        message: node.error.message || "Node request failed.",
        meta: node.endpoint
      });
    }

    for (const [key, value] of Object.entries(node.partialErrors || {})) {
      entries.push({
        id: `${node.id}-${key}`,
        timestamp: now,
        timestampLabel: new Date(now).toLocaleString(),
        level: "warning",
        tone: "warning",
        subsystem: humanize(key),
        source: "partial RPC",
        nodeName: node.name,
        message: value?.message || "Partial request failed.",
        meta: value?.endpoint || value?.method || null
      });
    }
  }

  const recentRequests = state.observability?.requests?.recent || null;
  if (recentRequests) {
    entries.push({
      id: "runtime-observability",
      timestamp: now,
      timestampLabel: new Date(now).toLocaleString(),
      level: recentRequests.errors > 0 ? "warning" : "info",
      tone: recentRequests.errors > 0 ? "warning" : "neutral",
      subsystem: "Observability",
      source: "runtime",
      nodeName: null,
      message: `${recentRequests.requests || 0} recent request(s), ${recentRequests.errors || 0} error(s)`,
      meta: "Rolling runtime counters"
    });
  }

  if (state.lastDiagnosisResult) {
    entries.push({
      id: "latest-diagnosis-log",
      timestamp: new Date(
        state.lastDiagnosisResult.analyzedAt || now
      ).getTime(),
      timestampLabel: new Date(
        state.lastDiagnosisResult.analyzedAt || now
      ).toLocaleString(),
      level:
        state.lastDiagnosisResult.diagnosis?.severity === "critical"
          ? "critical"
          : state.lastDiagnosisResult.summary?.paymentReadiness === "blocked"
            ? "warning"
            : "info",
      tone:
        state.lastDiagnosisResult.summary?.paymentReadiness === "ready"
          ? "positive"
          : state.lastDiagnosisResult.summary?.paymentReadiness === "blocked"
            ? "warning"
            : "neutral",
      subsystem: "Diagnosis",
      source: state.lastDiagnosisResult.source || "diagnosis",
      nodeName:
        state.lastDiagnosisResult.nodes?.find((node) => node.selected)?.name ||
        null,
      message:
        state.lastDiagnosisResult.diagnosis?.headline ||
        "Latest diagnosis completed.",
      meta:
        state.lastDiagnosisResult.routePreview?.blockingReason ||
        shortenHash(state.lastDiagnosisResult.event?.id || "", 18)
    });
  }

  return entries
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 80);
}
