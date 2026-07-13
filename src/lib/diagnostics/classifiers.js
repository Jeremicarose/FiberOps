import { isUnauthorizedError } from "../fiber-rpc.js";

import { classifyFailure } from "./rules.js";
import {
  DOCS,
  PROBE_METHOD_LABEL,
  addReference,
  extractChannels,
  extractFailedError,
  extractGraphNodes,
  extractInvoiceDescription,
  extractLocalBalance,
  extractNumber,
  extractPaymentStatus,
  findGraphNodeByPubkey,
  formatAmount,
  isOpenChannel,
  looksLikePeerId,
  normalizeMultiNodeSummary,
  normalizeParsedInvoice,
  normalizeRouteBuild,
  normalizeRouteProbe,
  pickFirst,
  pushUnique,
  resolveRequestedAmount,
  resolveTargetPubkey,
  sumBigInts
} from "./shared.js";

export function buildDiagnosis({
  source = "demo",
  request = {},
  context = {},
  scenario = null
}) {
  const checks = [];
  const evidence = [];
  const nextActions = [];
  const references = new Map();
  const channels = extractChannels(context.channels);
  const openChannels = channels.filter(isOpenChannel);
  const totalOutbound = sumBigInts(
    openChannels.map(extractLocalBalance).filter(Boolean)
  );
  const requestedAmount = resolveRequestedAmount(
    request,
    context.parsedInvoice
  );
  const paymentStatus = normalizePaymentStatus(
    extractPaymentStatus(context.payment)
  );
  const failedError = extractFailedError(context.payment);
  const targetPubkey = resolveTargetPubkey(request, context.parsedInvoice);
  const graphNodes = extractGraphNodes(context.graphNodes);
  const graphMatch = targetPubkey
    ? findGraphNodeByPubkey(graphNodes, targetPubkey)
    : null;
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
  const multiNode = normalizeMultiNodeSummary(context.multiNode);

  addReference(references, "rpcOverview");
  addReference(references, "troubleshooting");

  if (context.error) {
    return buildRpcFailureDiagnosis({ context, request, source, scenario });
  }

  if (context.nodeInfo) {
    checks.push({
      status: "pass",
      title: "RPC reachable",
      detail: `Connected to Fiber node ${pickFirst(context.nodeInfo, ["version", "node_version"]) || "with unknown version"}.`
    });
    evidence.push({
      label: "Node version",
      value:
        pickFirst(context.nodeInfo, ["version", "node_version"]) || "Unknown"
    });
  }

  addMultiNodeFindings(checks, evidence, multiNode);
  addChannelFindings(checks, evidence, context, channels, openChannels);

  if (requestedAmount !== null) {
    evidence.push({
      label: "Requested amount",
      value: formatAmount(requestedAmount)
    });
  }

  if (totalOutbound !== null) {
    evidence.push({
      label: "Estimated outbound",
      value: formatAmount(totalOutbound)
    });
    checks.push({
      status:
        requestedAmount !== null && totalOutbound < requestedAmount
          ? "fail"
          : "pass",
      title: "Local outbound capacity",
      detail:
        requestedAmount !== null
          ? `Estimated outbound capacity is ${formatAmount(totalOutbound)} against a requested amount of ${formatAmount(requestedAmount)}.`
          : `Estimated outbound capacity is ${formatAmount(totalOutbound)}.`
    });
  }

  const invoiceFindings = analyzeInvoice(context.parsedInvoice, request);

  if (invoiceFindings.currency) {
    evidence.push({
      label: "Invoice currency",
      value: invoiceFindings.currency
    });
  }
  if (invoiceFindings.description) {
    evidence.push({
      label: "Invoice description",
      value: invoiceFindings.description
    });
  }
  if (invoiceFindings.expiryTimestamp) {
    evidence.push({
      label: "Invoice expiry",
      value: new Date(invoiceFindings.expiryTimestamp * 1000).toISOString()
    });
  }
  if (invoiceFindings.hasInvoice) {
    checks.push({
      status: invoiceFindings.expired ? "fail" : "pass",
      title: "Invoice validity",
      detail: invoiceFindings.expired
        ? "The invoice timestamp plus expiry has already passed."
        : "The invoice parsed successfully and is not expired."
    });
  }

  if (context.partialErrors?.parsedInvoice) {
    checks.push({
      status: "fail",
      title: "Invoice parse",
      detail: `Fiber could not parse the invoice: ${context.partialErrors.parsedInvoice.message}`
    });
    evidence.push({
      label: "Invoice parse error",
      value: context.partialErrors.parsedInvoice.message
    });
  }

  if (paymentStatus) {
    evidence.push({ label: "Payment status", value: paymentStatus });
    checks.push({
      status:
        paymentStatus === "Success"
          ? "pass"
          : paymentStatus === "Failed"
            ? "fail"
            : "warn",
      title: "Payment state",
      detail: `Fiber reports the payment as ${paymentStatus}.`
    });
  }

  if (failedError) {
    evidence.push({ label: "failed_error", value: failedError });
  }

  if (context.partialErrors?.payment) {
    checks.push({
      status: "warn",
      title: "Payment lookup",
      detail: `Payment details could not be read: ${context.partialErrors.payment.message}`
    });
  }

  addRouteProbeFindings(checks, evidence, routeProbe);
  addRouteBuildFindings(checks, evidence, routeBuild);
  addGraphFindings(checks, evidence, context, targetPubkey, graphMatch, routeProbe, routeBuild);
  addPeerIdFinding(checks, evidence, request.targetPubkey);

  let classification = {
    headline:
      "Collect a payment hash or invoice to diagnose a specific failure",
    category: "needs_more_context",
    severity: "medium",
    confidence: 0.55,
    explanation:
      "The node is reachable, but there is not enough payment-specific context yet to explain a failure. Provide an invoice, payment hash, or requested amount to tighten the diagnosis.",
    actions: [
      "Paste a Fiber invoice to validate expiry, amount, and metadata before retrying.",
      "Paste a payment hash to inspect final status and failed_error from the node.",
      "Keep this tool read-only for the demo: analyze existing state instead of sending a payment from the app."
    ],
    refs: ["sdk", "rpcOverview"]
  };

  if (
    !paymentStatus &&
    !failedError &&
    routeProbe.supported &&
    routeProbe.blockingError
  ) {
    classification = classifyFailure(routeProbe.blockingError);
  } else if (
    !paymentStatus &&
    !failedError &&
    routeProbe.supported &&
    routeProbe.routeFound
  ) {
    classification = {
      headline:
        multiNode.enabled && multiNode.probeReadyNodes > 1
          ? "At least one sender can build a route for this payment right now"
          : "Fiber can build a route for this payment right now",
      category: "route_probe_ready",
      severity: "low",
      confidence: 0.93,
      explanation:
        "A real Fiber send_payment dry run accepted the target and amount without sending a payment or changing receiver state. That means the current graph and liquidity are sufficient for at least one observed route.",
      actions: [
        "Proceed to a real payment send when you are ready to execute.",
        "Record this probe result as a known-good baseline for future comparisons.",
        "If later sends fail, compare them against this dry-run-ready snapshot to isolate what changed."
      ],
      refs: ["rpcOverview", "paymentLifecycle"]
    };
  } else if (
    !paymentStatus &&
    !failedError &&
    routeBuild.supported &&
    routeBuild.status === "ready"
  ) {
    classification = {
      headline:
        "Fiber can construct at least one viable route for this payment",
      category: "route_build_ready",
      severity: "low",
      confidence: 0.82,
      explanation:
        "Fiber build_router successfully constructed at least one constrained route candidate for the target and amount. This is strong routing evidence, although it is weaker than a successful send_payment dry run.",
      actions: [
        "Inspect the chosen route and alternatives to compare hop count and estimated fees.",
        "Use send_payment(dry_run) or send_payment_with_router(dry_run) to confirm whether the candidate route still executes cleanly.",
        "Record the cheapest working route as a baseline before comparing future route failures."
      ],
      refs: ["rpcOverview", "multiHop"]
    };
  } else if (context.partialErrors?.parsedInvoice && !paymentStatus) {
    classification = {
      headline: "The invoice string is invalid or unsupported",
      category: "invalid_invoice",
      severity: "high",
      confidence: 0.92,
      explanation:
        "Fiber could not parse the invoice, so the payment cannot be validated or routed from this input.",
      actions: [
        "Verify the invoice was copied completely and has not been truncated.",
        "Generate a fresh invoice from the recipient node if you suspect corruption.",
        "Use parse_invoice before attempting to pay so invalid invoices fail early."
      ],
      refs: ["troubleshooting", "sdk"]
    };
  } else if (invoiceFindings.expired) {
    classification = {
      headline: "The invoice has already expired",
      category: "invoice_expired",
      severity: "high",
      confidence: 0.98,
      explanation:
        "The invoice timestamp plus expiry is in the past, so the recipient should reject the payment even if a route exists.",
      actions: [
        "Request a new invoice from the recipient with a longer expiry.",
        "Validate invoice expiry with parse_invoice before sending.",
        "If this is a recurring issue, add expiry warnings to the caller flow before routing."
      ],
      refs: ["troubleshooting", "sdk"]
    };
  } else if (
    requestedAmount !== null &&
    totalOutbound !== null &&
    totalOutbound < requestedAmount
  ) {
    classification = {
      headline: "Outbound liquidity is too low for this payment",
      category: "insufficient_liquidity",
      severity: "high",
      confidence: 0.88,
      explanation:
        "The node appears to have less local outbound balance than the requested amount, so the payment is unlikely to succeed without a different channel mix or a smaller amount.",
      actions: [
        "Check list_channels and confirm which open channels actually hold local outbound balance.",
        "Retry with a smaller amount or split the payment into smaller parts.",
        "Open, rebalance, or refill channels before attempting the full payment again."
      ],
      refs: ["troubleshooting", "paymentLifecycle"]
    };
  } else if (channels.length === 0) {
    classification = {
      headline: "This node is not payment-ready yet",
      category: "no_open_channels",
      severity: "high",
      confidence: 0.9,
      explanation:
        "The Fiber node is reachable and on the network, but it has no channels yet. Until the wallet is funded and at least one channel is opened, payment diagnostics will be limited to connectivity and invoice checks.",
      actions: [
        "Fund the node's CKB address from the testnet faucet.",
        "Connect to a public testnet node and open at least one channel.",
        "After the first channel is live, rerun FiberOps with an invoice or payment hash to diagnose real routing behavior."
      ],
      refs: ["networkResources", "connectNodes", "troubleshooting"]
    };
  } else if (
    targetPubkey &&
    graphNodes.length > 0 &&
    !graphMatch &&
    !routeProbe.routeFound &&
    routeBuild.status !== "ready"
  ) {
    classification = {
      headline: "The target node is not visible in the Fiber graph",
      category: "target_not_in_graph",
      severity: "high",
      confidence: 0.91,
      explanation:
        "Fiber cannot route reliably to a node that is missing from the current network graph, even if the invoice or pubkey string is otherwise valid.",
      actions: [
        "Verify the target pubkey is correct and not a legacy peer_id.",
        "Confirm the target node is online and sufficiently connected to be advertised in the graph.",
        "If this is a private or one-way path, explain that public routing may not be possible through that node."
      ],
      refs: ["troubleshooting", "multiHop"]
    };
  }

  if (paymentStatus === "Failed" || failedError) {
    classification = classifyFailure(failedError || paymentStatus);
  } else if (paymentStatus === "Inflight" || paymentStatus === "Created") {
    classification = {
      headline: "The payment is still in progress",
      category: "payment_inflight",
      severity: "medium",
      confidence: 0.8,
      explanation:
        "Fiber reports the payment as Created or Inflight. Routing and settlement are asynchronous, so the payment may still succeed or fail on a later poll.",
      actions: [
        "Poll get_payment until the status becomes Success or Failed.",
        "If the payment stays inflight for too long, inspect intermediate node availability and retry strategy.",
        "Capture the final failed_error before classifying the incident."
      ],
      refs: ["sdk", "paymentLifecycle"]
    };
  } else if (paymentStatus === "Success") {
    classification = {
      headline: "The payment succeeded",
      category: "success",
      severity: "low",
      confidence: 0.99,
      explanation:
        "Fiber reports the payment as successful, so no failure diagnosis is necessary for this payment hash.",
      actions: [
        "Record the successful route and fee data for future comparisons.",
        "If you are investigating intermittent issues, compare this payment against recent failures with the same target and amount.",
        "Use this as a known-good baseline in your demo or test suite."
      ],
      refs: ["paymentLifecycle", "sdk"]
    };
  } else if (openChannels.length === 0 && channels.length > 0) {
    classification = {
      headline: "No channel appears ready to route payments",
      category: "channel_not_ready",
      severity: "high",
      confidence: 0.84,
      explanation:
        "The node returned channel data, but none of the channels look open or active enough to support a payment attempt.",
      actions: [
        "Confirm the channel state transitions have completed before sending a payment.",
        "Inspect pending or shutdown channels directly on the node to see why they are not active.",
        "For the hackathon MVP, surface channel state clearly before letting users attempt a payment."
      ],
      refs: ["troubleshooting", "paymentLifecycle"]
    };
  }

  for (const action of classification.actions) pushUnique(nextActions, action);
  for (const key of classification.refs) addReference(references, key);

  return finalizeDiagnosis({
    headline: classification.headline,
    category: classification.category,
    severity: classification.severity,
    confidence: classification.confidence,
    explanation: classification.explanation,
    checks,
    evidence,
    nextActions,
    references: Array.from(references.values()),
    source,
    scenario
  });
}

