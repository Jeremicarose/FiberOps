import { demoScenarios, getDemoScenario, listDemoScenarioMeta } from "./demo-scenarios.js";
import { FiberRpcClient, isUnauthorizedError } from "./fiber-rpc.js";

const DOCS = {
  troubleshooting: {
    label: "Troubleshooting",
    url: "https://www.fiber.world/docs/faq/troubleshooting"
  },
  rpcOverview: {
    label: "RPC Overview",
    url: "https://www.fiber.world/docs/api-reference"
  },
  paymentLifecycle: {
    label: "Payment Lifecycle",
    url: "https://www.fiber.world/docs/concept/payments/payment-lifecycle"
  },
  multiHop: {
    label: "Multi-Hop Payments",
    url: "https://www.fiber.world/docs/concept/routing/multi-hop"
  },
  trampoline: {
    label: "Trampoline Routing",
    url: "https://www.fiber.world/docs/concept/routing/trampoline-routing"
  },
  sdk: {
    label: "JavaScript SDK",
    url: "https://www.fiber.world/docs/build/sdk/js"
  },
  networkResources: {
    label: "Network Resources",
    url: "https://www.fiber.world/docs/quick-start/network-resources"
  },
  connectNodes: {
    label: "Connect Public Nodes",
    url: "https://www.fiber.world/docs/operate/connect-nodes"
  }
};

const OPEN_CHANNEL_KEYWORDS = ["open", "ready", "active", "enabled"];

export function getBootstrapData(defaultEndpoint = "http://127.0.0.1:8227") {
  return {
    defaultEndpoint,
    scenarios: listDemoScenarioMeta()
  };
}

export async function runDiagnosis(payload = {}, options = {}) {
  const mode = payload.mode === "live" ? "live" : "demo";
  if (mode === "live") {
    return analyzeLive(payload, options);
  }
  return analyzeDemo(payload);
}

