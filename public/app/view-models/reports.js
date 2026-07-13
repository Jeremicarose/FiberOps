import { humanize, shortenHash } from "../utils.js";

export function createReportsViewModel(state) {
  const reports = deriveReports(state);
  const selected =
    reports.find((item) => item.id === state.selectedReportId) ||
    reports[0] ||
    null;

  return {
    rows: reports.map((item) => ({
      id: item.id,
      clickable: true,
      cells: {
        report: {
          text: item.title,
          meta: item.scope
        },
        type: {
          text: humanize(item.type),
          tone: item.tone
        },
        freshness: {
          text: item.freshness,
          meta: item.timestampLabel
        },
        summary: {
          text: item.summary,
          meta: item.actionLabel
        }
      }
    })),
    selected,
    inspector: selected
      ? {
          entityType: "report",
          entityId: selected.id,
          title: selected.title,
          subtitle: `${selected.timestampLabel} · ${selected.scope}`,
          sections: [
            {
              title: "Report detail",
              fields: [
                { label: "Type", value: humanize(selected.type) },
                { label: "Scope", value: selected.scope },
                { label: "Freshness", value: selected.freshness },
                { label: "Export", value: selected.actionLabel }
              ]
            },
            {
              title: "Summary",
              fields: [
                { label: "Narrative", value: selected.summary },
                {
                  label: "Reference",
                  value: selected.reference || "Current workspace"
                }
              ]
            }
          ]
        }
      : null
  };
}

function deriveReports(state) {
  const reports = [];
  const now = Date.now();

  if (state.lastDiagnosisResult) {
    reports.push({
      id: "current-investigation",
      title: "Current investigation summary",
      type: "investigation",
      tone: "positive",
      scope:
        state.lastDiagnosisResult.summary?.endpoint ||
        state.lastDiagnosisResult.summary?.targetPubkey ||
        "Current workspace",
      freshness: "Current",
      timestampLabel: new Date(
        state.lastDiagnosisResult.analyzedAt || now
      ).toLocaleString(),
      summary:
        state.lastDiagnosisResult.diagnosis?.headline ||
        "Latest diagnosis ready for export",
      actionLabel: "Copy JSON bundle",
      reference: shortenHash(state.lastDiagnosisResult.event?.id || "", 18)
    });
  }

  if ((state.nodesSnapshot?.nodes || []).length) {
    reports.push({
      id: "node-posture",
      title: "Node posture snapshot",
      type: "network",
      tone: "neutral",
      scope: `${state.nodesSnapshot.nodes.length} configured node(s)`,
      freshness: "Snapshot",
      timestampLabel: new Date(now).toLocaleString(),
      summary:
        "Node readiness, route proof, and outbound posture for the active environment.",
      actionLabel: "Copy node summary",
      reference: state.environment?.name || "Current environment"
    });
  }

  if ((state.activitySnapshot?.items || []).length) {
    reports.push({
      id: "recent-activity",
      title: "Recent incident timeline",
      type: "timeline",
      tone: "warning",
      scope: `${Math.min(state.activitySnapshot.items.length, 10)} recent item(s)`,
      freshness: "Rolling",
      timestampLabel: new Date(now).toLocaleString(),
      summary:
        "Condensed activity timeline for judge walkthroughs and postmortems.",
      actionLabel: "Copy timeline markdown",
      reference: shortenHash(state.activitySnapshot.items[0]?.id || "", 18)
    });
  }

  return reports;
}
