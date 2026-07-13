import {
  demoScenarios,
  getDemoScenario,
  listDemoScenarioMeta
} from "../demo-scenarios.js";
import { FiberRpcError } from "../fiber-rpc.js";
import {
  createHistoryBackend,
  getHistoryBackendStatus
} from "../history-backend.js";
import { mapWithConcurrency } from "../server/concurrency.js";

import {
  DIAGNOSIS_CAPABILITIES,
  DIAGNOSIS_CONTRACT_VERSION,
  DIAGNOSIS_OUTPUT_MODES,
  DIAGNOSIS_SCHEMA_SET,
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
import { decorateNodeResult } from "./per-node.js";
import {
  buildMultiNodeSummary,
  normalizeRouteProbe,
  pickDefined,
  trimOrEmpty
} from "./shared.js";

export async function getBootstrapData(
  defaultEndpoint = "http://127.0.0.1:8227",
  options = {}
) {
  const nodeSet = Array.isArray(options.nodeSet) ? options.nodeSet : [];
  const requestPolicy = options.requestPolicy || {};
  const historyBackend = resolveHistoryBackend(options);
  const historyStatus = await getHistoryBackendStatus(historyBackend);
  const observabilitySnapshot = options.observability?.snapshot?.() || null;

  return {
    defaultEndpoint,
    scenarios: listDemoScenarioMeta(),
    capabilities: {
      multiNodeLive: true,
      routeProbe: true,
      routeBuilder: true,
      persistence: historyStatus.configured,
      machineExports: true,
      cli: true,
      observability: true,
      historyBackendStatus: true,
      contractCompatibilityMetadata: true,
      deepRouteAnalysis: true
    },
    runtime: {
      policy: {
        liveExternalEndpointsAllowed:
          requestPolicy.allowExternalLiveEndpoints ?? false,
        insecureTokenForwardingAllowed:
          requestPolicy.allowInsecureTokenForwarding ?? false,
        routeProbeEnabled: requestPolicy.routeProbeEnabled !== false,
        maxJsonBodyBytes: requestPolicy.maxJsonBodyBytes || null,
        analysisDepths: ["standard", "deep"]
      },
      persistence: historyStatus,
      observability: {
        enabled: Boolean(options.observability?.enabled),
        requestCountersAvailable: Boolean(observabilitySnapshot),
        runCountersAvailable: Boolean(observabilitySnapshot)
      }
    },
    contracts: {
      version: DIAGNOSIS_CONTRACT_VERSION,
      schemaSet: {
        ...DIAGNOSIS_SCHEMA_SET
      },
      compatibility: {
        current: DIAGNOSIS_CONTRACT_VERSION,
        backwardCompatibleWith: [...DIAGNOSIS_SCHEMA_SET.backwardCompatibleWith]
      },
      capabilities: {
        ...DIAGNOSIS_CAPABILITIES
      },
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
  const runContext = options.runContext || {};
  const observability =
    runContext.observability || options.observability || null;
  const runStartedAt = Date.now();

  observability?.recordRunStart({
    requestId: runContext.requestId || null,
    source: mode,
    mode
  });

  try {
    const result =
      mode === "live"
        ? await analyzeLive(payload, options)
        : await analyzeDemo(payload, options);

    observability?.recordRunComplete({
      requestId: runContext.requestId || null,
      source: result.source,
      category: result.diagnosis?.category || null,
      status: "completed",
      durationMs: Date.now() - runStartedAt
    });

    return result;
  } catch (error) {
    observability?.recordRunComplete({
      requestId: runContext.requestId || null,
      source: mode,
      category: null,
      status: "failed",
      durationMs: Date.now() - runStartedAt
    });
    throw error;
  }
}

async function analyzeDemo(payload, options = {}) {
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
    scenario,
    runContext: options.runContext || {}
  });
}

async function analyzeLive(payload, options) {
  const runContext = options.runContext || {};
  const observability =
    runContext.observability || options.observability || null;
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
  observability?.recordLiveFanout({
    requestId: runContext.requestId || null,
    nodeCount: nodeSet.length,
    concurrency
  });
  const nodeSnapshots = await mapWithConcurrency(
    nodeSet,
    concurrency,
    async (nodeConfig) => analyzeLiveNode(request, payload, nodeConfig, options)
  );
  const nodes = nodeSet.map((nodeConfig, index) =>
    decorateNodeResult({
      source: "live",
      request,
      scenario: null,
      node: buildNodeResult(
        nodeConfig,
        request,
        nodeSnapshots[index],
        summarizeContext
      )
    })
  );

  const aggregate = aggregateNodeResults(nodes, request, options);

  if (aggregate.context.error && nodes.every((node) => node.error)) {
    observability?.recordAllNodesFailed({
      requestId: runContext.requestId || null,
      nodeCount: nodes.length,
      errorCode: aggregate.context.error.code || "RPC_TRANSPORT_ERROR"
    });
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
    historyBackend: resolveHistoryBackend(options),
    scenario: null,
    runContext,
    execution: buildExecutionSummary(nodes, aggregate, options)
  });
}