export function buildDiagnosis({ source = "demo", request = {}, context = {}, scenario = null }) {
  const checks = [];
  const evidence = [];
  const nextActions = [];
  const references = new Map();
  const channels = extractChannels(context.channels);
  const openChannels = channels.filter(isOpenChannel);
  const totalOutbound = sumBigInts(openChannels.map(extractLocalBalance).filter(Boolean));
  const requestedAmount = resolveRequestedAmount(request, context.parsedInvoice);
  const paymentStatus = normalizeLabel(extractPaymentStatus(context.payment));
  const failedError = extractFailedError(context.payment);
  const targetPubkey = resolveTargetPubkey(request, context.parsedInvoice);
  const graphNodes = extractGraphNodes(context.graphNodes);
  const graphMatch = targetPubkey ? findGraphNodeByPubkey(graphNodes, targetPubkey) : null;

  addReference(references, "rpcOverview");
  addReference(references, "troubleshooting");

  if (context.error) {
    const isUnauthorized = context.error.code === -32999 || isUnauthorizedError(context.error);
    return finalizeDiagnosis({
      headline: isUnauthorized ? "RPC authentication is blocking diagnostics" : "Fiber RPC is unavailable",
      category: isUnauthorized ? "rpc_unauthorized" : "rpc_unavailable",
      severity: "critical",
      confidence: 0.99,
      explanation: isUnauthorized
        ? "The node responded, but the request did not include a valid Biscuit bearer token for the requested RPC methods."
        : "The diagnostics service could not reach the Fiber node over JSON-RPC, so it cannot inspect payments, channels, or invoices.",
      checks: [
        {
          status: "fail",
          title: "RPC access",
          detail: context.error.message
        }
      ],
      evidence: [
        {
          label: "Endpoint",
          value: request.endpoint || context.endpoint || "Unknown"
        }
      ],
      nextActions: isUnauthorized
        ? [
            "Provide a valid Biscuit bearer token with permission to read the required modules.",
            "Confirm the token scopes match the RPC methods you need, especially graph, channel, invoice, and payment reads.",
            "If the node is local, prefer localhost access and keep the token narrow."
          ]
        : [
            "Verify the Fiber node process is running and listening on the expected RPC address.",
            "Confirm the endpoint and port are correct and reachable from this app.",
            "If the node is protected, add a valid Biscuit bearer token before retrying."
          ],
      references: isUnauthorized
        ? [DOCS.rpcOverview, DOCS.troubleshooting]
        : [DOCS.rpcOverview, DOCS.troubleshooting],
      source,
      scenario
    });
  }

  if (context.nodeInfo) {
    checks.push({
      status: "pass",
      title: "RPC reachable",
      detail: `Connected to Fiber node ${pickFirst(context.nodeInfo, ["version", "node_version"]) || "with unknown version"}.`
    });
    evidence.push({
      label: "Node version",
      value: pickFirst(context.nodeInfo, ["version", "node_version"]) || "Unknown"
    });
  }

  if (context.partialErrors?.channels) {
    checks.push({
      status: "warn",
      title: "Channel read",
      detail: `Could not read channels: ${context.partialErrors.channels.message}`
    });
  } else if (channels.length === 0) {
    checks.push({
      status: "fail",
      title: "Open channels",
      detail: "No channel data is available, so outbound liquidity may be zero."
    });
  } else {
    checks.push({
      status: openChannels.length > 0 ? "pass" : "warn",
      title: "Open channels",
      detail: openChannels.length > 0
        ? `${openChannels.length} open channel(s) detected.`
        : "Channels were returned, but none look open or ready."
    });
    evidence.push({
      label: "Open channels",
      value: String(openChannels.length)
    });
  }

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
      status: requestedAmount !== null && totalOutbound < requestedAmount ? "fail" : "pass",
      title: "Local outbound capacity",
      detail: requestedAmount !== null
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
    evidence.push({
      label: "Payment status",
      value: paymentStatus
    });
    checks.push({
      status: paymentStatus === "Success" ? "pass" : paymentStatus === "Failed" ? "fail" : "warn",
      title: "Payment state",
      detail: `Fiber reports the payment as ${paymentStatus}.`
    });
  }

  if (failedError) {
    evidence.push({
      label: "failed_error",
      value: failedError
    });
  }

  if (context.partialErrors?.payment) {
    checks.push({
      status: "warn",
      title: "Payment lookup",
      detail: `Payment details could not be read: ${context.partialErrors.payment.message}`
    });
  }

  if (context.partialErrors?.graphNodes) {
    checks.push({
      status: "warn",
      title: "Network graph lookup",
      detail: `Could not read graph nodes: ${context.partialErrors.graphNodes.message}`
    });
  } else if (targetPubkey) {
    checks.push({
      status: graphMatch ? "pass" : "fail",
      title: "Target in graph",
      detail: graphMatch
        ? "The target pubkey was found in the Fiber network graph."
        : "The target pubkey was not found in the current Fiber network graph snapshot."
    });
    evidence.push({
      label: "Target pubkey",
      value: targetPubkey
    });
  }

  if (looksLikePeerId(request.targetPubkey)) {
    checks.push({
      status: "warn",
      title: "Target identifier",
      detail: "The target looks like a legacy peer_id. Fiber v0.8.0+ expects pubkey values in RPC calls."
    });
    evidence.push({
      label: "Target value",
      value: request.targetPubkey
    });
  }

  let classification = {
    headline: "Collect a payment hash or invoice to diagnose a specific failure",
    category: "needs_more_context",
    severity: "medium",
    confidence: 0.55,
    explanation: "The node is reachable, but there is not enough payment-specific context yet to explain a failure. Provide an invoice, payment hash, or requested amount to tighten the diagnosis.",
    actions: [
      "Paste a Fiber invoice to validate expiry, amount, and metadata before retrying.",
      "Paste a payment hash to inspect final status and failed_error from the node.",
      "Keep this tool read-only for the demo: analyze existing state instead of sending a payment from the app."
    ],
    refs: ["sdk", "rpcOverview"]
  };

  if (context.partialErrors?.parsedInvoice && !paymentStatus) {
    classification = {
      headline: "The invoice string is invalid or unsupported",
      category: "invalid_invoice",
      severity: "high",
      confidence: 0.92,
      explanation: "Fiber could not parse the invoice, so the payment cannot be validated or routed from this input.",
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
      explanation: "The invoice timestamp plus expiry is in the past, so the recipient should reject the payment even if a route exists.",
      actions: [
        "Request a new invoice from the recipient with a longer expiry.",
        "Validate invoice expiry with parse_invoice before sending.",
        "If this is a recurring issue, add expiry warnings to the caller flow before routing."
      ],
      refs: ["troubleshooting", "sdk"]
    };
  } else if (requestedAmount !== null && totalOutbound !== null && totalOutbound < requestedAmount) {
    classification = {
      headline: "Outbound liquidity is too low for this payment",
      category: "insufficient_liquidity",
      severity: "high",
      confidence: 0.88,
      explanation: "The node appears to have less local outbound balance than the requested amount, so the payment is unlikely to succeed without a different channel mix or a smaller amount.",
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
      explanation: "The Fiber node is reachable and on the network, but it has no channels yet. Until the wallet is funded and at least one channel is opened, payment diagnostics will be limited to connectivity and invoice checks.",
      actions: [
        "Fund the node's CKB address from the testnet faucet.",
        "Connect to a public testnet node and open at least one channel.",
        "After the first channel is live, rerun FiberOps with an invoice or payment hash to diagnose real routing behavior."
      ],
      refs: ["networkResources", "connectNodes", "troubleshooting"]
    };
  } else if (targetPubkey && graphNodes.length > 0 && !graphMatch) {
    classification = {
      headline: "The target node is not visible in the Fiber graph",
      category: "target_not_in_graph",
      severity: "high",
      confidence: 0.91,
      explanation: "Fiber cannot route reliably to a node that is missing from the current network graph, even if the invoice or pubkey string is otherwise valid.",
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
      explanation: "Fiber reports the payment as Created or Inflight. Routing and settlement are asynchronous, so the payment may still succeed or fail on a later poll.",
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
      explanation: "Fiber reports the payment as successful, so no failure diagnosis is necessary for this payment hash.",
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
      explanation: "The node returned channel data, but none of the channels look open or active enough to support a payment attempt.",
      actions: [
        "Confirm the channel state transitions have completed before sending a payment.",
        "Inspect pending or shutdown channels directly on the node to see why they are not active.",
        "For the hackathon MVP, surface channel state clearly before letting users attempt a payment."
      ],
      refs: ["troubleshooting", "paymentLifecycle"]
    };
  }

  for (const action of classification.actions) {
    pushUnique(nextActions, action);
  }

  for (const key of classification.refs) {
    addReference(references, key);
  }

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

