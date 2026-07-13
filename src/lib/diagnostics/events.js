import { compact, slugify } from "./shared.js";

export function buildEventEnvelope({
  source,
  request,
  diagnosis,
  scenario,
  summary
}) {
  const timestamp = new Date().toISOString();
  const endpointLabel = request.endpoint || summary.endpoint || null;
  const scenarioId = scenario?.id || diagnosis.scenario?.id || null;

  return {
    id: buildEventId(
      source,
      diagnosis.category,
      scenarioId,
      endpointLabel,
      timestamp
    ),
    timestamp,
    source,
    kind:
      diagnosis.category === "success"
        ? "diagnostic.recovered"
        : "diagnostic.observed",
    category: diagnosis.category,
    severity: diagnosis.severity,
    headline: diagnosis.headline,
    endpoint: endpointLabel,
    scenarioId,
    tags: compact([
      source,
      diagnosis.category,
      diagnosis.severity,
      summary.paymentStatus ? slugify(summary.paymentStatus) : null,
      summary.paymentReadiness ? slugify(summary.paymentReadiness) : null,
      request.paymentHash ? "payment-hash" : null,
      request.invoice ? "invoice" : null,
      request.targetPubkey ? "target-pubkey" : null,
      summary.multiNode?.enabled ? "multi-node" : null
    ])
  };
}

function buildEventId(source, category, scenarioId, endpoint, timestamp) {
  return buildStableId(
    [source, category, scenarioId || endpoint || "global", timestamp].join(":")
  );
}

function buildStableId(value) {
  let hash = 0;
  for (const character of String(value)) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `evt_${hash.toString(16).padStart(8, "0")}`;
}
