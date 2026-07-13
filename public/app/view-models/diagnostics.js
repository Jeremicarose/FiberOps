import { humanize } from "../utils.js";

export function createDiagnosticsViewModel(state) {
  const result = state.lastDiagnosisResult;
  const diagnosis = result?.diagnosis || null;
  const summary = result?.summary || {};

  return {
    headline:
      diagnosis?.headline ||
      "Run diagnostics to inspect a payment, route, or node health snapshot.",
    explanation:
      diagnosis?.explanation ||
      "Results render in place and preserve the last successful context if a later request fails.",
    severity: humanize(diagnosis?.severity || "waiting"),
    metrics: result
      ? [
          {
            label: "Payment readiness",
            value: humanize(summary.paymentReadiness || "unknown"),
            tone:
              summary.paymentReadiness === "ready" ||
              summary.paymentReadiness === "healthy"
                ? "positive"
                : summary.paymentReadiness === "blocked"
                  ? "critical"
                  : "warning",
            detail: summary.paymentStatus || "No payment status"
          },
          {
            label: "Route proof",
            value: humanize(summary.routeProof || "unknown"),
            tone:
              summary.routeProof === "confirmed"
                ? "positive"
                : summary.routeProof === "blocked"
                  ? "critical"
                  : "warning",
            detail:
              result.routePreview?.evidenceSource || "No route preview evidence"
          },
          {
            label: "Estimated outbound",
            value: summary.estimatedOutbound || "Unknown",
            tone: "neutral",
            detail: summary.endpoint || "No endpoint"
          }
        ]
      : [],
    checks: diagnosis?.checks || [],
    evidence: diagnosis?.evidence || [],
    actions: diagnosis?.nextActions || [],
    references: diagnosis?.references || []
  };
}