async function analyzeDemo(payload) {
  const scenario = getDemoScenario(payload.scenarioId) ?? demoScenarios[0];
  const request = {
    ...scenario.request,
    ...pickDefined({
      invoice: payload.invoice,
      paymentHash: payload.paymentHash,
      amount: payload.amount,
      targetPubkey: payload.targetPubkey
    })
  };

  return finalizeResult({
    source: "demo",
    request,
    context: scenario.context,
    scenario
  });
}

async function analyzeLive(payload, options) {
  const endpoint = payload.endpoint?.trim() || options.defaultEndpoint || "http://127.0.0.1:8227";
  const token = payload.token?.trim() || "";
  const context = {
    endpoint,
    partialErrors: {}
  };
  const request = {
    ...pickDefined({
      invoice: trimOrEmpty(payload.invoice),
      paymentHash: trimOrEmpty(payload.paymentHash),
      amount: trimOrEmpty(payload.amount),
      targetPubkey: trimOrEmpty(payload.targetPubkey)
    }),
    endpoint
  };
  const client = new FiberRpcClient({
    endpoint,
    token,
    timeoutMs: Number(payload.timeoutMs) > 0 ? Number(payload.timeoutMs) : undefined
  });

  try {
    context.nodeInfo = await client.call("node_info");
  } catch (error) {
    context.error = serializeError(error);
    return finalizeResult({
      source: "live",
      request,
      context
    });
  }

  await captureCall(context, "channels", client, "list_channels", {});

  if (request.invoice) {
    await captureCall(context, "parsedInvoice", client, "parse_invoice", {
      invoice: request.invoice
    });
  }

  const targetPubkey = resolveTargetPubkey(request, context.parsedInvoice);
  if (targetPubkey) {
    await captureCall(context, "graphNodes", client, "graph_nodes", {});
  }

  if (request.paymentHash) {
    await captureCall(context, "payment", client, "get_payment", {
      payment_hash: request.paymentHash
    });
  }

  return finalizeResult({
    source: "live",
    request,
    context
  });
}

async function captureCall(context, key, client, method, params) {
  try {
    context[key] = await client.call(method, params);
  } catch (error) {
    context.partialErrors[key] = serializeError(error);
  }
}