export function analyzeInvoice(parsedInvoice, request) {
  const invoice = normalizeParsedInvoice(parsedInvoice);

  if (!invoice) {
    return {
      hasInvoice: Boolean(request.invoice),
      expired: false,
      currency: null,
      description: null,
      expiryTimestamp: null
    };
  }

  const timestamp = extractNumber(invoice, ["timestamp", "data.timestamp"]);
  const expiry = extractNumber(invoice, ["expiry", "data.expiry"]);
  const expiryTimestamp =
    timestamp !== null && expiry !== null ? timestamp + expiry : null;

  return {
    hasInvoice: true,
    expired:
      expiryTimestamp !== null
        ? Math.floor(Date.now() / 1000) > expiryTimestamp
        : false,
    currency: pickFirst(invoice, ["currency", "data.currency"]),
    description: extractInvoiceDescription(invoice),
    expiryTimestamp
  };
}

function addMultiNodeFindings(checks, evidence, multiNode) {
  if (!multiNode.enabled) {
    return;
  }

  const routeEvidence = [];
  if (multiNode.probeReadyNodes > 0) {
    routeEvidence.push(`${multiNode.probeReadyNodes} ready`);
  }
  if (multiNode.probeBlockedNodes > 0) {
    routeEvidence.push(`${multiNode.probeBlockedNodes} blocked`);
  }
  if (multiNode.probeSkippedNodes > 0) {
    routeEvidence.push(`${multiNode.probeSkippedNodes} skipped`);
  }

  checks.push({
    status: multiNode.reachableNodes > 0 ? "pass" : "fail",
    title: "Multi-node coverage",
    detail: `${multiNode.reachableNodes}/${multiNode.nodeCount} node(s) responded${routeEvidence.length ? `; probes: ${routeEvidence.join(", ")}.` : "."}`
  });

  evidence.push({
    label: "Nodes analyzed",
    value: `${multiNode.nodeCount}`
  });

  if (multiNode.consistentProbeStatus === false) {
    checks.push({
      status: "warn",
      title: "Cross-node consistency",
      detail:
        "Different nodes reported different route readiness for the same request, which usually means local liquidity or graph visibility differs by sender."
    });
  }
}

