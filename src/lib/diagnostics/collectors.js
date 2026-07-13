import { FiberRpcClient, isMethodNotFoundError } from "../fiber-rpc.js";

import {
  PROBE_METHOD_LABEL,
  ROUTE_BUILD_METHOD_LABEL,
  buildMultiNodeSummary,
  deriveRouteProbePlan,
  deriveRouteProbeInput,
  extractGraphChannels,
  mergePartialErrors,
  normalizeRouteBuild,
  normalizeRouteProbe,
  pickFirst,
  resolveTargetPubkey,
  selectBestRouteBuild,
  selectBestProbe,
  serializeError
} from "./shared.js";
import { buildAggregateStatus, selectAggregateNode } from "./per-node.js";

export async function analyzeLiveNode(
  request,
  payload,
  nodeConfig,
  options = {}
) {
  const endpoint = nodeConfig.endpoint;
  const token = nodeConfig.token || "";
  const context = {
    endpoint,
    partialErrors: {}
  };
  const client = new FiberRpcClient({
    endpoint,
    token,
    timeoutMs:
      Number(nodeConfig.timeoutMs ?? payload.timeoutMs) > 0
        ? Number(nodeConfig.timeoutMs ?? payload.timeoutMs)
        : undefined
  });

  try {
    context.nodeInfo = await client.getNodeInfo({ signal: options.signal });
  } catch (error) {
    context.error = serializeError(error);
    return context;
  }

  await captureClientCall(context, "channels", () =>
    client.listChannels({}, { signal: options.signal })
  );

  if (request.invoice) {
    await captureClientCall(context, "parsedInvoice", () =>
      client.parseInvoice(request.invoice, { signal: options.signal })
    );
  }

  const targetPubkey = resolveTargetPubkey(request, context.parsedInvoice);
  if (targetPubkey) {
    await captureClientCall(context, "graphNodes", () =>
      client.graphNodes({}, { signal: options.signal })
    );
    if (options.analysisDepth === "deep") {
      await captureClientCall(context, "graphChannels", () =>
        client.graphChannels({ limit: 500 }, { signal: options.signal })
      );
    }
  }

  if (request.paymentHash) {
    await captureClientCall(context, "payment", () =>
      client.getPayment(request.paymentHash, { signal: options.signal })
    );
  }

  if (
    !request.paymentHash &&
    nodeConfig.probe !== false &&
    options.routeProbeEnabled !== false
  ) {
    if (options.analysisDepth === "deep") {
      await captureRouteBuild(context, client, request, options);
    }
    await captureRouteProbe(context, client, request, options);
  } else if (!request.paymentHash) {
    context.routeProbe = normalizeRouteProbe(
      {
        attempted: false,
        supported: true,
        status: "skipped",
        routeFound: null,
        hops: [],
        blockingError: null,
        feeEstimate: null,
        requestedAmount: deriveRouteProbeInput(request, context.parsedInvoice)
          .amount,
        source: PROBE_METHOD_LABEL,
        reason: "probe_disabled"
      },
      request,
      context.parsedInvoice
    );
    context.routeBuild = normalizeRouteBuild(
      {
        supported: false,
        attempted: false,
        status: "skipped",
        source: ROUTE_BUILD_METHOD_LABEL
      },
      request,
      context.parsedInvoice
    );
  }

  return context;
}

export function buildNodeResult(
  nodeConfig,
  request,
  context,
  summarizeContext
) {
  const summary = summarizeContext(context, {
    ...request,
    endpoint: nodeConfig.endpoint
  });
  const probe = normalizeRouteProbe(
    context.routeProbe,
    request,
    context.parsedInvoice
  );
  const routeBuild = normalizeRouteBuild(
    context.routeBuild,
    request,
    context.parsedInvoice
  );

  return {
    name:
      nodeConfig.name ||
      nodeConfig.label ||
      nodeConfig.id ||
      nodeConfig.endpoint,
    id: nodeConfig.id || nodeConfig.endpoint,
    endpoint: nodeConfig.endpoint,
    primary: Boolean(nodeConfig.primary),
    requested: Boolean(nodeConfig.requested),
    selected: Boolean(nodeConfig.selected),
    probeEnabled: nodeConfig.probe !== false,
    tokenSource:
      nodeConfig.tokenSource || (nodeConfig.token ? "node_config" : "none"),
    policyValidated: nodeConfig.policyValidated === true,
    error: context.error || null,
    partialErrors: context.partialErrors || {},
    summary,
    probe,
    routeBuild,
    context
  };
}