function finalizeResult({ source, request, context, scenario = null }) {
  const diagnosis = buildDiagnosis({
    source,
    request,
    context,
    scenario
  });
  const summary = summarizeContext(context, request);
  const routePreview = buildRoutePreview({
    request,
    context,
    diagnosis,
    summary
  });
  const alerts = buildAlerts({
    request,
    context,
    diagnosis,
    summary,
    routePreview,
    scenario
  });
  const event = buildEventEnvelope({
    source,
    request,
    diagnosis,
    scenario,
    summary
  });

  return {
    source,
    scenario: scenario
      ? {
          id: scenario.id,
          name: scenario.name,
          description: scenario.description
        }
      : null,
    diagnosis,
    summary,
    routePreview,
    alerts,
    event,
    analyzedAt: event.timestamp
  };
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
    scenario: scenario
      ? {
          id: scenario.id,
          name: scenario.name
        }
      : null
  };
}

function classifyFailure(rawFailure) {
  const value = String(rawFailure || "");
  const normalized = value.toLowerCase();

  if (/insufficient balance|max outbound liquidity|insufficient liquidity|temporarychannelfailure|liquidity exhausted|outbound/.test(normalized)) {
    return {
      headline: "Channel liquidity is the likely failure point",
      category: "insufficient_liquidity",
      severity: "high",
      confidence: 0.94,
      explanation: "The failure indicates there is not enough outbound balance on the available channel set to cover the requested amount. Fiber could not build a route because liquidity was insufficient, not because the destination was unknown.",
      actions: [
        "Retry with a smaller amount that fits within current outbound liquidity.",
        "Open or refill channels before attempting the full payment again.",
        "Use this exact failed_error string in FiberOps so operators can distinguish route absence from route insufficiency."
      ],
      refs: ["troubleshooting", "paymentLifecycle"]
    };
  }

  if (/failed to build route|no route could be found|route not found|no path/.test(normalized)) {
    return {
      headline: "Fiber could not build a usable route",
      category: "route_unavailable",
      severity: "high",
      confidence: 0.94,
      explanation: "The node could not find a route that satisfies the amount, connectivity, and fee constraints. This often means the target is not reachable in the current graph or no path has enough liquidity.",
      actions: [
        "Verify the target node exists in the network graph and uses a pubkey, not a legacy peer_id.",
        "Inspect local channels for sufficient balance before retrying.",
        "Try a smaller amount or a different route strategy if the target is only marginally reachable."
      ],
      refs: ["troubleshooting", "multiHop"]
    };
  }

  if (/feeinsufficient|fee too high|max_fee_amount|max_fee_rate|relay fee/.test(normalized)) {
    return {
      headline: "The fee budget is too low for the selected route",
      category: "fee_budget_too_low",
      severity: "medium",
      confidence: 0.95,
      explanation: "Fiber found a route, but the forwarded amount does not cover cumulative relay fees or the max fee budget is too tight.",
      actions: [
        "Increase max_fee_amount or max_fee_rate before retrying.",
        "Use dry_run in your operational tooling to preview route fees before sending.",
        "Prefer shorter or cheaper routes when you can influence route selection."
      ],
      refs: ["troubleshooting", "paymentLifecycle"]
    };
  }

  if (/expirytoosoon|timeout|timed out|expiry/.test(normalized)) {
    return {
      headline: "The payment likely failed on timeout or expiry constraints",
      category: "timeout_or_expiry",
      severity: "medium",
      confidence: 0.86,
      explanation: "The route appears to have run out of time lock budget or took too long to complete across intermediate hops.",
      actions: [
        "Retry on a shorter or healthier route if you can control routing.",
        "Increase tlc_expiry_delta in the sending flow when appropriate.",
        "Check intermediate node availability if timeouts happen repeatedly."
      ],
      refs: ["troubleshooting", "multiHop"]
    };
  }

  if (/incorrectorunknownpaymentdetails|invoice mismatch|payment hash|invoice/.test(normalized)) {
    return {
      headline: "The invoice details do not match what the receiver expects",
      category: "invoice_mismatch",
      severity: "high",
      confidence: 0.93,
      explanation: "The payment reached the recipient path but failed validation against invoice details such as amount, hash, or expiry.",
      actions: [
        "Parse the invoice before paying to validate amount and expiry.",
        "Request a fresh invoice if the current one may be stale or copied incorrectly.",
        "Confirm the payment hash matches the intended invoice."
      ],
      refs: ["troubleshooting", "sdk"]
    };
  }

  if (/permanentchannelfailure|channel closed|channel unavailable/.test(normalized)) {
    return {
      headline: "A required channel is unavailable or closed",
      category: "channel_unavailable",
      severity: "high",
      confidence: 0.89,
      explanation: "The route depends on a channel that is no longer usable, so Fiber should avoid it after the failure is learned and propagated.",
      actions: [
        "Reconnect peers and let the graph refresh before retrying.",
        "Remove or deprioritize unstable peers from operational route choices.",
        "Capture channel-level incident history so operators can spot chronic failures."
      ],
      refs: ["troubleshooting", "multiHop"]
    };
  }

  if (/temporarynodefailure|node temporarily unavailable|offline/.test(normalized)) {
    return {
      headline: "An intermediate node appears temporarily unavailable",
      category: "node_unavailable",
      severity: "medium",
      confidence: 0.87,
      explanation: "The failure points to a node on the route being temporarily down or unable to forward the payment right now.",
      actions: [
        "Retry after a short delay and compare with an alternate route if possible.",
        "Track peer uptime and recent failures so repeated outages are visible.",
        "Escalate chronic node instability to the operator or avoid that peer."
      ],
      refs: ["troubleshooting", "multiHop"]
    };
  }

  if (/requirednodefeaturemissing|trampoline/.test(normalized)) {
    return {
      headline: "The selected route is missing a required feature",
      category: "feature_missing",
      severity: "medium",
      confidence: 0.96,
      explanation: "This usually means a trampoline node or intermediate hop does not advertise the feature required by the payment flow.",
      actions: [
        "Choose a different trampoline node or route that advertises the required feature bits.",
        "Inspect node features in your routing diagnostics before selecting trampoline hops.",
        "If possible, compare behavior with a non-trampoline route to isolate the issue."
      ],
      refs: ["troubleshooting", "trampoline"]
    };
  }

  return {
    headline: "Fiber returned a failure that needs closer inspection",
    category: "unknown_failure",
    severity: "medium",
    confidence: 0.6,
    explanation: "The payment failed, but the current ruleset does not map the failed_error cleanly to a documented category yet.",
    actions: [
      "Capture the exact failed_error and add a rule for it in the diagnostics engine.",
      "Compare the failure against recent successful attempts with the same target and amount.",
      "Cross-check the Fiber troubleshooting guide for newly documented failure modes."
    ],
    refs: ["troubleshooting", "sdk"]
  };
}