function addChannelFindings(checks, evidence, context, channels, openChannels) {
  if (context.partialErrors?.channels) {
    checks.push({
      status: "warn",
      title: "Channel read",
      detail: `Could not read channels: ${context.partialErrors.channels.message}`
    });
    return;
  }

  if (channels.length === 0) {
    checks.push({
      status: "fail",
      title: "Open channels",
      detail: "No channel data is available, so outbound liquidity may be zero."
    });
    return;
  }

  checks.push({
    status: openChannels.length > 0 ? "pass" : "warn",
    title: "Open channels",
    detail:
      openChannels.length > 0
        ? `${openChannels.length} open channel(s) detected.`
        : "Channels were returned, but none look open or ready."
  });
  evidence.push({
    label: "Open channels",
    value: String(openChannels.length)
  });
}

function addRouteProbeFindings(checks, evidence, routeProbe) {
  if (!routeProbe.supported) {
    return;
  }

  if (routeProbe.routeFound) {
    checks.push({
      status: "pass",
      title: "Route probe",
      detail:
        "Fiber send_payment dry-run accepted this target and amount without sending a payment."
    });
    evidence.push({
      label: "Route probe",
      value: routeProbe.source || PROBE_METHOD_LABEL
    });
    evidence.push({
      label: "Route proof",
      value: "Confirmed by real Fiber dry run"
    });
    if (routeProbe.paymentHash) {
      evidence.push({
        label: "Probe payment hash",
        value: routeProbe.paymentHash
      });
    }
    if (routeProbe.hops.length > 0) {
      evidence.push({
        label: "Probe hops",
        value: String(routeProbe.hops.length)
      });
    }
    return;
  }

  if (routeProbe.blockingError) {
    checks.push({
      status: "fail",
      title: "Route probe",
      detail: routeProbe.blockingError
    });
    evidence.push({
      label: "Route probe",
      value: routeProbe.source || PROBE_METHOD_LABEL
    });
  }
}

