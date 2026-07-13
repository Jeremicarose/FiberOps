import { humanizeToken } from "./shared.js";

export function buildAlerts({
  request,
  context,
  diagnosis,
  summary,
  routePreview,
  scenario
}) {
  const alerts = [];
  const scenarioLabel = scenario?.name || null;

  if (
    [
      "rpc_unavailable",
      "rpc_unauthorized",
      "insufficient_liquidity",
      "channel_not_ready"
    ].includes(diagnosis.category)
  ) {
    alerts.push({
      id: buildStableId(
        `diagnosis-${diagnosis.category}-${request.endpoint || scenario?.id || "global"}`
      ),
      severity: diagnosis.severity,
      title: diagnosis.headline,
      message: diagnosis.explanation,
      cause: diagnosis.category,
      suggestedAction:
        diagnosis.nextActions[0] || "Inspect the diagnosis details.",
      dedupeKey: `${diagnosis.category}:${request.endpoint || scenario?.id || "global"}`
    });
  }

  for (const [key, error] of Object.entries(context.partialErrors || {})) {
    alerts.push({
      id: buildStableId(`partial-${key}-${error.code}-${error.method}`),
      severity: "medium",
      title: `${humanizeToken(key)} RPC read degraded`,
      message: error.message,
      cause: "partial_rpc_failure",
      suggestedAction: `Retry the ${humanizeToken(key).toLowerCase()} read and verify the RPC method permissions or availability.`,
      dedupeKey: `partial_rpc_failure:${key}:${error.code}`
    });
  }

  if (routePreview.status === "blocked" && routePreview.blockingReason) {
    alerts.push({
      id: buildStableId(
        `route-preview-${diagnosis.category}-${routePreview.blockingReason}`
      ),
      severity: diagnosis.severity === "low" ? "medium" : diagnosis.severity,
      title: "Route preview is blocked",
      message: routePreview.blockingReason,
      cause: diagnosis.category,
      suggestedAction:
        diagnosis.nextActions[0] ||
        "Inspect channel state and invoice data before retrying.",
      dedupeKey: `route_preview:${diagnosis.category}:${routePreview.blockingReason}`
    });
  }

  if (
    summary.paymentReadiness === "degraded" &&
    !alerts.some((alert) => alert.cause === "partial_rpc_failure")
  ) {
    alerts.push({
      id: buildStableId(
        `payment-readiness-${request.endpoint || scenario?.id || "global"}`
      ),
      severity: "medium",
      title: "Monitoring snapshot is degraded",
      message: `FiberOps collected a partial snapshot${scenarioLabel ? ` for ${scenarioLabel}` : ""}. Some operator signals may be incomplete.`,
      cause: "snapshot_degraded",
      suggestedAction:
        "Retry the snapshot once the missing RPC reads are available.",
      dedupeKey: `snapshot_degraded:${request.endpoint || scenario?.id || "global"}`
    });
  }

  return dedupeAlerts(alerts);
}

function dedupeAlerts(alerts) {
  const seen = new Set();
  return alerts.filter((alert) => {
    if (seen.has(alert.dedupeKey)) {
      return false;
    }
    seen.add(alert.dedupeKey);
    return true;
  });
}

function buildStableId(value) {
  let hash = 0;
  for (const character of String(value)) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `evt_${hash.toString(16).padStart(8, "0")}`;
}