function analyzeInvoice(parsedInvoice, request) {
  if (!parsedInvoice) {
    return {
      hasInvoice: Boolean(request.invoice),
      expired: false,
      currency: null,
      description: null,
      expiryTimestamp: null
    };
  }

  const timestamp = extractNumber(parsedInvoice, ["timestamp", "data.timestamp"]);
  const expiry = extractNumber(parsedInvoice, ["expiry", "data.expiry"]);
  const expiryTimestamp = timestamp !== null && expiry !== null ? timestamp + expiry : null;

  return {
    hasInvoice: true,
    expired: expiryTimestamp !== null ? Math.floor(Date.now() / 1000) > expiryTimestamp : false,
    currency: pickFirst(parsedInvoice, ["currency", "data.currency"]),
    description: extractInvoiceDescription(parsedInvoice),
    expiryTimestamp
  };
}

function summarizeContext(context, request) {
  const channels = extractChannels(context.channels);
  const openChannels = channels.filter(isOpenChannel);
  const outbound = sumBigInts(openChannels.map(extractLocalBalance).filter(Boolean));
  const parsedInvoice = analyzeInvoice(context.parsedInvoice, request);
  const targetPubkey = resolveTargetPubkey(request, context.parsedInvoice);
  const graphNodes = extractGraphNodes(context.graphNodes);
  const graphMatch = targetPubkey ? findGraphNodeByPubkey(graphNodes, targetPubkey) : null;
  const paymentStatus = normalizeLabel(extractPaymentStatus(context.payment));
  const partialErrors = context.partialErrors || {};
  const partialErrorKeys = Object.keys(partialErrors);
  const readyChannels = channels.filter((channel) => {
    const state = String(pickFirst(channel, ["state.state_name", "state.stateName", "state", "status"]) || "").toLowerCase();
    return state.includes("ready");
  });

  return {
    endpoint: request.endpoint || context.endpoint || null,
    nodeVersion: pickFirst(context.nodeInfo, ["version", "node_version"]) || null,
    paymentStatus,
    failedError: extractFailedError(context.payment),
    openChannels: openChannels.length,
    readyChannels: readyChannels.length,
    totalChannels: channels.length,
    estimatedOutbound: outbound !== null ? formatAmount(outbound) : null,
    invoiceCurrency: parsedInvoice.currency,
    invoiceExpired: parsedInvoice.hasInvoice ? parsedInvoice.expired : null,
    targetInGraph: targetPubkey ? Boolean(graphMatch) : null,
    targetPubkey,
    peerCount: extractNumber(context.nodeInfo, ["peers_count", "peer_count", "num_peers", "peersCount"]),
    partialErrors,
    partialErrorCount: partialErrorKeys.length,
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
      partialErrorKeys
    })
  };
}

