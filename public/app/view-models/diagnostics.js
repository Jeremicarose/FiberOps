import { humanize } from "../utils.js";

export function createDiagnosticsViewModel(state) {
  const result = state.lastDiagnosisResult;
  const diagnosis = result?.diagnosis || null;
  const summary = result?.summary || {};
  const routePreview = result?.routePreview || {};
  const latestNode =
    state.nodesSnapshot?.nodes?.find(
      (node) => node.id === state.selectedNodeId
    ) ||
    state.nodesSnapshot?.nodes?.[0] ||
    null;
  const activePreset = state.activePreset || null;
  const mode = state.mode;

  return {
    hero: {
      eyebrow: mode === "live" ? "Live investigation" : "Replay investigation",
      title:
        diagnosis?.headline ||
        "Explain a payment failure, node issue, or route blocker without losing context",
      body:
        diagnosis?.explanation ||
        "Investigations combine request inputs, current verdict, evidence, multi-node context, and next actions in one workspace.",
      status: humanize(
        diagnosis?.severity || summary.paymentReadiness || "waiting"
      ),
      statusTone:
        summary.paymentReadiness === "ready" ||
        summary.paymentReadiness === "healthy"
          ? "positive"
          : summary.paymentReadiness === "blocked"
            ? "critical"
            : "warning"
    },
    contextCards: [
      {
        label: "Observation mode",
        value: mode === "live" ? "Live node" : "Replay scenario",
        detail:
          mode === "live"
            ? state.diagnosticsDraft.endpoint ||
              "Primary endpoint from bootstrap"
            : state.diagnosticsDraft.scenarioId || "Choose a scenario"
      },
      {
        label: "Selected node",
        value: latestNode?.name || "No node selected",
        detail: latestNode?.summary?.paymentReadiness
          ? humanize(latestNode.summary.paymentReadiness)
          : "Node snapshot unavailable"
      },
      {
        label: "Launch source",
        value: activePreset?.title || activePreset?.id || "Manual run",
        detail:
          activePreset?.description ||
          "Use recent activity, command palette, or simulations to prefill this workspace"
      }
    ],
    severity: humanize(diagnosis?.severity || "waiting"),
    metrics: result
      ? [
          {
            label: "Verdict",
            value: humanize(summary.paymentReadiness || "unknown"),
            tone:
              summary.paymentReadiness === "ready" ||
              summary.paymentReadiness === "healthy"
                ? "positive"
                : summary.paymentReadiness === "blocked"
                  ? "critical"
                  : "warning",
            detail: diagnosis?.headline || "No current diagnosis headline"
          },
          {
            label: "Route evidence",
            value: humanize(summary.routeProof || "unknown"),
            tone:
              summary.routeProof === "confirmed"
                ? "positive"
                : summary.routeProof === "blocked"
                  ? "critical"
                  : "warning",
            detail: routePreview.evidenceSource || "No route preview evidence"
          },
          {
            label: "Sender posture",
            value: latestNode?.summary?.estimatedOutbound || "Unknown",
            tone: "neutral",
            detail: latestNode?.name || summary.endpoint || "No selected sender"
          },
          {
            label: "Next operator move",
            value: diagnosis?.nextActions?.[0] || "Review evidence",
            tone: "neutral",
            detail:
              routePreview.blockingReason ||
              summary.paymentStatus ||
              "No blocking reason recorded"
          }
        ]
      : [],
    checks: diagnosis?.checks || [],
    evidence: diagnosis?.evidence || [],
    actions: diagnosis?.nextActions || [],
    references: diagnosis?.references || [],
    workflowTips: [
      "Start from a payment, route, or node state rather than from a blank form.",
      "Keep the selected sender context stable while comparing alternate explanations.",
      "Export a report when the investigation is clear enough for another operator or judge."
    ]
  };
}
