import {
  demoScenarios,
  getDemoScenario,
  listDemoScenarioMeta
} from "../demo-scenarios.js";
import { FiberRpcError } from "../fiber-rpc.js";
import { HistoryStore } from "../history-store.js";
import { mapWithConcurrency } from "../server/concurrency.js";

import {
  DIAGNOSIS_CONTRACT_VERSION,
  DIAGNOSIS_OUTPUT_MODES,
  getContractBundle
} from "./contracts.js";
import {
  augmentDiagnosisWithHistory,
  buildAlerts,
  buildDiagnosis,
  buildEventEnvelope,
  buildHistoryInsights,
  buildRoutePreview,
  summarizeContext
} from "./engine.js";
import {
  aggregateNodeResults,
  analyzeLiveNode,
  buildNodeResult
} from "./collectors.js";
import {
  buildMultiNodeSummary,
  normalizeRouteProbe,
  pickDefined,
  trimOrEmpty
} from "./shared.js";

export function getBootstrapData(
  defaultEndpoint = "http://127.0.0.1:8227",
  options = {}
) {
  const nodeSet = Array.isArray(options.nodeSet) ? options.nodeSet : [];
  const requestPolicy = options.requestPolicy || {};
  const persistenceConfigured = Boolean(
    options.historyPath || options.historyStore
  );

  return {
    defaultEndpoint,
    scenarios: listDemoScenarioMeta(),
    capabilities: {
      multiNodeLive: true,
      routeProbe: true,
      routeBuilder: true,
      persistence: persistenceConfigured,
      machineExports: true,
      cli: true
    },
    runtime: {
      policy: {
        liveExternalEndpointsAllowed:
          requestPolicy.allowExternalLiveEndpoints ?? false,
        insecureTokenForwardingAllowed:
          requestPolicy.allowInsecureTokenForwarding ?? false,
        routeProbeEnabled: requestPolicy.routeProbeEnabled !== false,
        maxJsonBodyBytes: requestPolicy.maxJsonBodyBytes || null
      },
      persistence: {
        configured: persistenceConfigured,
        enabled: persistenceConfigured,
        degraded: false
      }
    },
    contracts: {
      version: DIAGNOSIS_CONTRACT_VERSION,
      outputModes: [...DIAGNOSIS_OUTPUT_MODES],
      schemaNames: ["request", "result", "exports", "rules"]
    },
    integrations: ["operator", "backend", "wallet"],
    nodeSet: nodeSet.map((node, index) => ({
      id: node.id || `node-${index + 1}`,
      name: node.name || node.label || node.endpoint || `Node ${index + 1}`,
      endpoint: node.endpoint || defaultEndpoint,
      primary: Boolean(node.primary)
    }))
  };
}

export async function runDiagnosis(payload = {}, options = {}) {
  const mode = payload.mode === "live" ? "live" : "demo";
  if (mode === "live") {
    return analyzeLive(payload, options);
  }
  return analyzeDemo(payload, options);
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
  const request = {
    ...pickDefined({
      invoice: trimOrEmpty(payload.invoice),
      paymentHash: trimOrEmpty(payload.paymentHash),
      amount: trimOrEmpty(payload.amount),
      targetPubkey: trimOrEmpty(payload.targetPubkey)
    })
  };
  const nodeSet = resolveNodeSet(payload, options);
  const concurrency = resolveLiveConcurrency(nodeSet, options);
  const nodeSnapshots = await mapWithConcurrency(
    nodeSet,
    concurrency,
    async (nodeConfig) => analyzeLiveNode(request, payload, nodeConfig, options)
  );
  const nodes = nodeSet.map((nodeConfig, index) =>
    buildNodeResult(nodeConfig, request, nodeSnapshots[index], summarizeContext)
  );

  const aggregate = aggregateNodeResults(nodes, request, options);

  if (aggregate.context.error && nodes.every((node) => node.error)) {
    throw new FiberRpcError(
      aggregate.context.error.message || "Fiber RPC request failed.",
      {
        code: aggregate.context.error.code || "RPC_TRANSPORT_ERROR",
        method: aggregate.context.error.method || null,
        endpoint: aggregate.context.error.endpoint || aggregate.requestEndpoint,
        status: aggregate.context.error.status || null,
        details: {
          nodeCount: nodes.length,
          allNodesFailed: true,
          cause: aggregate.context.error.details || null
        }
      }
    );
  }

  return finalizeResult({
    source: "live",
    request: {
      ...request,
      endpoint: aggregate.requestEndpoint
    },
    context: aggregate.context,
    nodes,
    historyStore: resolveHistoryStore(options),
    scenario: null
  });
}

async function finalizeResult({
  source,
  request,
  context,
  scenario = null,
  nodes = [],
  historyStore = null
}) {
  const multiNodeSummary = buildMultiNodeSummary(nodes);
  const aggregateContext = {
    ...context,
    routeProbe: context.routeProbe
      ? normalizeRouteProbe(context.routeProbe, request, context.parsedInvoice)
      : null,
    multiNode: multiNodeSummary
  };
  const diagnosis = buildDiagnosis({
    source,
    request,
    context: aggregateContext,
    scenario
  });
  const summary = summarizeContext(aggregateContext, request, nodes);
  const routePreview = buildRoutePreview({
    request,
    context: aggregateContext,
    diagnosis,
    summary
  });
  const alerts = buildAlerts({
    request,
    context: aggregateContext,
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

  const result = {
    contract: {
      version: DIAGNOSIS_CONTRACT_VERSION,
      defaultOutputMode: "full",
      outputModes: [...DIAGNOSIS_OUTPUT_MODES]
    },
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

  if (nodes.length > 0) {
    result.nodes = nodes;
  }

  if (historyStore && source === "live") {
    const history = await buildHistoryInsights({
      historyStore,
      event,
      request,
      summary,
      diagnosis,
      routePreview,
      nodes
    });

    if (history) {
      result.history = history.public;
      augmentDiagnosisWithHistory(result.diagnosis, history);
    }
  }

  return result;
}

function resolveNodeSet(payload, options) {
  if (Array.isArray(options.nodeSet) && options.nodeSet.length > 0) {
    return options.nodeSet.map((node, index) => ({
      id: node.id || `node-${index + 1}`,
      name:
        node.name ||
        node.label ||
        node.id ||
        node.endpoint ||
        `Node ${index + 1}`,
      endpoint: (
        node.endpoint ||
        payload.endpoint ||
        options.defaultEndpoint ||
        "http://127.0.0.1:8227"
      ).trim(),
      token:
        typeof node.token === "string"
          ? node.token.trim()
          : trimOrEmpty(payload.token),
      timeoutMs: node.timeoutMs,
      probe: node.probe,
      primary: node.primary ?? index === 0
    }));
  }

  return [
    {
      id: "node-1",
      name: "Primary node",
      endpoint:
        payload.endpoint?.trim() ||
        options.defaultEndpoint ||
        "http://127.0.0.1:8227",
      token: trimOrEmpty(payload.token),
      timeoutMs: payload.timeoutMs,
      probe: true,
      primary: true
    }
  ];
}

function resolveLiveConcurrency(nodeSet, options) {
  const configured = Number(options.liveConcurrency);
  if (Number.isInteger(configured) && configured > 0) {
    return configured;
  }
  return Math.min(Math.max(nodeSet.length, 1), 4);
}

function resolveHistoryStore(options) {
  if (options.historyStore) {
    return options.historyStore;
  }
  if (options.historyPath) {
    return new HistoryStore({ filePath: options.historyPath });
  }
  return null;
}

export function getDiagnosticsContract() {
  return getContractBundle();
}
