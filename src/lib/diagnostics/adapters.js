import {
  DIAGNOSIS_CONTRACT_VERSION,
  DIAGNOSIS_OUTPUT_MODES
} from "./contracts.js";

export function formatDiagnosisOutput(result, outputMode = "full") {
  const normalizedMode = DIAGNOSIS_OUTPUT_MODES.includes(outputMode)
    ? outputMode
    : "full";

  if (normalizedMode === "full") {
    return result;
  }
  if (normalizedMode === "machine") {
    return toMachineExport(result);
  }
  if (normalizedMode === "operator") {
    return toOperatorExport(result);
  }
  if (normalizedMode === "backend") {
    return toBackendExport(result);
  }
  return toWalletExport(result);
}

export function toMachineExport(result) {
  return {
    contractVersion: DIAGNOSIS_CONTRACT_VERSION,
    outputMode: "machine",
    analyzedAt: result.analyzedAt,
    source: result.source,
    endpoint: result.summary?.endpoint || result.event?.endpoint || null,
    category: result.diagnosis?.category || null,
    severity: result.diagnosis?.severity || null,
    confidence: result.diagnosis?.confidence ?? null,
    readiness: result.summary?.paymentReadiness || null,
    routeStatus: result.routePreview?.status || null,
    targetPubkey: result.summary?.targetPubkey || null,
    requestedAmount: result.routePreview?.requestedAmount || null,
    estimatedOutbound: result.routePreview?.estimatedOutbound || null,
    blockingReason: result.routePreview?.blockingReason || null,
    nextActions: result.diagnosis?.nextActions || [],
    tags: result.event?.tags || [],
    alerts: (result.alerts || []).map((alert) => ({
      severity: alert.severity,
      cause: alert.cause,
      title: alert.title
    }))
  };
}

export function toOperatorExport(result) {
  return {
    contractVersion: DIAGNOSIS_CONTRACT_VERSION,
    outputMode: "operator",
    incident: {
      id: result.event?.id || null,
      observedAt: result.analyzedAt,
      source: result.source,
      endpoint: result.summary?.endpoint || result.event?.endpoint || null,
      category: result.diagnosis?.category || null,
      severity: result.diagnosis?.severity || null,
      headline: result.diagnosis?.headline || null
    },
    triage: {
      readiness: result.summary?.paymentReadiness || null,
      routeStatus: result.routePreview?.status || null,
      blockingReason: result.routePreview?.blockingReason || null,
      primaryAction: result.diagnosis?.nextActions?.[0] || null,
      topAlert: result.alerts?.[0] || null
    },
    checks: result.diagnosis?.checks || [],
    evidence: result.diagnosis?.evidence || [],
    references: result.diagnosis?.references || []
  };
}

export function toBackendExport(result) {
  return {
    contractVersion: DIAGNOSIS_CONTRACT_VERSION,
    outputMode: "backend",
    status: {
      category: result.diagnosis?.category || null,
      severity: result.diagnosis?.severity || null,
      readiness: result.summary?.paymentReadiness || null,
      routeStatus: result.routePreview?.status || null,
      endpoint: result.summary?.endpoint || result.event?.endpoint || null,
      source: result.source
    },
    event: result.event || null,
    metrics: {
      openChannels: result.summary?.openChannels ?? null,
      readyChannels: result.summary?.readyChannels ?? null,
      totalChannels: result.summary?.totalChannels ?? null,
      peerCount: result.summary?.peerCount ?? null,
      partialErrorCount: result.summary?.partialErrorCount ?? null,
      routeProof: result.summary?.routeProof ?? null,
      targetVisibility: result.summary?.targetVisibility ?? null,
      multiNode: result.summary?.multiNode || null
    },
    alerts: (result.alerts || []).map((alert) => ({
      severity: alert.severity,
      cause: alert.cause,
      suggestedAction: alert.suggestedAction
    }))
  };
}

export function toWalletExport(result) {
  return {
    contractVersion: DIAGNOSIS_CONTRACT_VERSION,
    outputMode: "wallet",
    preflight: {
      canSend:
        result.routePreview?.status === "ready" ||
        result.diagnosis?.category === "success",
      category: result.diagnosis?.category || null,
      routeStatus: result.routePreview?.status || null,
      blockingReason: result.routePreview?.blockingReason || null,
      targetPubkey: result.summary?.targetPubkey || null,
      requestedAmount: result.routePreview?.requestedAmount || null,
      estimatedOutbound: result.routePreview?.estimatedOutbound || null,
      invoiceExpired: result.summary?.invoiceExpired ?? null,
      targetInGraph: result.summary?.targetInGraph ?? null,
      targetVisibility: result.summary?.targetVisibility ?? null,
      routeProof: result.summary?.routeProof ?? null
    },
    advice: (result.diagnosis?.nextActions || []).slice(0, 3)
  };
}
