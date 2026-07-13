import { buildComparisonKey } from "../history-store.js";

import { compact, formatAmount, pushUnique, toBigIntOrNull } from "./shared.js";

export async function buildHistoryInsights({
  historyStore,
  event,
  request,
  summary,
  diagnosis,
  routePreview,
  nodes
}) {
  const record = {
    event,
    request,
    summary,
    diagnosis: {
      category: diagnosis.category,
      severity: diagnosis.severity,
      headline: diagnosis.headline
    },
    routePreview: {
      status: routePreview.status,
      blockingReason: routePreview.blockingReason,
      probeMethod: routePreview.probeMethod
    },
    probe: routePreview.probe || null,
    nodes: nodes.map((node) => ({
      name: node.name,
      endpoint: node.endpoint,
      summary: node.summary,
      probe: node.probe,
      diagnosis: node.diagnosis
        ? {
            category: node.diagnosis.category,
            severity: node.diagnosis.severity,
            headline: node.diagnosis.headline
          }
        : null,
      routePreview: node.routePreview
        ? {
            status: node.routePreview.status,
            evidenceMode: node.routePreview.evidenceMode,
            blockingReason: node.routePreview.blockingReason
          }
        : null,
      error: node.error
    }))
  };

  try {
    await historyStore.append(record);
    const [related, recent] = await Promise.all([
      historyStore.findRelated(record, { limit: 5 }),
      historyStore.listRecent(10)
    ]);
    const relatedWithoutCurrent = related.filter(
      (item) => item.event?.id !== event.id
    );
    const recentWithoutCurrent = recent.filter(
      (item) => item.event?.id !== event.id
    );
    const previous =
      relatedWithoutCurrent[0] || recentWithoutCurrent[0] || null;
    const comparison = previous
      ? compareHistoryRecords(previous, record)
      : null;
    const recommendations = buildHistoryRecommendations({
      previous,
      current: record,
      comparison,
      related: relatedWithoutCurrent
    });
    const evidence = buildHistoryEvidence({
      previous,
      comparison,
      related: relatedWithoutCurrent,
      recent: recentWithoutCurrent
    });

    return {
      public: {
        comparisonKey: buildComparisonKey(record),
        relatedCount: relatedWithoutCurrent.length,
        recentCount: recentWithoutCurrent.length,
        comparison,
        recommendations,
        recent: recentWithoutCurrent.slice(0, 5).map(compactHistoryRecord),
        related: relatedWithoutCurrent.slice(0, 5).map(compactHistoryRecord)
      },
      recommendations,
      evidence
    };
  } catch (error) {
    return {
      public: {
        error: {
          code: error?.code ?? "HISTORY_WRITE_FAILED",
          message: error?.message || "History persistence failed."
        }
      },
      recommendations: [],
      evidence: [
        {
          label: "History store",
          value: `History persistence failed: ${error?.message || "Unknown error"}`
        }
      ]
    };
  }
}

export function augmentDiagnosisWithHistory(diagnosis, history) {
  for (const evidence of history.evidence || []) {
    if (
      !diagnosis.evidence.some(
        (item) => item.label === evidence.label && item.value === evidence.value
      )
    ) {
      diagnosis.evidence.push(evidence);
    }
  }

  for (const recommendation of history.recommendations || []) {
    pushUnique(diagnosis.nextActions, recommendation);
  }
}