export function aggregateNodeResults(nodes, request, options) {
  const selectedNode = selectAggregateNode(nodes, {
    selectedNodeId: options.executionPlan?.selectedNodeId || null
  });
  const aggregatePartialErrors = mergePartialErrors(nodes);
  const aggregateMultiNode = buildMultiNodeSummary(nodes);
  const requestEndpoint =
    selectedNode?.endpoint || options.defaultEndpoint || null;
  const aggregateStatus = buildAggregateStatus(nodes);

  if (!selectedNode) {
    return {
      requestEndpoint,
      selectedNode: null,
      aggregateStatus,
      context: {
        endpoint: requestEndpoint,
        partialErrors: {},
        multiNode: aggregateMultiNode,
        routeProbe: selectBestProbe(nodes.map((node) => node.probe)),
        routeBuild: selectBestRouteBuild(
          nodes.map((node) => node.routeBuild || node.context?.routeBuild)
        )
      }
    };
  }

  const context = {
    ...selectedNode.context,
    endpoint: requestEndpoint,
    partialErrors: aggregatePartialErrors,
    routeProbe: selectedNode.probe || selectedNode.context?.routeProbe || null,
    routeBuild:
      selectedNode.routeBuild || selectedNode.context?.routeBuild || null,
    multiNode: aggregateMultiNode
  };

  if (!context.error) {
    const fatalErrors = nodes.map((node) => node.error).filter(Boolean);
    if (fatalErrors.length === nodes.length && fatalErrors.length > 0) {
      context.error = fatalErrors[0];
    }
  }

  return {
    requestEndpoint,
    selectedNode,
    aggregateStatus,
    context
  };
}

async function captureClientCall(context, key, operation) {
  try {
    context[key] = await operation();
  } catch (error) {
    context.partialErrors[key] = serializeError(error);
  }
}

async function captureRouteProbe(context, client, request, options = {}) {
  const probePlan = deriveRouteProbePlan(request, context.parsedInvoice);
  const nodePubkey =
    context.nodeInfo?.pubkey ||
    context.nodeInfo?.node_id ||
    context.nodeInfo?.nodeId ||
    null;

  if (!probePlan.request) {
    context.routeProbe = normalizeRouteProbe(
      {
        supported: false,
        attempted: false,
        status: "skipped",
        routeFound: null,
        hops: [],
        blockingError: null,
        feeEstimate: null,
        requestedAmount: probePlan.amount,
        source: PROBE_METHOD_LABEL,
        reason: "missing_probe_inputs",
        evidenceMode: probePlan.evidenceMode
      },
      request,
      context.parsedInvoice
    );
    return;
  }

  if (
    nodePubkey &&
    probePlan.targetPubkey &&
    String(nodePubkey).toLowerCase() ===
      String(probePlan.targetPubkey).toLowerCase()
  ) {
    context.routeProbe = normalizeRouteProbe(
      {
        supported: true,
        attempted: false,
        status: "skipped",
        routeFound: null,
        hops: [],
        blockingError: null,
        feeEstimate: null,
        requestedAmount: probePlan.amount,
        source: PROBE_METHOD_LABEL,
        reason: "self_target_probe_skipped",
        evidenceMode: probePlan.evidenceMode
      },
      request,
      context.parsedInvoice
    );
    return;
  }

  try {
    const result = await client.probeRoute(probePlan.request, {
      signal: options.signal
    });
    context.routeBuildSupport = true;
    context.routeProbe = normalizeRouteProbe(
      {
        supported: true,
        attempted: true,
        mode: "rpc",
        method: "send_payment",
        dryRun: true,
        request: normalizeProbeRpcRequest(probePlan),
        evidenceMode: probePlan.evidenceMode,
        result
      },
      request,
      context.parsedInvoice
    );
  } catch (error) {
    context.routeBuildSupport = true;
    context.routeProbe = normalizeRouteProbe(
      {
        supported: true,
        attempted: true,
        mode: "rpc",
        method: "send_payment",
        dryRun: true,
        request: normalizeProbeRpcRequest(probePlan),
        evidenceMode: probePlan.evidenceMode,
        error: serializeError(error)
      },
      request,
      context.parsedInvoice
    );
  }
}

function normalizeProbeRpcRequest(probePlan) {
  if (!probePlan?.request) {
    return {};
  }

  if (probePlan.strategy === "invoice") {
    return {
      invoice: probePlan.request.invoice,
      dry_run: true
    };
  }

  return {
    target_pubkey: probePlan.request.targetPubkey,
    amount: probePlan.request.amount,
    keysend: probePlan.request.keysend === true,
    dry_run: true
  };
}

