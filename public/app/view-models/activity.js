import { humanize } from "../utils.js";

export function createActivityViewModel(state) {
  const snapshot = state.activitySnapshot || { items: [] };
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const selected =
    items.find((item) => item.id === state.selectedActivityItemId) || items[0] || null;

  return {
    rows: items.map((item) => ({
      id: item.id,
      clickable: true,
      cells: {
        timestamp: item.timestampLabel,
        type: humanize(item.type || item.category || "event"),
        headline: item.title,
        readiness: humanize(item.readiness || item.probeStatus || "unknown"),
        source: humanize(item.source || "unknown")
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
                { label: "Category", value: humanize(selected.category || "event") },
                { label: "Readiness", value: humanize(selected.readiness || selected.probeStatus || "unknown") },
                { label: "Source", value: humanize(selected.source || "unknown") },
                { label: "Severity", value: humanize(selected.severity || "info") }
              ]
            },
            {
              title: "Message",
              fields: [
                { label: "Summary", value: selected.message || "No additional detail" },
                { label: "Tags", value: (selected.tags || []).join(", ") || "None" }
              ]
            }
          ]
        }
      : null
  };
}