function buildEventEnvelope({ source, request, diagnosis, scenario, summary }) {
  const timestamp = new Date().toISOString();
  const endpointLabel = request.endpoint || summary.endpoint || null;
  const scenarioId = scenario?.id || diagnosis.scenario?.id || null;

  return {
    id: buildEventId(source, diagnosis.category, scenarioId, endpointLabel, timestamp),
    timestamp,
    source,
    kind: diagnosis.category === "success" ? "diagnostic.recovered" : "diagnostic.observed",
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
      request.targetPubkey ? "target-pubkey" : null
    ])
  };
}

function buildRoutePreview({ request, context, diagnosis, summary }) {
  const requestedAmount = resolveRequestedAmount(request, context.parsedInvoice);
  const targetPubkey = resolveTargetPubkey(request, context.parsedInvoice);
  const channels = extractChannels(context.channels);
  const openChannels = channels.filter(isOpenChannel);
  const estimatedOutbound = sumBigInts(openChannels.map(extractLocalBalance).filter(Boolean));
  const graphNodes = extractGraphNodes(context.graphNodes);
  const graphMatch = targetPubkey ? findGraphNodeByPubkey(graphNodes, targetPubkey) : null;
  const parsedInvoice = analyzeInvoice(context.parsedInvoice, request);
  const failureClassification = classifyFailure(extractFailedError(context.payment) || diagnosis.category);
  const openHopCandidates = openChannels.slice(0, 3).map((channel, index) => ({
    hop: index + 1,
    channelId: pickFirst(channel, ["channel_id", "channelId", "id"]) || `channel-${index + 1}`,
    state: normalizeLabel(pickFirst(channel, ["state.state_name", "state.stateName", "state", "status"]) || "unknown"),
    localBalance: formatAmount(extractLocalBalance(channel))
  }));

  let status = "unknown";
  let blockingReason = null;

  if (context.partialErrors?.channels) {
    status = "degraded";
    blockingReason = "Channel data could not be read from Fiber RPC.";
  } else if (parsedInvoice.hasInvoice && parsedInvoice.expired) {
    status = "blocked";
    blockingReason = "Invoice has expired.";
  } else if (channels.length > 0 && openChannels.length === 0) {
    status = "blocked";
    blockingReason = "No open or ready channels are available.";
  } else if (targetPubkey && graphNodes.length > 0 && !graphMatch) {
    status = "blocked";
    blockingReason = "Target pubkey is not visible in the current graph snapshot.";
  } else if (requestedAmount !== null && estimatedOutbound !== null && estimatedOutbound < requestedAmount) {
    status = "blocked";
    blockingReason = "Estimated outbound liquidity is below the requested amount.";
  } else if (diagnosis.category === "route_unavailable") {
    status = "blocked";
    blockingReason = "Fiber could not build a usable route with current graph visibility.";
  } else if (diagnosis.category === "success") {
    status = "ready";
  } else if (openChannels.length > 0) {
    status = requestedAmount === null ? "possible" : "ready";
  }

  return {
    mode: context.routeBuildSupport ? "rpc" : "heuristic",
    status,
    blockingReason,
    estimatedOutbound: estimatedOutbound !== null ? formatAmount(estimatedOutbound) : null,
    feeHint: deriveFeeHint({ diagnosis, requestedAmount, estimatedOutbound, failureClassification }),
    hopHints: openHopCandidates
  };
}