function compareHistoryRecords(previous, current) {
  const previousProbeStatus =
    previous.probe?.status || previous.routePreview?.status || null;
  const currentProbeStatus =
    current.probe?.status || current.routePreview?.status || null;
  const previousRouteProof = previous.summary?.routeProof || null;
  const currentRouteProof = current.summary?.routeProof || null;
  const previousTargetVisibility = previous.summary?.targetVisibility || null;
  const currentTargetVisibility = current.summary?.targetVisibility || null;
  const previousFeeEstimate = toBigIntOrNull(
    previous.summary?.probeFeeEstimate
  );
  const currentFeeEstimate = toBigIntOrNull(current.summary?.probeFeeEstimate);
  const nodeChanges = compareNodeSnapshots(
    previous.nodes || [],
    current.nodes || []
  );

  return {
    categoryChanged:
      previous.diagnosis?.category !== current.diagnosis?.category,
    severityChanged:
      previous.diagnosis?.severity !== current.diagnosis?.severity,
    readinessChanged:
      previous.summary?.paymentReadiness !== current.summary?.paymentReadiness,
    probeStatusChanged: previousProbeStatus !== currentProbeStatus,
    routeProofChanged: previousRouteProof !== currentRouteProof,
    targetVisibilityChanged:
      previousTargetVisibility !== currentTargetVisibility,
    feeEstimateChanged:
      previousFeeEstimate !== null &&
      currentFeeEstimate !== null &&
      previousFeeEstimate !== currentFeeEstimate,
    nodeChanges,
    transitions: compact([
      previous.diagnosis?.category !== current.diagnosis?.category
        ? `${previous.diagnosis?.category || "unknown"} -> ${current.diagnosis?.category || "unknown"}`
        : null,
      previous.summary?.paymentReadiness !== current.summary?.paymentReadiness
        ? `${previous.summary?.paymentReadiness || "unknown"} -> ${current.summary?.paymentReadiness || "unknown"}`
        : null,
      previousProbeStatus !== currentProbeStatus
        ? `${previousProbeStatus || "unknown"} -> ${currentProbeStatus || "unknown"}`
        : null,
      previousRouteProof !== currentRouteProof
        ? `${previousRouteProof || "unknown"} route proof -> ${currentRouteProof || "unknown"}`
        : null,
      previousTargetVisibility !== currentTargetVisibility
        ? `${previousTargetVisibility || "unknown"} target visibility -> ${currentTargetVisibility || "unknown"}`
        : null,
      previousFeeEstimate !== null &&
      currentFeeEstimate !== null &&
      previousFeeEstimate !== currentFeeEstimate
        ? `probe fee ${formatAmount(previousFeeEstimate)} -> ${formatAmount(currentFeeEstimate)}`
        : null,
      ...nodeChanges.flatMap((change) =>
        change.highlights
          .slice(0, 2)
          .map((detail) => `${change.node}: ${detail}`)
      )
    ]),
    previous: compactHistoryRecord(previous),
    current: compactHistoryRecord(current)
  };
}

