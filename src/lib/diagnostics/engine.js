export { buildDiagnosis, analyzeInvoice } from "./classifiers.js";
export { buildEventEnvelope } from "./events.js";
export {
  buildHistoryInsights,
  augmentDiagnosisWithHistory
} from "./history.js";
export { buildAlerts } from "./recommendations.js";
export { summarizeContext } from "./summaries.js";

import { classifyFailure } from "./rules.js";
import {
  PROBE_METHOD_LABEL,
  ROUTE_BUILD_METHOD_LABEL,
  extractChannels,
  extractFailedError,
  extractGraphNodes,
  extractLocalBalance,
  findGraphNodeByPubkey,
  formatAmount,
  isOpenChannel,
  normalizeLabel,
  normalizeRouteBuild,
  normalizeRouteProbe,
  pickFirst,
  resolveRequestedAmount,
  resolveTargetPubkey,
  sumBigInts
} from "./shared.js";
import { analyzeInvoice } from "./classifiers.js";

export function buildRoutePreview({ request, context, diagnosis, summary }) {
  const requestedAmount = resolveRequestedAmount(
    request,
    context.parsedInvoice
  );
  const targetPubkey = resolveTargetPubkey(request, context.parsedInvoice);
  const channels = extractChannels(context.channels);
  const openChannels = channels.filter(isOpenChannel);
  const estimatedOutbound = sumBigInts(
    openChannels.map(extractLocalBalance).filter(Boolean)
  );
  const graphNodes = extractGraphNodes(context.graphNodes);
  const graphMatch = targetPubkey
    ? findGraphNodeByPubkey(graphNodes, targetPubkey)
    : null;
  const parsedInvoice = analyzeInvoice(context.parsedInvoice, request);
  const failureClassification = classifyFailure(
    extractFailedError(context.payment) || diagnosis.category
  );
  const openHopCandidates = openChannels.slice(0, 3).map((channel, index) => ({
    hop: index + 1,
    channelId:
      pickFirst(channel, ["channel_id", "channelId", "id"]) ||
      `channel-${index + 1}`,
    state: normalizeLabel(
      pickFirst(channel, [
        "state.state_name",
        "state.stateName",
        "state",
        "status"
      ]) || "unknown"
    ),
    localBalance: formatAmount(extractLocalBalance(channel))
  }));
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
  const limitations = [];
  const chosenBuiltRoute = routeBuild.candidates.find(
    (candidate) => candidate.id === routeBuild.chosenCandidateId
  );
  const builtRoutes = routeBuild.candidates.map((candidate, index) => ({
    id: candidate.id,
    rank: index + 1,
    status: candidate.status,
    hopCount: candidate.hopCount,
    pathPubkeys: candidate.pathPubkeys,
    totalAmount: candidate.totalAmount,
    totalFee: candidate.totalFee,
    totalExpiry: candidate.totalExpiry,
    blockingError: candidate.blockingError,
    routerHops: candidate.routerHops
  }));

  let status = "unknown";
  let blockingReason = null;
  let mode = "heuristic";
  let confidence = "medium";
  let evidenceSource = "channel snapshot";
  let feeHint = deriveFeeHint({
    diagnosis,
    requestedAmount,
    estimatedOutbound,
    failureClassification,
    routeProbe
  });

  if (routeProbe.supported && routeProbe.status !== "skipped") {
    mode =
      routeProbe.routeFound || routeProbe.blockingError ? "dry_run" : "partial";
    evidenceSource = routeProbe.source || PROBE_METHOD_LABEL;
    confidence = routeProbe.routeFound
      ? "high"
      : routeProbe.blockingError
        ? "high"
        : "low";

    if (routeProbe.status === "blocked") {
      status = "blocked";
      blockingReason = routeProbe.blockingError;
      feeHint = routeProbe.blockingError
        ? "Real Fiber dry-run probe rejected this route without sending a real payment."
        : feeHint;
    } else if (routeProbe.status === "ready") {
      status = "ready";
      feeHint =
        routeProbe.feeEstimate?.hint ||
        "Real Fiber dry-run probe accepted the route without sending a real payment.";
    } else {
      mode = "partial";
      confidence = "low";
      limitations.push(
        "Fiber dry-run support exists, but the probe did not return a decisive ready/blocked outcome."
      );
    }
  }

  if (context.partialErrors?.channels && !routeProbe.supported) {
    status = "degraded";
    blockingReason = "Channel data could not be read from Fiber RPC.";
    confidence = "low";
    evidenceSource = "partial rpc snapshot";
    limitations.push(
      "Channel reads were incomplete, so this preview is based on degraded evidence."
    );
  } else if (
    parsedInvoice.hasInvoice &&
    parsedInvoice.expired &&
    !routeProbe.supported
  ) {
    status = "blocked";
    blockingReason = "Invoice has expired.";
    limitations.push(
      "No real dry-run probe succeeded; the block is inferred from invoice metadata."
    );
  } else if (
    channels.length > 0 &&
    openChannels.length === 0 &&
    !routeProbe.supported
  ) {
    status = "blocked";
    blockingReason = "No open or ready channels are available.";
    limitations.push(
      "No real dry-run probe succeeded; the block is inferred from channel state."
    );
  } else if (
    targetPubkey &&
    graphNodes.length > 0 &&
    !graphMatch &&
    !routeProbe.supported
  ) {
    status = "blocked";
    blockingReason =
      "Target pubkey is not visible in the current graph snapshot.";
    limitations.push(
      "No real dry-run probe succeeded; the block is inferred from graph visibility only."
    );
  } else if (
    requestedAmount !== null &&
    estimatedOutbound !== null &&
    estimatedOutbound < requestedAmount &&
    !routeProbe.supported
  ) {
    status = "blocked";
    blockingReason =
      "Estimated outbound liquidity is below the requested amount.";
    limitations.push(
      "No real dry-run probe succeeded; the block is inferred from local outbound estimates."
    );
  } else if (
    diagnosis.category === "route_unavailable" &&
    !routeProbe.supported
  ) {
    status = "blocked";
    blockingReason =
      "Fiber could not build a usable route with current graph visibility.";
    limitations.push(
      "This preview is heuristic because no successful dry-run route proof is available."
    );
  } else if (diagnosis.category === "success" && !routeProbe.supported) {
    status = "ready";
    limitations.push(
      "Route readiness is inferred from recent successful payment evidence, not a new dry-run probe."
    );
  } else if (openChannels.length > 0 && !routeProbe.supported) {
    status = requestedAmount === null ? "possible" : "ready";
    limitations.push(
      "This preview is heuristic and may miss fee, graph, or remote liquidity constraints."
    );
  }

  if (
    routeBuild.supported &&
    routeBuild.status === "ready" &&
    chosenBuiltRoute &&
    (!routeProbe.supported || routeProbe.status === "skipped")
  ) {
    mode = "route_build";
    status = "ready";
    confidence = "medium";
    evidenceSource = routeBuild.source || ROUTE_BUILD_METHOD_LABEL;
    feeHint =
      chosenBuiltRoute.totalFee !== null
        ? `Fiber build_router found a ${chosenBuiltRoute.hopCount}-hop route with an estimated fee near ${chosenBuiltRoute.totalFee}.`
        : "Fiber build_router constructed a constrained route candidate for this payment.";
  } else if (
    routeBuild.supported &&
    routeBuild.status === "blocked" &&
    (!routeProbe.supported || routeProbe.status === "skipped")
  ) {
    mode = "route_build";
    status = "blocked";
    confidence = "medium";
    evidenceSource = routeBuild.source || ROUTE_BUILD_METHOD_LABEL;
    blockingReason =
      blockingReason ||
      routeBuild.blockingError ||
      "Fiber build_router could not construct any constrained route candidate.";
  }

  if (summary?.multiNode?.enabled) {
    if (summary.multiNode.probeReadyNodes > 0 && status !== "blocked") {
      status = status === "unknown" ? "ready" : status;
    }
    if (
      summary.multiNode.probeReadyNodes === 0 &&
      summary.multiNode.probeBlockedNodes > 0 &&
      routeProbe.supported
    ) {
      status = "blocked";
      blockingReason =
        blockingReason ||
        routeProbe.blockingError ||
        "All observed sender probes failed for this request.";
    }
    if (summary.multiNode.consistentProbeStatus === false) {
      limitations.push(
        "Observed sender nodes disagreed on route readiness, so this preview reflects partial cross-node evidence."
      );
    }
  }

  if (
    routeProbe.routeFound &&
    targetPubkey &&
    graphNodes.length > 0 &&
    !graphMatch
  ) {
    limitations.push(
      "The current graph snapshot did not show the target pubkey, but a real Fiber dry run still built a route. Treat graph visibility as stale, partial, or private-path evidence."
    );
  }

  if (
    routeBuild.supported &&
    routeBuild.status === "ready" &&
    routeProbe.supported &&
    routeProbe.status === "blocked"
  ) {
    limitations.push(
      "build_router produced at least one constrained route candidate, but send_payment(dry_run) still blocked the payment. Treat the dry-run failure as the stronger execution signal."
    );
  }

  if (mode === "heuristic") {
    evidenceSource = "heuristic inference";
  }

  return {
    mode,
    status,
    confidence,
    evidenceSource,
    blockingReason,
    estimatedOutbound:
      estimatedOutbound !== null ? formatAmount(estimatedOutbound) : null,
    feeHint,
    hopHints:
      chosenBuiltRoute?.routerHops?.length > 0
        ? chosenBuiltRoute.routerHops.map((hop) => ({
            hop: hop.hop,
            channelId: hop.channelId,
            nodeId: hop.targetPubkey,
            fee: hop.amountReceived || hop.fee || null,
            state: "Built route"
          }))
        : routeProbe.hops.length > 0
          ? routeProbe.hops
          : openHopCandidates,
    requestedAmount:
      requestedAmount !== null ? formatAmount(requestedAmount) : null,
    probeMethod: routeProbe.supported
      ? routeProbe.source || PROBE_METHOD_LABEL
      : null,
    probePaymentHash: routeProbe.paymentHash,
    routeBuildMethod: routeBuild.supported
      ? routeBuild.source || ROUTE_BUILD_METHOD_LABEL
      : null,
    chosenRoute: chosenBuiltRoute
      ? {
          id: chosenBuiltRoute.id,
          hopCount: chosenBuiltRoute.hopCount,
          pathPubkeys: chosenBuiltRoute.pathPubkeys,
          totalAmount: chosenBuiltRoute.totalAmount,
          totalFee: chosenBuiltRoute.totalFee,
          totalExpiry: chosenBuiltRoute.totalExpiry
        }
      : null,
    routeAlternatives: builtRoutes,
    routeDecisionReason: routeBuild.reasoning,
    limitations,
    probe: routeProbe,
    routeBuild
  };
}

function deriveFeeHint({
  diagnosis,
  requestedAmount,
  estimatedOutbound,
  failureClassification,
  routeProbe
}) {
  if (routeProbe?.feeEstimate?.amount) {
    return `Fiber dry run reported an estimated fee near ${formatAmount(routeProbe.feeEstimate.amount)}.`;
  }
  if (
    diagnosis.category === "fee_budget_too_low" ||
    failureClassification.category === "fee_budget_too_low"
  ) {
    return "Fee budget looks tight for the current route constraints.";
  }
  if (
    requestedAmount !== null &&
    estimatedOutbound !== null &&
    estimatedOutbound >= requestedAmount
  ) {
    return "Liquidity appears sufficient, so fees or graph conditions may be the next constraint.";
  }
  if (diagnosis.category === "success") {
    return "Recent route conditions were healthy enough to settle this payment.";
  }
  return "Heuristic preview only; no live fee quote was requested from Fiber RPC.";
}