async function finalizeResult({
  source,
  request,
  context,
  scenario = null,
  nodes = [],
  historyBackend = null,
  runContext = {},
  execution = null
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
  const observability = runContext.observability || null;

  observability?.recordDiagnosisOutcome({
    requestId: runContext.requestId || null,
    source,
    category: diagnosis.category,
    severity: diagnosis.severity,
    readiness: summary.paymentReadiness,
    allNodesFailed: false
  });

  const result = {
    contract: {
      version: DIAGNOSIS_CONTRACT_VERSION,
      schemaSet: {
        ...DIAGNOSIS_SCHEMA_SET
      },
      compatibility: {
        current: DIAGNOSIS_CONTRACT_VERSION,
        backwardCompatibleWith: [...DIAGNOSIS_SCHEMA_SET.backwardCompatibleWith]
      },
      capabilities: {
        ...DIAGNOSIS_CAPABILITIES
      },
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
    analyzedAt: event.timestamp,
    ...(execution
      ? {
          execution,
          selectedNodeId: execution.selectedNodeId,
          aggregateStatus: execution.aggregateStatus
        }
      : {})
  };

  if (nodes.length > 0) {
    result.nodes = nodes;
  }

  if (historyBackend && source === "live") {
    const history = await buildHistoryInsights({
      historyStore: historyBackend,
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
      observability?.recordHistoryPersistence({
        requestId: runContext.requestId || null,
        success: !history.public?.error,
        backendType: historyBackend.type || "unknown",
        errorCode: history.public?.error?.code || null
      });
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
      primary: node.primary ?? index === 0,
      requested: Boolean(node.requested),
      selected: Boolean(node.selected),
      tokenSource: node.tokenSource || (node.token ? "node_config" : "none"),
      policyValidated: node.policyValidated === true
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
      primary: true,
      requested: Boolean(payload.endpoint),
      selected: true,
      tokenSource: payload.token ? "request" : "none",
      policyValidated: false
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

function resolveHistoryBackend(options) {
  return createHistoryBackend(options);
}

function buildExecutionSummary(nodes, aggregate, options) {
  const executionPlan = options.executionPlan || null;

  return {
    scope:
      executionPlan?.scope ||
      (nodes.length > 1 ? "configured_node_set" : "single_node"),
    selectedNodeId:
      aggregate.selectedNode?.id ||
      executionPlan?.selectedNodeId ||
      nodes[0]?.id ||
      null,
    aggregateStatus:
      aggregate.aggregateStatus || (nodes.length > 1 ? "mixed" : "single_node"),
    analysisDepth: options.analysisDepth || "standard",
    nodes: nodes.map((node) => ({
      id: node.id,
      name: node.name,
      endpoint: node.endpoint,
      primary: Boolean(node.primary),
      requested: Boolean(node.requested),
      selected: Boolean(node.selected),
      probeEnabled: node.probeEnabled !== false,
      tokenSource: node.tokenSource || "none",
      policyValidated: node.policyValidated === true,
      diagnosis: node.diagnosis
        ? {
            category: node.diagnosis.category,
            severity: node.diagnosis.severity,
            headline: node.diagnosis.headline
          }
        : null,
      summary: node.summary
        ? {
            paymentReadiness: node.summary.paymentReadiness,
            targetVisibility: node.summary.targetVisibility,
            estimatedOutbound: node.summary.estimatedOutbound
          }
        : null,
      routeStatus: node.routePreview?.status || null,
      routeEvidenceMode: node.routePreview?.evidenceMode || null,
      error: node.error
    }))
  };
}

export function getDiagnosticsContract() {
  return getContractBundle();
}

export async function getRuntimeStatus(options = {}) {
  const historyBackend = resolveHistoryBackend(options);
  return {
    history: await getHistoryBackendStatus(historyBackend),
    observability: options.observability?.snapshot?.() || null
  };
}