function buildHistoryRecommendations({
  previous,
  current,
  comparison,
  related
}) {
  const recommendations = [];
  const currentProbeStatus =
    current.probe?.status || current.routePreview?.status || null;
  const previousProbeStatus =
    previous?.probe?.status || previous?.routePreview?.status || null;

  if (
    comparison?.probeStatusChanged &&
    previousProbeStatus === "ready" &&
    currentProbeStatus === "blocked"
  ) {
    recommendations.push(
      "Compare the latest blocked probe against the previous ready run to identify what changed in sender liquidity, graph visibility, or fee constraints."
    );
  }

  const outboundDrop = comparison?.nodeChanges?.find((change) => {
    const delta = toBigIntOrNull(change.outboundDeltaValue);
    return delta !== null && delta < 0n;
  });
  if (outboundDrop && currentProbeStatus === "blocked") {
    recommendations.push(
      `${outboundDrop.node} outbound liquidity fell from ${outboundDrop.outboundBefore || "Unknown"} to ${outboundDrop.outboundAfter || "Unknown"}; rebalance or refill that sender before retrying this payment amount.`
    );
  }

  const readyChannelDrop = comparison?.nodeChanges?.find(
    (change) =>
      change.readyChannelsBefore !== null &&
      change.readyChannelsAfter !== null &&
      change.readyChannelsAfter < change.readyChannelsBefore
  );
  if (readyChannelDrop) {
    recommendations.push(
      `${readyChannelDrop.node} lost ready channel capacity between related runs; inspect recent channel state transitions before retrying.`
    );
  }

  if (
    comparison?.targetVisibilityChanged &&
    current.summary?.targetVisibility === "not_visible"
  ) {
    recommendations.push(
      "Target visibility regressed in the latest snapshot; refresh graph state, confirm the remote node is online, and verify you are not depending on a stale or private route view."
    );
  }

  if (
    comparison?.routeProofChanged &&
    previous?.summary?.routeProof === "confirmed" &&
    current.summary?.routeProof === "blocked"
  ) {
    recommendations.push(
      "Route proof regressed from confirmed to blocked; compare the sender that last succeeded against the current blocked sender before attempting remediation."
    );
  }

  if (
    comparison?.feeEstimateChanged &&
    toBigIntOrNull(current.summary?.probeFeeEstimate) !== null &&
    toBigIntOrNull(previous?.summary?.probeFeeEstimate) !== null &&
    toBigIntOrNull(current.summary?.probeFeeEstimate) >
      toBigIntOrNull(previous?.summary?.probeFeeEstimate)
  ) {
    recommendations.push(
      "Probe fee estimates increased between related runs; review fee budgets or consider an alternative sender with lower current route cost."
    );
  }

  if (
    comparison?.categoryChanged &&
    previous?.diagnosis?.category === "success"
  ) {
    recommendations.push(
      "Use the last successful run as a baseline and compare payment amount, target visibility, and route probe details against the current failure."
    );
  }

  const repeatedBlockingError = current.probe?.blockingError
    ? related.filter(
        (record) => record.probe?.blockingError === current.probe.blockingError
      ).length
    : 0;

  if (repeatedBlockingError >= 2) {
    recommendations.push(
      "This same route-probe failure has appeared repeatedly in recent history, so treat it as a persistent routing issue rather than a one-off transient event."
    );
  }

  if (
    current.summary?.multiNode?.enabled &&
    current.summary.multiNode.consistentProbeStatus === false
  ) {
    recommendations.push(
      "Different sender nodes disagree on route readiness, so compare per-node outbound liquidity and graph visibility before choosing a send path."
    );
  }

  if (recommendations.length === 0 && previous) {
    recommendations.push(
      "Compare this run with the most recent related snapshot to confirm whether the issue is new or part of an ongoing pattern."
    );
  }

  return recommendations;
}

function buildHistoryEvidence({ previous, comparison, related, recent }) {
  const evidence = [];

  evidence.push({
    label: "Related history",
    value: `${related.length} related snapshot(s)`
  });

  if (recent.length > 0) {
    evidence.push({
      label: "Recent history",
      value: `${recent.length} recent snapshot(s) loaded`
    });
  }

  if (previous) {
    evidence.push({
      label: "Previous related category",
      value: previous.diagnosis?.category || "Unknown"
    });
  }

  if (comparison?.transitions?.length) {
    evidence.push({
      label: "Observed transition",
      value: comparison.transitions.join("; ")
    });
  }

  for (const change of comparison?.nodeChanges || []) {
    evidence.push({
      label: `Node delta: ${change.node}`,
      value: change.highlights.join("; ")
    });
  }

  return evidence;
}

function compactHistoryRecord(record) {
  return {
    id: record.event?.id || null,
    timestamp: record.event?.timestamp || null,
    category: record.diagnosis?.category || null,
    severity: record.diagnosis?.severity || null,
    paymentReadiness: record.summary?.paymentReadiness || null,
    routeProof: record.summary?.routeProof || null,
    targetVisibility: record.summary?.targetVisibility || null,
    probeStatus: record.probe?.status || record.routePreview?.status || null,
    blockingError:
      record.probe?.blockingError || record.routePreview?.blockingReason || null
  };
}

