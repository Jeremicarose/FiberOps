import { humanize } from "../utils.js";

export function createActivityViewModel(state) {
  const snapshot = state.activitySnapshot || { items: [] };
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const selected =
    items.find((item) => item.id === state.selectedActivityItemId) ||
    items[0] ||
    null;

  return {
    metrics: [
      {
        label: "Events in view",
        value: String(items.length),
        tone: items.length ? "positive" : "muted",
        detail: "Merged server history and local incident ledger"
      },
      {
        label: "Critical",
        value: String(
          items.filter((item) =>
            ["critical", "error"].includes(
              String(item.severity || "").toLowerCase()
            )
          ).length
        ),
        tone: "critical",
        detail: "Recent incidents needing immediate attention"
      },
      {
        label: "Selected",
        value: selected ? humanize(selected.category || "event") : "None",
        tone: "neutral",
        detail: selected?.timestampLabel || "Choose an event to inspect"
      }
    ],
    rows: items.map((item) => ({
      id: item.id,
      clickable: true,
      cells: {
        timestamp: {
          text: item.timestampLabel,
          meta: humanize(item.source || "unknown")
        },
        type: {
          text: humanize(item.type || item.category || "event"),
          tone:
            String(item.severity || "").toLowerCase() === "critical"
              ? "critical"
              : "warning"
        },
        headline: {
          text: item.title,
          meta: item.message
        },
        readiness: {
          text: humanize(item.readiness || item.probeStatus || "unknown"),
          tone:
            item.readiness === "healthy" || item.readiness === "ready"
              ? "positive"
              : item.readiness === "blocked"
                ? "critical"
                : "warning"
        }
      }
    })),
    timeline: items.map((item) => ({
      title: item.title,
      message: item.message,
      timestamp: item.timestamp,
      severity: item.severity || item.status,
      tags: item.tags || []
    })),
    selected,
    inspector: selected
      ? {
          entityType: "activity",
          entityId: selected.id,
          title: selected.title,
          subtitle: selected.timestampLabel,
          sections: [
            {
              title: "Event detail",
              fields: [
                {
                  label: "Category",
                  value: humanize(selected.category || "event")
                },
                {
                  label: "Readiness",
                  value: humanize(
                    selected.readiness || selected.probeStatus || "unknown"
                  )
                },
                {
                  label: "Source",
                  value: humanize(selected.source || "unknown")
                },
                {
                  label: "Severity",
                  value: humanize(selected.severity || "info")
                }
              ]
            },
            {
              title: "Message",
              fields: [
                {
                  label: "Summary",
                  value: selected.message || "No additional detail"
                },
                {
                  label: "Tags",
                  value: (selected.tags || []).join(", ") || "None"
                }
              ]
            }
          ]
        }
      : null
  };
}
