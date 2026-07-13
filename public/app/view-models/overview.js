import { humanize, shortenHash } from "../utils.js";

export function createOverviewViewModel(state) {
  const runtime = state.runtimeStatus || {};
  const observability = state.observability || runtime.observability || {};
  const historyStatus = state.historyStatus || runtime.history || {};
  const summary = state.lastDiagnosisResult?.summary || {};
  const diagnosis = state.lastDiagnosisResult?.diagnosis || {};
  const routePreview = state.lastDiagnosisResult?.routePreview || {};
  const alerts = state.lastDiagnosisResult?.alerts || [];
  const recent = state.activitySnapshot?.items || [];
  const nodes = state.nodesSnapshot?.nodes || [];
  const channels = state.channelsSnapshot?.channels || [];
  const degradedNodes = nodes.filter((node) => {
    const readiness =
      node.summary?.paymentReadiness || node.routeStatus || node.probe?.status;
    return readiness && !["healthy", "ready"].includes(readiness);
  });
  const blockedChannels = channels.filter((channel) => {
    const readiness = String(channel.routeReadiness || "").toLowerCase();
    return readiness === "blocked" || readiness === "degraded";
  });
  const recentFailures = recent.filter((item) => {
    const severity = String(item.severity || "").toLowerCase();
    const readiness = String(
      item.readiness || item.probeStatus || ""
    ).toLowerCase();
    return ["critical", "error"].includes(severity) || readiness === "blocked";
  });

  const topStatus =
    summary.paymentReadiness ||
    state.nodesSnapshot?.aggregateStatus ||
    state.bootstrapState ||
    "unknown";

  return {
    hero: {
      eyebrow: "Operations overview",
      title: "Network health, route posture, and recent failures in one place",
      body:
        diagnosis.headline ||
        "Start with what changed, which node needs attention, and whether payments are succeeding before you open a deeper investigation.",
      status: humanize(topStatus),
      statusTone:
        topStatus === "healthy" || topStatus === "ready"
          ? "positive"
          : topStatus === "blocked" || topStatus === "critical"
            ? "critical"
            : "warning"
    },
    metrics: [
      {
        label: "Network health",
        value: humanize(topStatus),
        tone:
          topStatus === "healthy" || topStatus === "ready"
            ? "positive"
            : topStatus === "blocked"
              ? "critical"
              : "warning",
        detail:
          degradedNodes.length > 0
            ? `${degradedNodes.length} node${degradedNodes.length === 1 ? "" : "s"} need attention`
            : "No degraded configured nodes"
      },
      {
        label: "Payments succeeding",
        value: String(
          Math.max((recent.length || 0) - recentFailures.length, 0)
        ),
        tone: recentFailures.length > 0 ? "warning" : "positive",
        detail: `${recentFailures.length} recent blocked or critical event(s)`
      },
      {
        label: "Nodes in view",
        value: String(nodes.length),
        tone: nodes.length ? "positive" : "muted",
        detail: `${channels.length} channel${channels.length === 1 ? "" : "s"} tracked`
      },
      {
        label: "What changed",
        value: String(Math.min(recent.length, 8)),
        tone: recent.length ? "neutral" : "muted",
        detail: recent[0]?.title || "No new investigation or history signal yet"
      },
      {
        label: "Route readiness",
        value: humanize(routePreview.status || "waiting"),
        tone:
          routePreview.status === "ready"
            ? "positive"
            : routePreview.status === "blocked"
              ? "critical"
              : "warning",
        detail:
          routePreview.evidenceSource ||
          routePreview.blockingReason ||
          "No active route preview"
      },
      {
        label: "History backend",
        value: historyStatus.enabled ? "Enabled" : "Disabled",
        tone: historyStatus.enabled ? "positive" : "warning",
        detail: humanize(historyStatus.type || "unconfigured")
      }
    ],
    attentionQueue: [
      ...alerts.map((alert) => ({
        title: alert.title,
        message: alert.message,
        severity: alert.severity,
        meta: alert.suggestedAction || null
      })),
      ...degradedNodes.slice(0, 3).map((node) => ({
        title: `${node.name} needs attention`,
        message:
          node.error?.message ||
          humanize(
            node.summary?.paymentReadiness || node.routeStatus || "degraded"
          ),
        severity:
          node.summary?.paymentReadiness === "blocked" ? "critical" : "warning",
        meta: node.endpoint
      }))
    ].slice(0, 5),
    nodeWatchlist: nodes.slice(0, 5).map((node) => ({
      id: node.id,
      clickable: true,
      cells: {
        node: {
          text: node.name,
          meta: node.endpoint
        },
        health: {
          text: humanize(
            node.summary?.paymentReadiness || node.routeStatus || "unknown"
          ),
          tone:
            node.summary?.paymentReadiness === "ready" ? "positive" : "warning"
        },
        outbound: {
          text: node.summary?.estimatedOutbound || "Unknown",
          mono: true
        },
        proof: {
          text: humanize(node.summary?.routeProof || "unknown"),
          tone:
            node.summary?.routeProof === "confirmed" ? "positive" : "warning"
        }
      }
    })),
    changeCards: [
      {
        label: "Recent incident",
        title: recent[0]?.title || "No recent incident",
        detail:
          recent[0]?.message ||
          "Run diagnostics or load presets to create an investigation trail."
      },
      {
        label: "Node drift",
        title: degradedNodes[0]?.name
          ? `${degradedNodes[0].name} differs from the primary sender`
          : "No sender disagreement detected",
        detail: degradedNodes[0]?.summary?.paymentReadiness
          ? humanize(degradedNodes[0].summary.paymentReadiness)
          : "Sender perspectives are currently aligned or unavailable."
      },
      {
        label: "Channel risk",
        title:
          blockedChannels.length > 0
            ? `${blockedChannels.length} channel${blockedChannels.length === 1 ? "" : "s"} look route-limiting`
            : "No immediate channel bottleneck",
        detail: blockedChannels[0]?.peerPubkey
          ? `Peer ${shortenHash(blockedChannels[0].peerPubkey, 14)} is part of the current bottleneck set.`
          : "Channel health looks stable from the available snapshot."
      }
    ],
    activeInvestigations: recent.slice(0, 6).map((item) => ({
      title: item.title,
      message: item.message,
      timestamp: item.timestamp,
      severity: item.severity || item.status,
      tags: item.tags || []
    })),
    quickActions: [
      {
        id: "go-diagnostics",
        label: "Diagnose payment",
        workspace: "Diagnostics",
        detail: "Open the investigation workspace with the current context"
      },
      {
        id: "go-payments",
        label: "Search payments",
        workspace: "Payments",
        detail: "Open history, retries, and recent failure clusters"
      },
      {
        id: "go-routing",
        label: "Analyze routes",
        workspace: "Routes",
        detail: "Carry the last target or invoice into route analysis"
      },
      {
        id: "go-nodes",
        label: "Inspect nodes",
        workspace: "Nodes",
        detail: "Open configured node posture and compare sender perspectives"
      },
      {
        id: "go-logs",
        label: "Inspect logs",
        workspace: "Logs",
        detail: "Review partial RPC failures, notifications, and runtime trace"
      },
      {
        id: "go-testing",
        label: "Run simulation",
        workspace: "Simulations",
        detail: "Use guided proof flow and local lab presets"
      }
    ],
    observabilityCards: [
      {
        label: "Recent requests",
        title: `${observability.requests?.recent?.requests ?? 0} request(s)`,
        detail: `${observability.requests?.recent?.errors ?? 0} recent error(s)`
      },
      {
        label: "Recent runs",
        title: `${observability.runs?.completed ?? 0} completed`,
        detail: `${observability.runs?.failed ?? 0} failed`
      }
    ]
  };
}