function compareNodeSnapshots(previousNodes, currentNodes) {
  const previousByNode = new Map(
    previousNodes.map((node) => [nodeKey(node), node])
  );
  const currentByNode = new Map(
    currentNodes.map((node) => [nodeKey(node), node])
  );
  const keys = new Set([...previousByNode.keys(), ...currentByNode.keys()]);

  return [...keys]
    .map((key) => {
      const previousNode = previousByNode.get(key) || null;
      const currentNode = currentByNode.get(key) || null;
      const previousOutbound = toBigIntOrNull(
        previousNode?.summary?.estimatedOutboundValue
      );
      const currentOutbound = toBigIntOrNull(
        currentNode?.summary?.estimatedOutboundValue
      );
      const outboundDelta =
        previousOutbound !== null && currentOutbound !== null
          ? currentOutbound - previousOutbound
          : null;
      const previousReadyChannels = toNumberOrNull(
        previousNode?.summary?.readyChannels
      );
      const currentReadyChannels = toNumberOrNull(
        currentNode?.summary?.readyChannels
      );
      const previousProbeStatus = previousNode?.probe?.status || null;
      const currentProbeStatus = currentNode?.probe?.status || null;
      const previousRouteProof = previousNode?.summary?.routeProof || null;
      const currentRouteProof = currentNode?.summary?.routeProof || null;
      const previousTargetVisibility =
        previousNode?.summary?.targetVisibility || null;
      const currentTargetVisibility =
        currentNode?.summary?.targetVisibility || null;
      const highlights = compact([
        previousOutbound !== null &&
        currentOutbound !== null &&
        previousOutbound !== currentOutbound
          ? `outbound ${formatAmount(previousOutbound)} -> ${formatAmount(currentOutbound)}`
          : null,
        previousReadyChannels !== null &&
        currentReadyChannels !== null &&
        previousReadyChannels !== currentReadyChannels
          ? `ready channels ${previousReadyChannels} -> ${currentReadyChannels}`
          : null,
        previousProbeStatus !== currentProbeStatus
          ? `probe ${previousProbeStatus || "unknown"} -> ${currentProbeStatus || "unknown"}`
          : null,
        previousRouteProof !== currentRouteProof
          ? `route proof ${previousRouteProof || "unknown"} -> ${currentRouteProof || "unknown"}`
          : null,
        previousTargetVisibility !== currentTargetVisibility
          ? `target visibility ${humanizeState(previousTargetVisibility)} -> ${humanizeState(currentTargetVisibility)}`
          : null
      ]);

      return {
        node:
          currentNode?.name ||
          previousNode?.name ||
          currentNode?.endpoint ||
          previousNode?.endpoint ||
          "Unknown node",
        endpoint: currentNode?.endpoint || previousNode?.endpoint || null,
        outboundBefore:
          previousOutbound !== null ? formatAmount(previousOutbound) : null,
        outboundAfter:
          currentOutbound !== null ? formatAmount(currentOutbound) : null,
        outboundDelta:
          outboundDelta !== null ? formatSignedAmount(outboundDelta) : null,
        outboundDeltaValue:
          outboundDelta !== null ? outboundDelta.toString() : null,
        readyChannelsBefore: previousReadyChannels,
        readyChannelsAfter: currentReadyChannels,
        probeStatusBefore: previousProbeStatus,
        probeStatusAfter: currentProbeStatus,
        routeProofBefore: previousRouteProof,
        routeProofAfter: currentRouteProof,
        targetVisibilityBefore: previousTargetVisibility,
        targetVisibilityAfter: currentTargetVisibility,
        highlights
      };
    })
    .filter((change) => change.highlights.length > 0);
}

function nodeKey(node) {
  return [node?.name || "", node?.endpoint || ""].join("|");
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function humanizeState(value) {
  return value ? String(value).replace(/[_-]+/g, " ") : "unknown";
}

function formatSignedAmount(value) {
  const normalized = toBigIntOrNull(value);
  if (normalized === null) {
    return value === null || value === undefined ? null : String(value);
  }
  if (normalized === 0n) {
    return "0";
  }
  const prefix = normalized > 0n ? "+" : "-";
  const absoluteValue = normalized > 0n ? normalized : -normalized;
  return `${prefix}${formatAmount(absoluteValue)}`;
}