function addRouteBuildFindings(checks, evidence, routeBuild) {
  if (!routeBuild.supported) {
    return;
  }

  const successfulCandidates = routeBuild.candidates.filter(
    (candidate) => candidate.status === "ready"
  );
  if (successfulCandidates.length > 0) {
    checks.push({
      status: "pass",
      title: "Route builder",
      detail: `Fiber build_router constructed ${successfulCandidates.length} constrained route candidate(s) for this target and amount.`
    });
    evidence.push({
      label: "Route builder",
      value: routeBuild.source
    });
    evidence.push({
      label: "Route candidates",
      value: String(successfulCandidates.length)
    });
    return;
  }

  if (routeBuild.blockingError) {
    checks.push({
      status: "warn",
      title: "Route builder",
      detail: routeBuild.blockingError
    });
    evidence.push({
      label: "Route builder",
      value: routeBuild.source
    });
  }
}

function addGraphFindings(
  checks,
  evidence,
  context,
  targetPubkey,
  graphMatch,
  routeProbe,
  routeBuild
) {
  if (context.partialErrors?.graphNodes) {
    checks.push({
      status: "warn",
      title: "Network graph lookup",
      detail: `Could not read graph nodes: ${context.partialErrors.graphNodes.message}`
    });
    return;
  }

  if (!targetPubkey) {
    return;
  }

  checks.push({
    status:
      graphMatch || routeProbe.routeFound || routeBuild.status === "ready"
        ? graphMatch
          ? "pass"
          : "warn"
        : "fail",
    title: "Target in graph",
    detail: graphMatch
      ? "The target pubkey was found in the Fiber network graph."
      : routeProbe.routeFound || routeBuild.status === "ready"
        ? "The graph snapshot missed the target pubkey, but Fiber still built a usable route from this sender. Treat graph visibility as stale, partial, or private-path evidence."
        : "The target pubkey was not found in the current Fiber network graph snapshot."
  });
  evidence.push({ label: "Target pubkey", value: targetPubkey });
}

