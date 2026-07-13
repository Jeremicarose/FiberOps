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
    rows: nodes.map((node) => ({
      id: node.id,
      clickable: true,
      cells: {
        name: node.name,
        readiness: humanize(
          node.summary?.paymentReadiness || node.routeStatus || "unknown"
        ),
        endpoint: node.endpoint,
        outbound: node.summary?.estimatedOutbound || "Unknown",
        readyChannels: String(node.summary?.readyChannels ?? "—"),
        probe: humanize(node.routeStatus || node.probe?.status || "unknown")
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
                  label: "Outbound",
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
                  value: humanize(selected.summary?.targetVisibility || "unknown")
                },
                {
                  label: "Route proof",
                  value: humanize(selected.summary?.routeProof || "unknown")
                },
                { label: "Errors", value: selected.error?.message || "None" }
              ]
            }
          ]
        }
      : null
  };
}
