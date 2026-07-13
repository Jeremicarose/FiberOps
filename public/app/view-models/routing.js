import { humanize, shortenHash } from "../utils.js";

export function createRoutingViewModel(state) {
  const routePreview =
    state.lastExecutionPlan?.routePreview ||
    state.lastDiagnosisResult?.routePreview ||
    null;
  const routeBuild = routePreview?.routeBuild || {};
  const selectedRoute = routePreview?.chosenRoute || null;

  return {
    hero: {
      eyebrow: "Route analysis",
      title:
        routePreview?.blockingReason ||
        (routePreview
          ? "Candidate routes and blockers"
          : "Preview route posture before you escalate to a full diagnosis"),
      body: routePreview?.evidenceSource
        ? `Current preview is backed by ${routePreview.evidenceSource}.`
        : "Use route analysis to answer why a path fails, which candidate is best, and whether sender perspective changes the outcome.",
      status: humanize(routePreview?.status || "waiting"),
      statusTone:
        routePreview?.status === "ready"
          ? "positive"
          : routePreview?.status === "blocked"
            ? "critical"
            : "warning"
    },
    summary: routePreview
      ? [
          {
            label: "Route state",
            value: humanize(routePreview.status || "unknown"),
            tone:
              routePreview.status === "ready"
                ? "positive"
                : routePreview.status === "blocked"
                  ? "critical"
                  : "warning",
            detail: routePreview.evidenceSource || "No evidence source"
          },
          {
            label: "Confidence",
            value: humanize(routePreview.confidence || "unknown"),
            tone:
              routePreview.confidence === "high"
                ? "positive"
                : routePreview.confidence === "low"
                  ? "warning"
                  : "neutral",
            detail:
              routePreview.evidenceMode || routePreview.mode || "Unknown mode"
          },
          {
            label: "Requested amount",
            value: routePreview.requestedAmount || "Not specified",
            tone: "neutral",
            detail: routePreview.estimatedOutbound
              ? `Estimated outbound ${routePreview.estimatedOutbound}`
              : "No sender capacity estimate"
          },
          {
            label: "Candidate count",
            value: String(routePreview.routeAlternatives?.length || 0),
            tone:
              (routePreview.routeAlternatives?.length || 0) > 0
                ? "positive"
                : "warning",
            detail: selectedRoute?.pathPubkeys?.length
              ? `Chosen path ${selectedRoute.pathPubkeys
                  .map((pubkey) => shortenHash(pubkey, 10))
                  .join(" → ")}`
              : "No chosen route"
          }
        ]
      : [],
    candidates: (routePreview?.routeAlternatives || []).map(
      (candidate, index) => ({
        id: candidate.id,
        rank: index + 1,
        status: candidate.status,
        title: candidate.pathPubkeys?.length
          ? candidate.pathPubkeys
              .map((pubkey) => shortenHash(pubkey, 12))
              .join(" → ")
          : `Candidate ${index + 1}`,
        path: candidate.pathPubkeys?.join(" → ") || "No path built",
        hops: candidate.hopCount,
        fee: candidate.totalFee,
        amount: candidate.totalAmount,
        reason: candidate.blockingError || null
      })
    ),
    limitations: routePreview?.limitations || [],
    blockingReason: routePreview?.blockingReason || null,
    feeHint: routePreview?.feeHint || null,
    workflowTips: [
      "Open this workspace when the route itself is the question.",
      "Switch to Diagnostics when you need checks, evidence, and operator-facing next actions.",
      "Compare route candidates before changing node context or retrying the payment."
    ],
    inspector: selectedRoute
      ? {
          entityType: "route",
          entityId:
            selectedRoute.id ||
            selectedRoute.pathPubkeys?.join(":") ||
            "chosen-route",
          title: "Chosen route",
          subtitle:
            selectedRoute.pathPubkeys
              ?.map((pubkey) => shortenHash(pubkey, 10))
              .join(" → ") || "Unknown path",
          sections: [
            {
              title: "Path evidence",
              fields: [
                { label: "Hops", value: selectedRoute.hopCount ?? "—" },
                {
                  label: "Total amount",
                  value: selectedRoute.totalAmount || "Unknown"
                },
                {
                  label: "Estimated fee",
                  value: selectedRoute.totalFee || "Unknown"
                },
                {
                  label: "Total expiry",
                  value: selectedRoute.totalExpiry || "Unknown"
                }
              ]
            },
            {
              title: "Decision context",
              fields: [
                {
                  label: "Decision reason",
                  value:
                    routeBuild.reasoning ||
                    routePreview?.routeDecisionReason ||
                    "Not provided"
                }
              ]
            }
          ]
        }
      : null
  };
}