function buildAlerts({ request, context, diagnosis, summary, routePreview, scenario }) {
  const alerts = [];
  const scenarioLabel = scenario?.name || null;

  if (["rpc_unavailable", "rpc_unauthorized", "insufficient_liquidity", "channel_not_ready"].includes(diagnosis.category)) {
    alerts.push({
      id: buildStableId(`diagnosis-${diagnosis.category}-${request.endpoint || scenario?.id || "global"}`),
      severity: diagnosis.severity,
      title: diagnosis.headline,
      message: diagnosis.explanation,
      cause: diagnosis.category,
      suggestedAction: diagnosis.nextActions[0] || "Inspect the diagnosis details.",
      dedupeKey: `${diagnosis.category}:${request.endpoint || scenario?.id || "global"}`
    });
  }

  for (const [key, error] of Object.entries(context.partialErrors || {})) {
    alerts.push({
      id: buildStableId(`partial-${key}-${error.code}-${error.method}`),
      severity: "medium",
      title: `${humanizeToken(key)} RPC read degraded`,
      message: error.message,
      cause: "partial_rpc_failure",
      suggestedAction: `Retry the ${humanizeToken(key).toLowerCase()} read and verify the RPC method permissions or availability.`,
      dedupeKey: `partial_rpc_failure:${key}:${error.code}`
    });
  }

  if (routePreview.status === "blocked" && routePreview.blockingReason) {
    alerts.push({
      id: buildStableId(`route-preview-${diagnosis.category}-${routePreview.blockingReason}`),
      severity: diagnosis.severity === "low" ? "medium" : diagnosis.severity,
      title: "Route preview is blocked",
      message: routePreview.blockingReason,
      cause: diagnosis.category,
      suggestedAction: diagnosis.nextActions[0] || "Inspect channel state and invoice data before retrying.",
      dedupeKey: `route_preview:${diagnosis.category}:${routePreview.blockingReason}`
    });
  }

  if (summary.paymentReadiness === "degraded" && !alerts.some((alert) => alert.cause === "partial_rpc_failure")) {
    alerts.push({
      id: buildStableId(`payment-readiness-${request.endpoint || scenario?.id || "global"}`),
      severity: "medium",
      title: "Monitoring snapshot is degraded",
      message: `FiberOps collected a partial snapshot${scenarioLabel ? ` for ${scenarioLabel}` : ""}. Some operator signals may be incomplete.`,
      cause: "snapshot_degraded",
      suggestedAction: "Retry the snapshot once the missing RPC reads are available.",
      dedupeKey: `snapshot_degraded:${request.endpoint || scenario?.id || "global"}`
    });
  }

  return dedupeAlerts(alerts);
}