async function captureRouteBuild(context, client, request, options = {}) {
  const probeInput = deriveRouteProbeInput(request, context.parsedInvoice);
  const nodePubkey =
    context.nodeInfo?.pubkey ||
    context.nodeInfo?.node_id ||
    context.nodeInfo?.nodeId ||
    null;
  const routeCandidates = buildRouteCandidates(context, nodePubkey, probeInput);

  if (
    !probeInput.targetPubkey ||
    !probeInput.amount ||
    routeCandidates.length === 0
  ) {
    context.routeBuild = normalizeRouteBuild(
      {
        supported: false,
        attempted: false,
        status: "skipped",
        source: ROUTE_BUILD_METHOD_LABEL
      },
      request,
      context.parsedInvoice
    );
    return;
  }

  const candidates = [];
  let unsupported = false;
  let encodingError = null;

  for (const candidate of routeCandidates) {
    try {
      const result = await attemptBuildRouterCandidate(
        client,
        candidate.pathPubkeys,
        probeInput.amount,
        options
      );
      candidates.push({
        id: candidate.id,
        pathPubkeys: candidate.pathPubkeys,
        result
      });
    } catch (error) {
      if (isMethodNotFoundError(error)) {
        unsupported = true;
        break;
      }
      if (isUnsupportedHopsEncodingError(error)) {
        unsupported = true;
        encodingError = error;
        break;
      }
      candidates.push({
        id: candidate.id,
        pathPubkeys: candidate.pathPubkeys,
        error: serializeError(error)
      });
    }
  }

  context.routeBuild = normalizeRouteBuild(
    unsupported
      ? {
          supported: false,
          attempted: Boolean(encodingError),
          status: "unsupported",
          source: ROUTE_BUILD_METHOD_LABEL,
          blockingError: encodingError?.message || null,
          candidates
        }
      : {
          supported: true,
          attempted: true,
          status: candidates.some((candidate) => candidate.result)
            ? "ready"
            : "blocked",
          source: ROUTE_BUILD_METHOD_LABEL,
          candidates
        },
    request,
    context.parsedInvoice
  );
}

async function attemptBuildRouterCandidate(
  client,
  pathPubkeys,
  amount,
  options = {}
) {
  const hopsInfoVariants = [
    pathPubkeys.map((pubkey) => [pubkey, null]),
    pathPubkeys.map((pubkey) => ({ pubkey })),
    pathPubkeys
  ];
  let lastInvalidEncodingError = null;

  for (const hopsInfo of hopsInfoVariants) {
    try {
      return await client.buildRouter(
        {
          amount,
          hopsInfo
        },
        { signal: options.signal }
      );
    } catch (error) {
      if (isUnsupportedHopsEncodingError(error)) {
        lastInvalidEncodingError = error;
        continue;
      }
      throw error;
    }
  }

  throw (
    lastInvalidEncodingError ||
    new Error("Unable to encode build_router hops_info.")
  );
}

function buildRouteCandidates(context, sourcePubkey, probeInput) {
  const targetPubkey = probeInput.targetPubkey;
  if (!targetPubkey) {
    return [];
  }

  const candidates = [
    {
      id: "route-direct",
      pathPubkeys: [targetPubkey]
    }
  ];
  const channels = extractGraphChannels(context.graphChannels);
  if (!sourcePubkey || channels.length === 0) {
    return candidates;
  }

  const adjacency = buildChannelAdjacency(channels);
  const queue = [[sourcePubkey, []]];
  const seen = new Set([sourcePubkey]);
  const discovered = [];
  const maxPathLength = 4;

  while (queue.length > 0 && discovered.length < 5) {
    const [currentPubkey, path] = queue.shift();
    const neighbors = adjacency.get(currentPubkey) || [];
    for (const neighbor of neighbors) {
      if (path.includes(neighbor) || neighbor === sourcePubkey) {
        continue;
      }
      const nextPath = [...path, neighbor];
      if (nextPath.length > maxPathLength) {
        continue;
      }
      if (neighbor === targetPubkey) {
        discovered.push(nextPath);
        continue;
      }
      const key = nextPath.join(">");
      if (!seen.has(key)) {
        seen.add(key);
        queue.push([neighbor, nextPath]);
      }
    }
  }

  for (const pathPubkeys of discovered) {
    const key = pathPubkeys.join(">");
    if (
      !candidates.some((candidate) => candidate.pathPubkeys.join(">") === key)
    ) {
      candidates.push({
        id: `route-${candidates.length + 1}`,
        pathPubkeys
      });
    }
  }

  return candidates.slice(0, 5);
}

function buildChannelAdjacency(channels) {
  const adjacency = new Map();

  for (const channel of channels) {
    const peers = extractChannelPeers(channel);
    if (!peers) {
      continue;
    }

    const [left, right] = peers;
    if (!adjacency.has(left)) {
      adjacency.set(left, new Set());
    }
    if (!adjacency.has(right)) {
      adjacency.set(right, new Set());
    }
    adjacency.get(left).add(right);
    adjacency.get(right).add(left);
  }

  return new Map(
    [...adjacency.entries()].map(([pubkey, peers]) => [pubkey, [...peers]])
  );
}

function extractChannelPeers(channel) {
  const left = pickFirst(channel, [
    "node1",
    "node_1",
    "source",
    "source_pubkey",
    "node1_pubkey",
    "channel_update.node1"
  ]);
  const right = pickFirst(channel, [
    "node2",
    "node_2",
    "target",
    "target_pubkey",
    "node2_pubkey",
    "channel_update.node2"
  ]);

  if (
    typeof left !== "string" ||
    left.length === 0 ||
    typeof right !== "string" ||
    right.length === 0
  ) {
    return null;
  }

  return [left, right];
}

function isUnsupportedHopsEncodingError(error) {
  return (
    error?.code === -32602 ||
    /invalid params/i.test(error?.message ?? "") ||
    /invalid hops_info/i.test(error?.message ?? "") ||
    /invalid router/i.test(error?.message ?? "")
  );
}
