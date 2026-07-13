const OPEN_CHANNEL_KEYWORDS = ["open", "ready", "active", "enabled"];

export const DOCS = {
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

export const PROBE_METHOD_LABEL = "send_payment(dry_run)";
export const ROUTE_BUILD_METHOD_LABEL = "build_router";

export function compact(values) {
  return values.filter(Boolean);
}

export function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function humanizeToken(value) {
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function serializeError(error) {
  return {
    code: error?.code ?? "UNKNOWN",
    message: error?.message ?? "Unknown Fiber RPC error",
    status: error?.status ?? null,
    method: error?.method ?? null,
    endpoint: error?.endpoint ?? null,
    details: error?.details ?? null
  };
}

export function extractChannels(result) {
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

export function extractGraphNodes(result) {
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

export function extractGraphChannels(result) {
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

export function extractPaymentStatus(payment) {
  return pickFirst(payment, ["status", "payment_status", "state"]);
}

export function extractFailedError(payment) {
  return pickFirst(payment, [
    "failedError",
    "failed_error",
    "last_error",
    "error"
  ]);
}

export function extractLocalBalance(channel) {
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

export function resolveRequestedAmount(request, parsedInvoice) {
  const explicitAmount = toBigIntOrNull(request.amount);
  if (explicitAmount !== null) {
    return explicitAmount;
  }

  return toBigIntOrNull(
    pickFirst(parsedInvoice, ["amount", "data.amount", "invoice.amount"])
  );
}

export function extractInvoiceDescription(parsedInvoice) {
  const invoice = normalizeParsedInvoice(parsedInvoice);
  const attrs = pickFirst(invoice, ["data.attrs", "attrs"]);
  if (!Array.isArray(attrs)) {
    return null;
  }
  for (const attr of attrs) {
    if (
      attr &&
      typeof attr === "object" &&
      typeof attr.description === "string"
    ) {
      return attr.description;
    }
  }
  return null;
}

export function extractInvoicePayeePubkey(parsedInvoice) {
  const invoice = normalizeParsedInvoice(parsedInvoice);
  const attrs = pickFirst(invoice, ["data.attrs", "attrs"]);
  if (!Array.isArray(attrs)) {
    return null;
  }
  for (const attr of attrs) {
    if (attr && typeof attr === "object") {
      if (typeof attr.payee_public_key === "string") {
        return attr.payee_public_key;
      }
      if (typeof attr.payeePublicKey === "string") {
        return attr.payeePublicKey;
      }
    }
  }
  return null;
}

export function resolveTargetPubkey(request, parsedInvoice) {
  const invoice = normalizeParsedInvoice(parsedInvoice);
  return (
    pickFirst(
      {
        request,
        parsedInvoice: invoice
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
    ) || extractInvoicePayeePubkey(parsedInvoice)
  );
}

export function normalizeParsedInvoice(parsedInvoice) {
  if (!parsedInvoice || typeof parsedInvoice !== "object") {
    return parsedInvoice;
  }
  if (parsedInvoice.invoice && typeof parsedInvoice.invoice === "object") {
    return parsedInvoice.invoice;
  }
  return parsedInvoice;
}

export function findGraphNodeByPubkey(nodes, targetPubkey) {
  const target = String(targetPubkey).toLowerCase();
  return (
    nodes.find((node) => {
      const candidate = pickFirst(node, [
        "pubkey",
        "node_pubkey",
        "nodePubkey",
        "peer_pubkey",
        "id"
      ]);
      return (
        typeof candidate === "string" && candidate.toLowerCase() === target
      );
    }) ?? null
  );
}

export function looksLikePeerId(value) {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  return !value.startsWith("0x") && /^(Qm|12D3Koo)/.test(value);
}

export function isOpenChannel(channel) {
  const raw = String(
    pickFirst(channel, [
      "state.state_name",
      "state.stateName",
      "state",
      "status"
    ]) || ""
  ).toLowerCase();
  return OPEN_CHANNEL_KEYWORDS.some((keyword) => raw.includes(keyword));
}

export function sumBigInts(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0n);
}

export function addReference(store, key) {
  if (DOCS[key]) {
    store.set(key, DOCS[key]);
  }
}

export function pushUnique(list, value) {
  if (!list.includes(value)) {
    list.push(value);
  }
}

export function formatAmount(value) {
  if (value === null) {
    return "Unknown";
  }
  const normalized = toBigIntOrNull(value);
  if (normalized === null) {
    return String(value);
  }
  const isNegative = normalized < 0n;
  const digits = (isNegative ? -normalized : normalized).toString();
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return isNegative ? `-${formatted}` : formatted;
}

export function normalizeLabel(value) {
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

export function pickFirst(source, paths) {
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

export function extractNumber(source, paths) {
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

export function toBigIntOrNull(value) {
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

export function toRpcHex(value) {
  return `0x${BigInt(value).toString(16)}`;
}

export function trimOrEmpty(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function pickDefined(source) {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value)
  );
}

export function deriveRouteProbeInput(request, parsedInvoice) {
  const amount = resolveRequestedAmount(request, parsedInvoice);
  const targetPubkey = resolveTargetPubkey(request, parsedInvoice);

  return {
    targetPubkey,
    amount: amount !== null ? toRpcHex(amount) : null
  };
}

export function normalizeRouteBuild(
  routeBuild,
  request = {},
  parsedInvoice = null
) {
  const probeInput = deriveRouteProbeInput(request, parsedInvoice);
  const base = {
    attempted: false,
    supported: false,
    status: "unsupported",
    requestedAmount: probeInput.amount,
    targetPubkey: probeInput.targetPubkey,
    source: ROUTE_BUILD_METHOD_LABEL,
    blockingError: null,
    candidates: [],
    chosenCandidateId: null,
    reasoning: null
  };

  if (!routeBuild || typeof routeBuild !== "object") {
    return base;
  }

  const rawCandidates = Array.isArray(routeBuild.candidates)
    ? routeBuild.candidates
    : "result" in routeBuild || "error" in routeBuild
      ? [routeBuild]
      : [];
  const candidates = rawCandidates.map((candidate, index) =>
    normalizeRouteBuildCandidate(
      candidate,
      probeInput.amount,
      index,
      routeBuild.source || base.source
    )
  );
  const successfulCandidates = candidates.filter(
    (candidate) => candidate.status === "ready"
  );
  const chosenCandidate = selectPreferredRouteBuildCandidate(candidates);
  const blockingError =
    routeBuild.blockingError ||
    chosenCandidate?.blockingError ||
    candidates.find((candidate) => candidate.blockingError)?.blockingError ||
    null;
  const attempted =
    Boolean(routeBuild.attempted) ||
    candidates.some(
      (candidate) =>
        candidate.status === "ready" || candidate.status === "blocked"
    );
  const supported =
    routeBuild.supported !== undefined
      ? Boolean(routeBuild.supported)
      : candidates.length > 0;
  const status =
    typeof routeBuild.status === "string"
      ? routeBuild.status
      : successfulCandidates.length > 0
        ? "ready"
        : attempted && candidates.length > 0
          ? "blocked"
          : supported
            ? "skipped"
            : "unsupported";

  return {
    ...base,
    attempted,
    supported,
    status,
    requestedAmount: routeBuild.requestedAmount ?? base.requestedAmount,
    targetPubkey: routeBuild.targetPubkey || base.targetPubkey,
    source: routeBuild.source || base.source,
    blockingError,
    candidates,
    chosenCandidateId: chosenCandidate?.id || null,
    reasoning:
      routeBuild.reasoning ||
      buildRouteBuildReasoning(chosenCandidate, candidates)
  };
}

export function normalizeRouteProbe(
  routeProbe,
  request = {},
  parsedInvoice = null
) {
  const requestedAmount = deriveRouteProbeInput(request, parsedInvoice).amount;
  const base = {
    attempted: false,
    supported: false,
    status: "unsupported",
    routeFound: null,
    hops: [],
    blockingError: null,
    feeEstimate: null,
    requestedAmount,
    source: PROBE_METHOD_LABEL,
    paymentHash: null
  };

  if (!routeProbe || typeof routeProbe !== "object") {
    return base;
  }

  if (
    typeof routeProbe.status === "string" &&
    "attempted" in routeProbe &&
    "supported" in routeProbe &&
    Array.isArray(routeProbe.hops)
  ) {
    return {
      ...base,
      ...routeProbe,
      requestedAmount: routeProbe.requestedAmount ?? requestedAmount,
      hops: Array.isArray(routeProbe.hops) ? routeProbe.hops : [],
      blockingError: routeProbe.blockingError || null,
      feeEstimate: routeProbe.feeEstimate || null,
      paymentHash: routeProbe.paymentHash || null,
      source: routeProbe.source || base.source
    };
  }

  const result = routeProbe.result || null;
  const error = routeProbe.error || null;
  const hops = extractProbeHops(result);
  const paymentHash = pickFirst(result, ["payment_hash", "paymentHash"]);
  const blockingError = error?.message || null;
  const routeFound = Boolean(result) && !blockingError;
  const status = routeFound
    ? "ready"
    : blockingError
      ? "blocked"
      : routeProbe.supported
        ? "unknown"
        : "unsupported";

  return {
    attempted: Boolean(
      routeProbe.attempted ?? routeProbe.result ?? routeProbe.error
    ),
    supported: Boolean(routeProbe.supported),
    status,
    routeFound,
    hops,
    blockingError,
    feeEstimate: extractFeeEstimate(result),
    requestedAmount:
      pickFirst(routeProbe, ["request.amount", "request.amount_msat"]) ||
      requestedAmount,
    source:
      routeProbe.method === "send_payment" || routeProbe.dryRun
        ? PROBE_METHOD_LABEL
        : routeProbe.source || base.source,
    paymentHash
  };
}

function extractProbeHops(result) {
  const rawHops = pickFirst(result, [
    "route.hops",
    "router.hops",
    "router.channels",
    "payment_route.hops",
    "hops"
  ]);

  if (!Array.isArray(rawHops)) {
    return [];
  }

  return rawHops.map((hop, index) => ({
    hop: index + 1,
    channelId: pickFirst(hop, ["channel_id", "channelId", "id"]) || null,
    nodeId:
      pickFirst(hop, [
        "pubkey",
        "node_pubkey",
        "nodePubkey",
        "peer_pubkey",
        "id"
      ]) || null,
    fee:
      pickFirst(hop, ["fee", "fee_amount", "feeAmount", "amount_fee"]) || null
  }));
}

function extractFeeEstimate(result) {
  if (!result || typeof result !== "object") {
    return null;
  }

  const amount = pickFirst(result, [
    "fee",
    "fee_amount",
    "feeAmount",
    "total_fee",
    "totalFee",
    "route.total_fee",
    "router.total_fee",
    "router.fee"
  ]);
  const rate = pickFirst(result, [
    "fee_rate",
    "feeRate",
    "route.fee_rate",
    "router.fee_rate"
  ]);

  if (amount === null && rate === null) {
    return null;
  }

  return {
    amount,
    rate,
    hint:
      amount !== null
        ? `Fiber dry run reported an estimated fee near ${formatAmount(toBigIntOrNull(amount))}.`
        : null
  };
}

function normalizeRouteBuildCandidate(
  candidate,
  requestedAmount,
  index,
  defaultSource
) {
  if (
    candidate &&
    typeof candidate === "object" &&
    typeof candidate.status === "string" &&
    Array.isArray(candidate.routerHops)
  ) {
    return {
      ...candidate,
      id: candidate.id || `candidate-${index + 1}`,
      pathPubkeys: Array.isArray(candidate.pathPubkeys)
        ? candidate.pathPubkeys
        : [],
      source: candidate.source || defaultSource
    };
  }

  const result = candidate?.result || null;
  const error = candidate?.error || null;
  const routerHops = extractRouteBuildHops(result);
  const pathPubkeys = Array.isArray(candidate?.pathPubkeys)
    ? candidate.pathPubkeys
    : routerHops
        .map((hop) => hop.targetPubkey)
        .filter((value) => typeof value === "string" && value.length > 0);
  const totalAmount =
    toBigIntOrNull(
      pickFirst(result, [
        "aggregate_amount",
        "amount_to_send",
        "total_amt",
        "total_amount",
        "amount"
      ])
    ) ||
    routerHops[0]?.amountReceivedValue ||
    null;
  const finalAmount =
    routerHops[routerHops.length - 1]?.amountReceivedValue ||
    toBigIntOrNull(requestedAmount);
  const explicitFee = toBigIntOrNull(
    pickFirst(result, [
      "fee",
      "total_fee",
      "aggregate_fee",
      "total_fees",
      "total_fees_msat"
    ])
  );
  const totalFee =
    explicitFee !== null
      ? explicitFee
      : totalAmount !== null && finalAmount !== null
        ? totalAmount - finalAmount
        : null;
  const status =
    error?.message || error?.code
      ? "blocked"
      : routerHops.length > 0 || result
        ? "ready"
        : "blocked";

  return {
    id: candidate?.id || `candidate-${index + 1}`,
    source: candidate?.source || defaultSource,
    status,
    blockingError: error?.message || candidate?.blockingError || null,
    pathPubkeys,
    hopCount: routerHops.length || pathPubkeys.length,
    totalAmount:
      totalAmount !== null
        ? formatAmount(totalAmount)
        : requestedAmount || null,
    totalAmountValue: totalAmount !== null ? totalAmount.toString() : null,
    totalFee: totalFee !== null ? formatAmount(totalFee) : null,
    totalFeeValue: totalFee !== null ? totalFee.toString() : null,
    totalExpiry:
      routerHops[0]?.incomingTlcExpiry ||
      pickFirst(result, ["incoming_tlc_expiry", "total_time_lock"]) ||
      null,
    routerHops,
    rawResult: result
  };
}

function extractRouteBuildHops(result) {
  const rawHops = pickFirst(result, [
    "router_hops",
    "routerHops",
    "route.hops",
    "router.hops",
    "route_hops",
    "hops"
  ]);

  if (!Array.isArray(rawHops)) {
    return [];
  }

  return rawHops.map((hop, index) => {
    const amountReceivedValue = toBigIntOrNull(
      pickFirst(hop, [
        "amount_received",
        "amountReceived",
        "amount",
        "value",
        "value_sat"
      ])
    );

    return {
      hop: index + 1,
      targetPubkey:
        pickFirst(hop, [
          "target",
          "pubkey",
          "node_pubkey",
          "nodePubkey",
          "peer_pubkey",
          "id"
        ]) || null,
      amountReceived:
        amountReceivedValue !== null ? formatAmount(amountReceivedValue) : null,
      amountReceivedValue,
      incomingTlcExpiry: pickFirst(hop, [
        "incoming_tlc_expiry",
        "incomingTlcExpiry",
        "cltv_expiry"
      ]),
      channelId: pickFirst(hop, ["channel_id", "channelId", "prev_channel_id"]),
      fee: pickFirst(hop, ["fee", "forwarding_fee", "forwardingFee"]) || null
    };
  });
}

function selectPreferredRouteBuildCandidate(candidates) {
  const successfulCandidates = candidates.filter(
    (candidate) => candidate.status === "ready"
  );
  if (successfulCandidates.length === 0) {
    return candidates[0] || null;
  }

  return successfulCandidates.sort((left, right) => {
    const leftFee = toBigIntOrNull(left.totalFeeValue);
    const rightFee = toBigIntOrNull(right.totalFeeValue);
    if (leftFee !== null && rightFee !== null && leftFee !== rightFee) {
      return leftFee < rightFee ? -1 : 1;
    }
    if (left.hopCount !== right.hopCount) {
      return left.hopCount - right.hopCount;
    }
    return left.pathPubkeys.length - right.pathPubkeys.length;
  })[0];
}

function buildRouteBuildReasoning(chosenCandidate, candidates) {
  if (!chosenCandidate) {
    return null;
  }

  if (chosenCandidate.status !== "ready") {
    return (
      chosenCandidate.blockingError ||
      "Fiber could not build a valid constrained route from the current candidate set."
    );
  }

  const alternatives = candidates.filter(
    (candidate) =>
      candidate.id !== chosenCandidate.id && candidate.status === "ready"
  );
  if (alternatives.length === 0) {
    return `Only one constrained route candidate built successfully, so FiberOps selected the ${chosenCandidate.hopCount}-hop path as the current best route.`;
  }

  return `FiberOps selected the ${chosenCandidate.hopCount}-hop route because it has the lowest estimated fee among ${alternatives.length + 1} successfully built route candidates.`;
}

export function normalizeMultiNodeSummary(value) {
  if (!value || typeof value !== "object") {
    return {
      enabled: false,
      nodeCount: 1,
      reachableNodes: 1,
      degradedNodes: 0,
      probeReadyNodes: 0,
      probeBlockedNodes: 0,
      probeSkippedNodes: 0,
      consistentProbeStatus: true,
      bestNode: null
    };
  }

  return {
    enabled: Boolean(value.enabled),
    nodeCount: Number(value.nodeCount) || 1,
    reachableNodes: Number(value.reachableNodes) || 0,
    degradedNodes: Number(value.degradedNodes) || 0,
    probeReadyNodes: Number(value.probeReadyNodes) || 0,
    probeBlockedNodes: Number(value.probeBlockedNodes) || 0,
    probeSkippedNodes: Number(value.probeSkippedNodes) || 0,
    consistentProbeStatus: value.consistentProbeStatus !== false,
    bestNode: value.bestNode || null
  };
}

export function buildMultiNodeSummary(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return normalizeMultiNodeSummary(null);
  }

  const reachableNodes = nodes.filter((node) => !node.error).length;
  const degradedNodes = nodes.filter(
    (node) => (node.summary?.partialErrorCount || 0) > 0
  ).length;
  const probeReadyNodes = nodes.filter(
    (node) => node.probe?.status === "ready"
  ).length;
  const probeBlockedNodes = nodes.filter(
    (node) => node.probe?.status === "blocked"
  ).length;
  const probeSkippedNodes = nodes.filter(
    (node) => node.probe?.status === "skipped"
  ).length;
  const readinessSet = new Set(
    nodes
      .map((node) => node.probe?.status)
      .filter((status) => status && status !== "skipped")
  );
  const bestNode =
    nodes.find((node) => node.probe?.status === "ready") ||
    nodes.find((node) => !node.error) ||
    nodes[0];

  return {
    enabled: nodes.length > 1,
    nodeCount: nodes.length,
    reachableNodes,
    degradedNodes,
    probeReadyNodes,
    probeBlockedNodes,
    probeSkippedNodes,
    consistentProbeStatus: readinessSet.size <= 1,
    bestNode: bestNode
      ? {
          name: bestNode.name,
          endpoint: bestNode.endpoint,
          probeStatus: bestNode.probe?.status || null,
          paymentReadiness: bestNode.summary?.paymentReadiness || null
        }
      : null
  };
}

export function selectBestProbe(probes) {
  const normalized = probes
    .map((probe) => normalizeRouteProbe(probe))
    .filter(Boolean);
  return (
    normalized.find((probe) => probe.status === "ready") ||
    normalized.find((probe) => probe.status === "blocked") ||
    normalized.find((probe) => probe.supported) ||
    normalized[0] ||
    normalizeRouteProbe(null)
  );
}

export function selectBestRouteBuild(routeBuilds) {
  const normalized = routeBuilds
    .map((routeBuild) => normalizeRouteBuild(routeBuild))
    .filter(Boolean);

  return (
    normalized.find(
      (routeBuild) =>
        routeBuild.status === "ready" && routeBuild.candidates.length > 0
    ) ||
    normalized.find((routeBuild) => routeBuild.status === "blocked") ||
    normalized.find((routeBuild) => routeBuild.supported) ||
    normalized[0] ||
    normalizeRouteBuild(null)
  );
}

export function mergePartialErrors(nodes) {
  const merged = {};

  for (const node of nodes) {
    for (const [key, value] of Object.entries(node.partialErrors || {})) {
      if (!merged[key]) {
        merged[key] = value;
      }
    }
  }

  return merged;
}
