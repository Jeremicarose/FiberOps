import { humanize } from "../utils.js";

export function createNodesViewModel(state) {
  const snapshot = state.nodesSnapshot || { nodes: [] };
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
  const selected =
    nodes.find((node) => node.id === state.selectedNodeId) ||
    nodes.find((node) => node.selected) ||
    nodes[0] ||
    null;

  return {
    metrics: [
      {
        label: "Configured nodes",
        value: String(nodes.length),
        tone: nodes.length ? "positive" : "muted",
        detail: "Configured senders and peers currently visible"
      },
      {
        label: "Healthy",
        value: String(
          nodes.filter((node) =>
            ["healthy", "ready"].includes(node.summary?.paymentReadiness)
          ).length
        ),
        tone: "positive",
        detail: "Nodes ready to satisfy current route posture"
      },
      {
        label: "Degraded",
        value: String(
          nodes.filter((node) =>
            ["degraded", "blocked", "not_ready"].includes(
              node.summary?.paymentReadiness
            )
          ).length
        ),
        tone: "warning",
        detail: "Nodes with partial RPC failure or poor payment posture"
      },
      {
        label: "Selected node",
        value: selected?.name || "None",
        tone: "neutral",
        detail: selected?.endpoint || "Choose a node to inspect"
      }
    ],
    rows: nodes.map((node) => ({
      id: node.id,
      clickable: true,
      cells: {
        name: {
          text: node.name,
          meta: node.endpoint
        },
        readiness: {
          text: humanize(
            node.summary?.paymentReadiness || node.routeStatus || "unknown"
          ),
          tone:
            node.summary?.paymentReadiness === "ready" ||
            node.summary?.paymentReadiness === "healthy"
              ? "positive"
              : node.summary?.paymentReadiness === "blocked"
                ? "critical"
                : "warning"
        },
        peers: {
          text: String(node.summary?.peerCount ?? "—"),
          meta: `${node.summary?.openChannels ?? 0} open channel(s)`
        },
        outbound: {
          text: node.summary?.estimatedOutbound || "Unknown",
          mono: true
        },
        proof: {
          text: humanize(
            node.summary?.routeProof || node.routeStatus || "unknown"
          ),
          tone:
            node.summary?.routeProof === "confirmed" ? "positive" : "warning"
        },
        visibility: {
          text: humanize(node.summary?.targetVisibility || "unknown"),
          meta: node.error?.message || null
        }
      }
    })),
    selected,
    inspector: selected
      ? {
          entityType: "node",
          entityId: selected.id,
          title: selected.name,
          subtitle: selected.endpoint,
          sections: [
            {
              title: "Health snapshot",
              fields: [
                {
                  label: "Readiness",
                  value: humanize(
                    selected.summary?.paymentReadiness ||
                      selected.routeStatus ||
                      "unknown"
                  )
                },
                {
                  label: "Estimated outbound",
                  value: selected.summary?.estimatedOutbound || "Unknown"
                },
                {
                  label: "Open channels",
                  value: selected.summary?.openChannels ?? "—"
                },
                {
                  label: "Ready channels",
                  value: selected.summary?.readyChannels ?? "—"
                }
              ]
            },
            {
              title: "Routing posture",
              fields: [
                {
                  label: "Target visibility",
                  value: humanize(
                    selected.summary?.targetVisibility || "unknown"
                  )
                },
                {
                  label: "Route proof",
                  value: humanize(selected.summary?.routeProof || "unknown")
                },
                { label: "Error", value: selected.error?.message || "None" },
                {
                  label: "Probe",
                  value: humanize(selected.routeStatus || "unknown")
                }
              ]
            }
          ]
        }
      : null
  };
}
