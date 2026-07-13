import { humanize } from "../utils.js";

export function createOverviewViewModel(state) {
  const runtime = state.runtimeStatus || {};
  const observability = state.observability || runtime.observability || {};
  const historyStatus = state.historyStatus || runtime.history || {};
  const summary = state.lastDiagnosisResult?.summary || {};
  const routePreview = state.lastDiagnosisResult?.routePreview || {};
  const alerts = state.lastDiagnosisResult?.alerts || [];
  const recent = state.activitySnapshot?.items || [];

  return {
    metrics: [
      {
        label: "Workspace health",
        value: humanize(
          summary.paymentReadiness || state.bootstrapState || "loading"
        ),
        tone:
          summary.paymentReadiness === "ready" ||
          summary.paymentReadiness === "healthy"
            ? "positive"
            : summary.paymentReadiness === "blocked"
              ? "critical"
              : "warning",
        detail:
          state.bootstrapState === "failed"
            ? "Bootstrap degraded"
            : "Derived from the latest runtime and diagnosis signals"
      },
      {
        label: "Routing state",
        value: humanize(routePreview.status || "unknown"),
        tone:
          routePreview.status === "ready"
            ? "positive"
            : routePreview.status === "blocked"
              ? "critical"
              : "warning",
        detail: routePreview.evidenceSource || "Waiting for route preview"
      },
      {
        label: "Recent requests",
        value: String(observability.requests?.recent?.requests ?? 0),
        tone: "neutral",
        detail: `${observability.requests?.recent?.errors ?? 0} recent error(s)`
      },
      {
        label: "History backend",
        value: historyStatus.enabled
          ? humanize(historyStatus.type || "enabled")
          : "Disabled",
        tone: historyStatus.degraded
          ? "warning"
          : historyStatus.enabled
            ? "positive"
            : "neutral",
        detail:
          historyStatus.error?.message ||
          "Persistence and related-run comparison status"
      }
    ],
    alerts: alerts.slice(0, 4).map((alert) => ({
      title: alert.title,
      message: alert.message,
      severity: alert.severity,
      meta: alert.suggestedAction || null
    })),
    quickActions: [
      {
        id: "go-diagnostics",
        label: "Run diagnostics",
        workspace: "diagnostics",
        detail: "Open the current draft and run from context"
      },
      {
        id: "go-routing",
        label: "Preview routing",
        workspace: "routing",
        detail: "Carry the last target and amount into routing"
      },
      {
        id: "go-nodes",
        label: "Inspect selected node",
        workspace: "nodes",
        detail: "Jump directly into the node inspector"
      },
      {
        id: "go-activity",
        label: "Open recent activity",
        workspace: "activity",
        detail: "Review the latest incidents and history"
      }
    ],
    recentActivity: recent.slice(0, 5)
  };
}
