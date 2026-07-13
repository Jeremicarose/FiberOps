import { buildComparisonKey } from "../history-store.js";

import {
  buildMultiNodeSummary,
  extractChannels,
  extractFailedError,
  extractGraphNodes,
  extractLocalBalance,
  extractNumber,
  extractPaymentStatus,
  findGraphNodeByPubkey,
  formatAmount,
  isOpenChannel,
  normalizeLabel,
  normalizeRouteBuild,
  normalizeMultiNodeSummary,
  normalizeRouteProbe,
  pickFirst,
  resolveTargetPubkey,
  sumBigInts
} from "./shared.js";
import { analyzeInvoice } from "./classifiers.js";

export function summarizeContext(context, request, nodes = []) {
  const channels = extractChannels(context.channels);
  const openChannels = channels.filter(isOpenChannel);
  const outbound = sumBigInts(
    openChannels.map(extractLocalBalance).filter(Boolean)
  );
  const parsedInvoice = analyzeInvoice(context.parsedInvoice, request);
  const targetPubkey = resolveTargetPubkey(request, context.parsedInvoice);
  const graphNodes = extractGraphNodes(context.graphNodes);
  const graphMatch = targetPubkey
    ? findGraphNodeByPubkey(graphNodes, targetPubkey)
    : null;
  const paymentStatus = normalizeLabel(extractPaymentStatus(context.payment));
  const partialErrors = context.partialErrors || {};
  const partialErrorKeys = Object.keys(partialErrors);
  const readyChannels = channels.filter((channel) => {
    const state = String(
      pickFirst(channel, [
        "state.state_name",
        "state.stateName",
        "state",
        "status"
      ]) || ""
    ).toLowerCase();
    return state.includes("ready");
  });
  const routeProbe = normalizeRouteProbe(
    context.routeProbe,
    request,
    context.parsedInvoice
  );
  const routeBuild = normalizeRouteBuild(
    context.routeBuild,
    request,
    context.parsedInvoice
  );
  const targetVisibility = deriveTargetVisibility({
    targetPubkey,
    graphNodes,
    graphMatch,
    routeProbe
  });
  const multiNode =
    nodes.length > 0
      ? buildMultiNodeSummary(nodes)
      : normalizeMultiNodeSummary(context.multiNode);

  return {
    endpoint: request.endpoint || context.endpoint || null,
    nodeVersion:
      pickFirst(context.nodeInfo, ["version", "node_version"]) || null,
    paymentStatus,
    failedError: extractFailedError(context.payment),
    openChannels: openChannels.length,
    readyChannels: readyChannels.length,
    totalChannels: channels.length,
    estimatedOutbound: outbound !== null ? formatAmount(outbound) : null,
    estimatedOutboundValue: outbound !== null ? outbound.toString() : null,
    invoiceCurrency: parsedInvoice.currency,
    invoiceExpired: parsedInvoice.hasInvoice ? parsedInvoice.expired : null,
    routeProof: deriveRouteProof(routeProbe),
    routeBuildStatus: routeBuild.status,
    routeBuildCandidates: routeBuild.candidates.length,
    targetInGraph:
      targetVisibility === "visible"
        ? true
        : targetVisibility === "not_visible"
          ? false
          : null,
    targetVisibility,
    targetPubkey,
    peerCount: extractNumber(context.nodeInfo, [
      "peers_count",
      "peer_count",
      "num_peers",
      "peersCount"
    ]),
    partialErrors,
    partialErrorCount: partialErrorKeys.length,
    probeStatus: routeProbe.status,
    probeFeeEstimate:
      routeProbe.feeEstimate?.amount !== null &&
      routeProbe.feeEstimate?.amount !== undefined
        ? String(routeProbe.feeEstimate.amount)
        : null,
    paymentReadiness: derivePaymentReadiness({
      channels,
      openChannels,
      readyChannels,
      outbound,
      parsedInvoice,
      targetPubkey,
      graphNodes,
      graphMatch,
      paymentStatus,
      partialErrorKeys,
      routeProbe,
      routeBuild
    }),
    multiNode,
    comparisonKey: buildComparisonKey({
      request,
      summary: {
        targetPubkey
      },
      probe: routeProbe,
      nodes:
        nodes.length > 0
          ? nodes.map((node) => ({ name: node.name, endpoint: node.endpoint }))
          : undefined
    })
  };
}

function deriveRouteProof(routeProbe) {
  if (!routeProbe.supported) {
    return "not_supported";
  }
  if (routeProbe.status === "ready") {
    return "confirmed";
  }
  if (routeProbe.status === "blocked") {
    return "blocked";
  }
  if (routeProbe.status === "skipped") {
    return "skipped";
  }
  return "inconclusive";
}

function deriveTargetVisibility({
  targetPubkey,
  graphNodes,
  graphMatch,
  routeProbe
}) {
  if (!targetPubkey) {
    return "not_checked";
  }
  if (graphMatch) {
    return "visible";
  }
  if (routeProbe.supported && routeProbe.status === "ready") {
    return "route_proven";
  }
  if (graphNodes.length === 0) {
    return "not_checked";
  }
  return "not_visible";
}

function derivePaymentReadiness({
  channels,
  openChannels,
  readyChannels,
  outbound,
  parsedInvoice,
  targetPubkey,
  graphNodes,
  graphMatch,
  paymentStatus,
  partialErrorKeys,
  routeProbe,
  routeBuild
}) {
  if (partialErrorKeys.length > 0) {
    return "degraded";
  }
  if (routeProbe.supported && routeProbe.status === "blocked") {
    return "blocked";
  }
  if (routeProbe.supported && routeProbe.status === "ready") {
    return "ready";
  }
  if (routeBuild.supported && routeBuild.status === "blocked") {
    return "blocked";
  }
  if (routeBuild.supported && routeBuild.status === "ready") {
    return "ready";
  }
  if (paymentStatus === "Success") {
    return "healthy";
  }
  if (channels.length === 0) {
    return "not_ready";
  }
  if (openChannels.length === 0 || readyChannels.length === 0) {
    return "not_ready";
  }
  if (parsedInvoice.hasInvoice && parsedInvoice.expired) {
    return "blocked";
  }
  if (targetPubkey && graphNodes.length > 0 && !graphMatch) {
    return "blocked";
  }
  if (outbound === null || outbound <= 0n) {
    return "not_ready";
  }
  return "ready";
}