function derivePaymentReadiness({ channels, openChannels, readyChannels, outbound, parsedInvoice, targetPubkey, graphNodes, graphMatch, paymentStatus, partialErrorKeys }) {
  if (partialErrorKeys.length > 0) {
    return "degraded";
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

function deriveFeeHint({ diagnosis, requestedAmount, estimatedOutbound, failureClassification }) {
  if (diagnosis.category === "fee_budget_too_low" || failureClassification.category === "fee_budget_too_low") {
    return "Fee budget looks tight for the current route constraints.";
  }
  if (requestedAmount !== null && estimatedOutbound !== null && estimatedOutbound >= requestedAmount) {
    return "Liquidity appears sufficient, so fees or graph conditions may be the next constraint.";
  }
  if (diagnosis.category === "success") {
    return "Recent route conditions were healthy enough to settle this payment.";
  }
  return "Heuristic preview only; no live fee quote was requested from Fiber RPC.";
}

function dedupeAlerts(alerts) {
  const seen = new Set();
  return alerts.filter((alert) => {
    if (seen.has(alert.dedupeKey)) {
      return false;
    }
    seen.add(alert.dedupeKey);
    return true;
  });
}

function buildEventId(source, category, scenarioId, endpoint, timestamp) {
  return buildStableId([source, category, scenarioId || endpoint || "global", timestamp].join(":"));
}

function buildStableId(value) {
  let hash = 0;
  for (const character of String(value)) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `evt_${hash.toString(16).padStart(8, "0")}`;
}

function compact(values) {
  return values.filter(Boolean);
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function humanizeToken(value) {
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function serializeError(error) {
  return {
    code: error?.code ?? "UNKNOWN",
    message: error?.message ?? "Unknown Fiber RPC error",
    status: error?.status ?? null,
    method: error?.method ?? null
  };
}

function extractChannels(result) {
  if (Array.isArray(result)) {
    return result;
  }
  if (Array.isArray(result?.channels)) {
    return result.channels;
  }
  if (Array.isArray(result?.items)) {
    return result.items;
  }
  return [];
}

function extractGraphNodes(result) {
  if (Array.isArray(result)) {
    return result;
  }
  if (Array.isArray(result?.nodes)) {
    return result.nodes;
  }
  if (Array.isArray(result?.items)) {
    return result.items;
  }
  return [];
}

function extractPaymentStatus(payment) {
  return pickFirst(payment, ["status", "payment_status", "state"]);
}

function extractFailedError(payment) {
  return pickFirst(payment, ["failedError", "failed_error", "last_error", "error"]);
}

function extractLocalBalance(channel) {
  const value = pickFirst(channel, [
    "local_balance",
    "localBalance",
    "to_local_amount",
    "toLocalAmount",
    "local_amount",
    "balance"
  ]);
  return toBigIntOrNull(value);
}

function resolveRequestedAmount(request, parsedInvoice) {
  const explicitAmount = toBigIntOrNull(request.amount);
  if (explicitAmount !== null) {
    return explicitAmount;
  }

  return toBigIntOrNull(
    pickFirst(parsedInvoice, [
      "amount",
      "data.amount",
      "invoice.amount"
    ])
  );
}

function extractInvoiceDescription(parsedInvoice) {
  const attrs = pickFirst(parsedInvoice, ["data.attrs", "attrs"]);
  if (!Array.isArray(attrs)) {
    return null;
  }
  for (const attr of attrs) {
    if (attr && typeof attr === "object" && typeof attr.description === "string") {
      return attr.description;
    }
  }
  return null;
}

function resolveTargetPubkey(request, parsedInvoice) {
  return pickFirst(
    {
      request,
      parsedInvoice
    },
    [
      "request.targetPubkey",
      "parsedInvoice.payee_pubkey",
      "parsedInvoice.payeePubkey",
      "parsedInvoice.pubkey",
      "parsedInvoice.node_pubkey",
      "parsedInvoice.nodePubkey",
      "parsedInvoice.data.payee_pubkey",
      "parsedInvoice.data.payeePubkey"
    ]
  );
}

function findGraphNodeByPubkey(nodes, targetPubkey) {
  const target = String(targetPubkey).toLowerCase();
  return nodes.find((node) => {
    const candidate = pickFirst(node, [
      "pubkey",
      "node_pubkey",
      "nodePubkey",
      "peer_pubkey",
      "id"
    ]);
    return typeof candidate === "string" && candidate.toLowerCase() === target;
  }) ?? null;
}

function looksLikePeerId(value) {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  return !value.startsWith("0x") && /^(Qm|12D3Koo)/.test(value);
}

function isOpenChannel(channel) {
  const raw = String(
    pickFirst(channel, ["state.state_name", "state.stateName", "state", "status"]) || ""
  ).toLowerCase();
  return OPEN_CHANNEL_KEYWORDS.some((keyword) => raw.includes(keyword));
}

function sumBigInts(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0n);
}

function addReference(store, key) {
  if (DOCS[key]) {
    store.set(key, DOCS[key]);
  }
}

function pushUnique(list, value) {
  if (!list.includes(value)) {
    list.push(value);
  }
}

function formatAmount(value) {
  if (value === null) {
    return "Unknown";
  }
  return new Intl.NumberFormat("en-US").format(Number(value.toString()));
}

function normalizeLabel(value) {
  if (!value) {
    return null;
  }
  if (typeof value !== "string") {
    return String(value);
  }
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function pickFirst(source, paths) {
  if (!source) {
    return null;
  }
  for (const path of paths) {
    const value = path.split(".").reduce((current, key) => {
      if (current && typeof current === "object" && key in current) {
        return current[key];
      }
      return undefined;
    }, source);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

function extractNumber(source, paths) {
  const value = pickFirst(source, paths);
  if (value === null) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.startsWith("0x")) {
    return Number.parseInt(value.slice(2), 16);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBigIntOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string") {
    try {
      if (value.startsWith("0x") || value.startsWith("0X")) {
        return BigInt(value);
      }
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
}

function trimOrEmpty(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pickDefined(source) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value));
}