function addPeerIdFinding(checks, evidence, targetPubkey) {
  if (!looksLikePeerId(targetPubkey)) {
    return;
  }

  checks.push({
    status: "warn",
    title: "Target identifier",
    detail:
      "The target looks like a legacy peer_id. Fiber v0.8.0+ expects pubkey values in RPC calls."
  });
  evidence.push({ label: "Target value", value: targetPubkey });
}

function buildRpcFailureDiagnosis({ context, request, source, scenario }) {
  const isUnauthorized =
    context.error.code === -32999 || isUnauthorizedError(context.error);
  const invalidResponse = context.error.code === "RPC_INVALID_RESPONSE";
  const rpcCategory = isUnauthorized
    ? "rpc_unauthorized"
    : invalidResponse
      ? "rpc_invalid_response"
      : "rpc_unavailable";

  return finalizeDiagnosis({
    headline: isUnauthorized
      ? "RPC authentication is blocking diagnostics"
      : invalidResponse
        ? "Fiber RPC returned an invalid response"
        : "Fiber RPC is unavailable",
    category: rpcCategory,
    severity: "critical",
    confidence: 0.99,
    explanation: isUnauthorized
      ? "The node responded, but the request did not include a valid Biscuit bearer token for the requested RPC methods."
      : invalidResponse
        ? "The Fiber node responded, but the payload was malformed or missing the expected JSON-RPC result fields, so diagnostics could not trust the snapshot."
        : "The diagnostics service could not reach the Fiber node over JSON-RPC, so it cannot inspect payments, channels, or invoices.",
    checks: [
      { status: "fail", title: "RPC access", detail: context.error.message }
    ],
    evidence: [
      {
        label: "Endpoint",
        value: request.endpoint || context.endpoint || "Unknown"
      },
      {
        label: "RPC error code",
        value: String(context.error.code || "Unknown")
      }
    ],
    nextActions: isUnauthorized
      ? [
          "Provide a valid Biscuit bearer token with permission to read the required modules.",
          "Confirm the token scopes match the RPC methods you need, especially graph, channel, invoice, and payment reads.",
          "If the node is local, prefer localhost access and keep the token narrow."
        ]
      : invalidResponse
        ? [
            "Inspect the upstream Fiber RPC response for malformed JSON or missing result fields.",
            "Confirm the endpoint is a Fiber JSON-RPC server and not an HTML, proxy, or unrelated service.",
            "Retry once the RPC surface returns valid JSON-RPC payloads for the requested methods."
          ]
        : [
            "Verify the Fiber node process is running and listening on the expected RPC address.",
            "Confirm the endpoint and port are correct and reachable from this app.",
            "If the node is protected, add a valid Biscuit bearer token before retrying."
          ],
    references: [DOCS.rpcOverview, DOCS.troubleshooting],
    source,
    scenario
  });
}

function finalizeDiagnosis({
  headline,
  category,
  severity,
  confidence,
  explanation,
  checks,
  evidence,
  nextActions,
  references,
  source,
  scenario
}) {
  return {
    headline,
    category,
    severity,
    confidence,
    explanation,
    checks,
    evidence,
    nextActions,
    references,
    source,
    scenario: scenario ? { id: scenario.id, name: scenario.name } : null
  };
}

function normalizePaymentStatus(value) {
  if (!value) {
    return value;
  }
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
