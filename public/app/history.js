import { HISTORY_KEY, HISTORY_LIMIT } from "./constants.js";

export function appendIncident(event, summary, diagnosis, scenario) {
  if (!event?.id) {
    return;
  }

  const history = readIncidentHistory().filter((item) => item.id !== event.id);
  history.unshift({
    id: event.id,
    timestamp: event.timestamp,
    severity: event.severity,
    category: event.category,
    headline: event.headline,
    source: event.source,
    endpointOrScenario:
      scenario?.name || event.endpoint || event.scenarioId || "Unknown",
    summary: {
      paymentStatus: summary?.paymentStatus || null,
      estimatedOutbound: summary?.estimatedOutbound || null,
      paymentReadiness: summary?.paymentReadiness || null
    },
    diagnosis: {
      category: diagnosis?.category || null
    }
  });

  writeIncidentHistory(history.slice(0, HISTORY_LIMIT));
}

export function readIncidentHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function installHistorySync(onChange) {
  const listener = (event) => {
    if (event.key === HISTORY_KEY) {
      onChange();
    }
  };

  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("storage", listener);
  };
}

function writeIncidentHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}
