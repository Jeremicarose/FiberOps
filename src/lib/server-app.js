import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatDiagnosisOutput,
  getBootstrapData,
  getContractBundle,
  getRuleCatalog,
  runDiagnosis,
  validateDiagnosisRequest
} from "./diagnostics.js";
import { FiberRpcError } from "./fiber-rpc.js";
import {
  REQUEST_POLICY_ERROR_CODES,
  RequestPolicyError,
  createRequestAbortSignal,
  createRequestPolicy,
  readJsonBody,
  requireJsonContentType,
  validateLiveEndpointPolicy
} from "./server/request-policy.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..", "..");

const BUNDLED_LAB = {
  successPaymentHash:
    "0x729f0879b24702a9226ebb35bbcbbbdcca0eb859addc62da1f121dc1c20df209",
  failurePaymentHash:
    "0x7bfb24cba169ec57a1743d4b0ed35b522a4dfbd5d9d04626aef866d82d9cd845",
  channelId:
    "0x9c87857dedd1065732f27338ed92ea2eb02c079f29ce43e599129884595bf753",
  nodePubkeys: [
    "02942f9602e5afe0287879b829306d35804c8a2d28ace1d8248b553f580850d696",
    "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
  ]
};

export function createFiberOpsConfig(overrides = {}) {
  const publicDir = overrides.publicDir || path.join(projectRoot, "public");
  const runtimeDir =
    overrides.runtimeDir ||
    process.env.FIBEROPS_RUNTIME_DIR ||
    path.join(projectRoot, "runtime");
  const defaultEndpoint =
    overrides.defaultEndpoint ||
    process.env.FIBER_RPC_URL ||
    "http://127.0.0.1:8227";
  const node2Endpoint =
    overrides.node2Endpoint ||
    process.env.FIBER_RPC_URL_NODE2 ||
    "http://127.0.0.1:8237";
  const usingBundledLab = shouldUseBundledLab(
    overrides,
    defaultEndpoint,
    node2Endpoint
  );
  const nodeSet = resolveConfiguredNodeSet({
    overrides,
    defaultEndpoint,
    node2Endpoint,
    usingBundledLab
  });

  const historyPath =
    overrides.historyPath !== undefined
      ? overrides.historyPath
      : process.env.FIBEROPS_HISTORY_PATH
        ? process.env.FIBEROPS_HISTORY_PATH
        : null;
  const environmentFacts = buildEnvironmentFacts({
    overrides,
    nodeSet,
    usingBundledLab
  });
  const requestPolicy = createRequestPolicy({
    maxJsonBodyBytes:
      overrides.maxJsonBodyBytes || process.env.FIBEROPS_MAX_JSON_BODY_BYTES,
    allowExternalLiveEndpoints:
      overrides.allowExternalLiveEndpoints ??
      parseBooleanEnv(process.env.FIBEROPS_ALLOW_EXTERNAL_LIVE_ENDPOINTS),
    allowInsecureTokenForwarding:
      overrides.allowInsecureTokenForwarding ??
      parseBooleanEnv(process.env.FIBEROPS_ALLOW_INSECURE_TOKEN_FORWARDING),
    routeProbeEnabled:
      overrides.routeProbeEnabled ??
      !isFalseEnv(process.env.FIBEROPS_ROUTE_PROBE_ENABLED)
  });

  return {
    host: overrides.host || process.env.HOST || "127.0.0.1",
    port: Number(overrides.port || process.env.PORT || 3000),
    publicDir,
    runtimeDir,
    historyPath,
    defaultEndpoint,
    node2Endpoint,
    nodeSet,
    environmentFacts,
    requestPolicy
  };
}

export function createFiberOpsServer(config = createFiberOpsConfig()) {
  return createServer((request, response) =>
    handleFiberOpsRequest(request, response, config)
  );
}

export async function handleFiberOpsRequest(
  request,
  response,
  config = createFiberOpsConfig()
) {
  try {
    const url = new URL(request.url || "/", "http://fiberops.local");
    const route = url.pathname || "/";

    if (request.method === "GET" && url.pathname === "/api/bootstrap") {
      return sendJson(
        response,
        200,
        successEnvelope(await buildBootstrapPayload(config), {
          route: "/api/bootstrap"
        })
      );
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/contracts/diagnose"
    ) {
      const contractBundle = getContractBundle();
      return sendJson(
        response,
        200,
        successEnvelope(
          {
            ...contractBundle,
            rules: getRuleCatalog()
          },
          {
            route: "/api/contracts/diagnose"
          }
        )
      );
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/contracts/diagnose/request"
    ) {
      return sendJson(
        response,
        200,
        successEnvelope(getContractBundle().schemas.request, {
          route: "/api/contracts/diagnose/request"
        })
      );
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/contracts/diagnose/result"
    ) {
      return sendJson(
        response,
        200,
        successEnvelope(getContractBundle().schemas.result, {
          route: "/api/contracts/diagnose/result"
        })
      );
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/contracts/diagnose/rules"
    ) {
      return sendJson(
        response,
        200,
        successEnvelope(
          {
            version: getContractBundle().version,
            rules: getRuleCatalog()
          },
          {
            route: "/api/contracts/diagnose/rules"
          }
        )
      );
    }

    if (request.method === "POST" && url.pathname === "/api/diagnose") {
      requireJsonContentType(request);
      const rawPayload = await readJsonBody(request, {
        maxBytes: config.requestPolicy?.maxJsonBodyBytes
      });
      const validation = validateDiagnosisRequest({
        ...rawPayload,
        outputMode:
          rawPayload.outputMode || url.searchParams.get("output") || undefined
      });

      if (!validation.ok) {
        return sendJson(
          response,
          400,
          errorEnvelope(
            "INVALID_REQUEST",
            "Invalid diagnosis request.",
            {
              details: validation.errors,
              contractVersion: getContractBundle().version
            },
            {
              route
            }
          )
        );
      }

      const payload = validation.value;
      if (payload.mode === "live") {
        validateLiveEndpointPolicy(payload, config.requestPolicy || {}, {
          defaultEndpoint: config.defaultEndpoint
        });
      }
      const result = await runDiagnosis(payload, {
        defaultEndpoint: config.defaultEndpoint,
        nodeSet: getConfiguredNodeSet(config),
        historyPath: config.historyPath,
        routeProbeEnabled: config.requestPolicy?.routeProbeEnabled !== false,
        signal: createRequestAbortSignal(request),
        endpointPolicy: config.requestPolicy
      });
      return sendJson(
        response,
        200,
        successEnvelope(formatDiagnosisOutput(result, payload.outputMode), {
          route,
          outputMode: payload.outputMode
        })
      );
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      return sendJson(
        response,
        200,
        successEnvelope(
          {
            service: "fiberops",
            defaultEndpoint: config.defaultEndpoint,
            historyPersistence: Boolean(config.historyPath),
            policy: {
              allowExternalLiveEndpoints:
                config.requestPolicy?.allowExternalLiveEndpoints ?? false,
              allowInsecureTokenForwarding:
                config.requestPolicy?.allowInsecureTokenForwarding ?? false,
              routeProbeEnabled:
                config.requestPolicy?.routeProbeEnabled !== false,
              maxJsonBodyBytes: config.requestPolicy?.maxJsonBodyBytes || null
            }
          },
          {
            route: "/api/health"
          }
        )
      );
    }

    if (request.method === "GET") {
      return sendStatic(url.pathname || "/", response, config.publicDir);
    }

    sendJson(
      response,
      405,
      errorEnvelope("METHOD_NOT_ALLOWED", "Method not allowed.", null, {
        route: url.pathname
      })
    );
  } catch (error) {
    const route = (() => {
      try {
        return (
          new URL(request.url || "/", "http://fiberops.local").pathname || "/"
        );
      } catch {
        return "/";
      }
    })();
    const failure = classifyServerError(error, route);
    sendJson(
      response,
      failure.statusCode,
      errorEnvelope(
        failure.code,
        failure.message,
        failure.details,
        failure.meta
      )
    );
  }
}

export async function buildBootstrapPayload(config = createFiberOpsConfig()) {
  await mkdir(config.runtimeDir, { recursive: true });
  const base = getBootstrapData(config.defaultEndpoint, {
    historyPath: config.historyPath,
    nodeSet: getConfiguredNodeSet(config),
    requestPolicy: config.requestPolicy
  });
  const livePresets = await getLivePresets(config);

  return {
    ...base,
    contracts: {
      ...base.contracts,
      endpoints: {
        bundle: "/api/contracts/diagnose",
        request: "/api/contracts/diagnose/request",
        result: "/api/contracts/diagnose/result",
        rules: "/api/contracts/diagnose/rules"
      }
    },
    livePresets,
    liveStory: getLiveStory(livePresets),
    environmentFacts: config.environmentFacts
  };
}

export function getConfiguredNodeSet(config = createFiberOpsConfig()) {
  return (config.nodeSet || []).map((node, index) => ({
    id: node.id || `node${index + 1}`,
    name: node.name || node.label || `node${index + 1}`,
    endpoint: node.endpoint,
    ...(node.pubkey ? { pubkey: node.pubkey } : {}),
    ...(node.token ? { token: node.token } : {}),
    ...(node.timeoutMs ? { timeoutMs: node.timeoutMs } : {}),
    primary: node.primary ?? index === 0,
    probe: node.probe !== false
  }));
}

export function getLocalLabNodeSet(config = createFiberOpsConfig()) {
  return getConfiguredNodeSet(config);
}

async function getLivePresets(config) {
  const nodeSet = getConfiguredNodeSet(config);
  const primaryNode =
    nodeSet.find((node) => node.primary) || nodeSet[0] || null;
  const knownPayments = config.environmentFacts?.knownPayments || {};
  const presets = [];

  for (const node of nodeSet) {
    presets.push({
      id: `${node.id}-state`,
      label: "Inspect Node",
      title: `${humanizeToken(node.name)} readiness snapshot`,
      description:
        "Loads this sender or receiver endpoint so you can inspect live channel readiness, route proof, and partial RPC failures from that node perspective.",
      payload: {
        mode: "live",
        endpoint: node.endpoint
      }
    });
  }

  if (primaryNode && knownPayments.success) {
    presets.push({
      id: `${primaryNode.id}-success-payment`,
      label: "Run Success",
      title: "Known-good payment baseline",
      description:
        "Loads a real successful payment hash from the primary node so you can compare healthy route conditions against later failures.",
      payload: {
        mode: "live",
        endpoint: primaryNode.endpoint,
        paymentHash: knownPayments.success
      }
    });
  }

  if (primaryNode && knownPayments.failure) {
    presets.push({
      id: `${primaryNode.id}-failure-payment`,
      label: "Run Failure",
      title: "Recorded payment failure",
      description:
        "Loads a real failed payment hash from the primary node and translates the recorded Fiber error into an operator diagnosis.",
      payload: {
        mode: "live",
        endpoint: primaryNode.endpoint,
        paymentHash: knownPayments.failure
      }
    });
  }

  for (const node of nodeSet) {
    const latestInvoice = await tryReadJson(
      path.join(config.runtimeDir, node.id, "latest-invoice.json")
    );
    if (latestInvoice?.invoice_address) {
      presets.push({
        id: `${node.id}-latest-invoice`,
        label: "Run Preflight",
        title: `${humanizeToken(node.name)} invoice preflight`,
        description:
          "Loads a live invoice and runs a real route-readiness check before any payment send occurs.",
        payload: {
          mode: "live",
          endpoint: primaryNode?.endpoint || node.endpoint,
          invoice: latestInvoice.invoice_address
        }
      });
    }

    const tooBigInvoice = await tryReadJson(
      path.join(config.runtimeDir, node.id, "too-big-invoice.json")
    );
    if (tooBigInvoice?.invoice_address) {
      presets.push({
        id: `${node.id}-too-big-invoice`,
        label: "Run Preflight",
        title: "Blocked oversized invoice",
        description:
          "Loads a live invoice that exceeds current route conditions and proves the app blocks the attempt before a real send.",
        payload: {
          mode: "live",
          endpoint: primaryNode?.endpoint || node.endpoint,
          invoice: tooBigInvoice.invoice_address
        }
      });
    }
  }

  return presets;
}

function getLiveStory(presets) {
  const story = [];
  const preflightPreset = presets.find((preset) =>
    preset.id.endsWith("too-big-invoice")
  );
  const failurePreset = presets.find((preset) =>
    preset.id.endsWith("failure-payment")
  );
  const successPreset = presets.find((preset) =>
    preset.id.endsWith("success-payment")
  );
  const primaryStatePreset = presets.find((preset) =>
    preset.id.endsWith("-state")
  );
  const secondaryStatePreset = presets.find(
    (preset) =>
      preset.id.endsWith("-state") && preset.id !== primaryStatePreset?.id
  );

  if (preflightPreset) {
    story.push({
      id: "guided-preflight",
      title: "Preflight proves the route before send",
      description:
        "Run a live invoice check to confirm whether current liquidity and route conditions can satisfy the payment before execution.",
      presetId: preflightPreset.id
    });
  }

  if (failurePreset) {
    story.push({
      id: "guided-failure",
      title: "Recorded failure explains the root cause",
      description:
        "Load a real failed payment hash and compare the node's recorded error against current route evidence and channel state.",
      presetId: failurePreset.id
    });
  }

  if (successPreset) {
    story.push({
      id: "guided-success",
      title: "Success baseline anchors later comparisons",
      description:
        "Load a known-good payment hash so FiberOps can use the healthy run as a baseline for later blocked or degraded states.",
      presetId: successPreset.id
    });
  }

  if (story.length === 0 && primaryStatePreset) {
    story.push({
      id: "guided-primary-state",
      title: "Inspect the primary sender state",
      description:
        "Start from the primary endpoint to confirm readiness, route proof, and partial RPC failures before digging into payment-specific evidence.",
      presetId: primaryStatePreset.id
    });
  }

  if (story.length < 2 && secondaryStatePreset) {
    story.push({
      id: "guided-secondary-state",
      title: "Compare another node perspective",
      description:
        "Switch to another configured node and compare outbound liquidity, graph visibility, and route outcomes from a second sender or receiver view.",
      presetId: secondaryStatePreset.id
    });
  }

  return story.map((item, index) => ({
    ...item,
    step: String(index + 1).padStart(2, "0")
  }));
}

function shouldUseBundledLab(overrides, defaultEndpoint, node2Endpoint) {
  return (
    !Array.isArray(overrides.nodeSet) &&
    !process.env.FIBEROPS_NODE_SET_JSON &&
    defaultEndpoint === "http://127.0.0.1:8227" &&
    node2Endpoint === "http://127.0.0.1:8237"
  );
}

function resolveConfiguredNodeSet({
  overrides,
  defaultEndpoint,
  node2Endpoint,
  usingBundledLab
}) {
  const explicitNodeSet = Array.isArray(overrides.nodeSet)
    ? overrides.nodeSet
    : parseJsonValue(process.env.FIBEROPS_NODE_SET_JSON);
  const fallbackNodes = [
    {
      id: "node1",
      name: "node1",
      endpoint: defaultEndpoint,
      pubkey: usingBundledLab ? BUNDLED_LAB.nodePubkeys[0] : null,
      primary: true,
      probe: true
    },
    {
      id: "node2",
      name: "node2",
      endpoint: node2Endpoint,
      pubkey: usingBundledLab ? BUNDLED_LAB.nodePubkeys[1] : null,
      primary: false,
      probe: true
    }
  ];
  const sourceNodes =
    Array.isArray(explicitNodeSet) && explicitNodeSet.length > 0
      ? explicitNodeSet
      : fallbackNodes;

  return sourceNodes.map((node, index) => ({
    id: node.id || `node${index + 1}`,
    name: node.name || node.label || `node${index + 1}`,
    endpoint:
      typeof node.endpoint === "string" && node.endpoint.trim()
        ? node.endpoint.trim()
        : index === 0
          ? defaultEndpoint
          : node2Endpoint,
    ...(typeof node.pubkey === "string" && node.pubkey.trim()
      ? { pubkey: node.pubkey.trim() }
      : {}),
    ...(typeof node.token === "string" && node.token.trim()
      ? { token: node.token.trim() }
      : {}),
    ...(Number(node.timeoutMs) > 0
      ? { timeoutMs: Number(node.timeoutMs) }
      : {}),
    primary: node.primary ?? index === 0,
    probe: node.probe !== false
  }));
}

function buildEnvironmentFacts({ overrides, nodeSet, usingBundledLab }) {
  const knownPayments = compactObject({
    success:
      overrides.successfulPaymentHash ||
      process.env.FIBEROPS_SUCCESS_PAYMENT_HASH ||
      (usingBundledLab ? BUNDLED_LAB.successPaymentHash : null),
    failure:
      overrides.failedPaymentHash ||
      process.env.FIBEROPS_FAILED_PAYMENT_HASH ||
      (usingBundledLab ? BUNDLED_LAB.failurePaymentHash : null)
  });
  const channelId =
    overrides.channelId ||
    process.env.FIBEROPS_CHANNEL_ID ||
    (usingBundledLab ? BUNDLED_LAB.channelId : null);

  return {
    name:
      overrides.environmentName ||
      process.env.FIBEROPS_ENVIRONMENT_NAME ||
      (usingBundledLab
        ? "Bundled two-node Fiber lab"
        : "Configured Fiber environment"),
    topology: nodeSet.length > 1 ? "multi_node" : "single_node",
    nodes: nodeSet.map((node) => ({
      name: node.name,
      endpoint: node.endpoint,
      ...(node.pubkey ? { pubkey: node.pubkey } : {})
    })),
    channelId: channelId || null,
    knownPayments: Object.keys(knownPayments).length > 0 ? knownPayments : null
  };
}

function compactObject(source) {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== null && value !== "")
  );
}

function parseJsonValue(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseBooleanEnv(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function isFalseEnv(value) {
  return parseBooleanEnv(value) === false;
}

function humanizeToken(value) {
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

async function tryReadJson(filePath) {
  try {
    const contents = await readFile(filePath, "utf8");
    return JSON.parse(contents);
  } catch {
    return null;
  }
}

async function sendStatic(requestPath, response, publicDir) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(publicDir, normalizedPath));

  if (!filePath.startsWith(publicDir)) {
    sendJson(
      response,
      403,
      errorEnvelope("FORBIDDEN", "Forbidden.", null, {
        route: requestPath
      })
    );
    return;
  }

  try {
    const contents = await readFile(filePath);
    response.writeHead(200, {
      "content-type": getContentType(filePath)
    });
    response.end(contents);
  } catch (error) {
    if (looksLikeAssetPath(requestPath) || requestPath === "/index.html") {
      sendJson(
        response,
        error?.code === "ENOENT" ? 404 : 500,
        errorEnvelope(
          error?.code === "ENOENT"
            ? "STATIC_ASSET_NOT_FOUND"
            : "STATIC_ASSET_ERROR",
          error?.code === "ENOENT"
            ? "Static asset not found."
            : "Static asset could not be served.",
          error?.code === "ENOENT"
            ? null
            : {
                code: error?.code || null
              },
          {
            route: requestPath
          }
        )
      );
      return;
    }

    const fallback = await readFile(path.join(publicDir, "index.html"));
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8"
    });
    response.end(fallback);
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function successEnvelope(data, meta = {}) {
  return {
    ok: true,
    data,
    meta
  };
}

function errorEnvelope(code, message, details = null, meta = {}) {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details === null || details === undefined ? {} : { details })
    },
    meta
  };
}

function classifyServerError(error, route = "/api/diagnose") {
  if (error instanceof RequestPolicyError) {
    return {
      statusCode: error.statusCode || 400,
      code: error.code || REQUEST_POLICY_ERROR_CODES.INVALID_REQUEST,
      message: error.message || "Request policy rejected the request.",
      details: error.details || null,
      meta: {
        route
      }
    };
  }

  if (error instanceof SyntaxError) {
    return {
      statusCode: 400,
      code: "INVALID_REQUEST",
      message: error.message || "Request body must be valid JSON.",
      details: null,
      meta: {
        route
      }
    };
  }

  if (error instanceof FiberRpcError) {
    const unauthorized = error.code === "RPC_UNAUTHORIZED";
    return {
      statusCode: unauthorized ? 502 : 500,
      code: error.code || "RPC_TRANSPORT_ERROR",
      message: error.message || "Fiber RPC request failed.",
      details: {
        method: error.method || null,
        endpoint: error.endpoint || null,
        status: error.status || null,
        rpc: error.details || null
      },
      meta: {
        route
      }
    };
  }

  return {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: error?.message || "Unexpected server error.",
    details: null,
    meta: {
      route
    }
  };
}

function getContentType(filePath) {
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".svg")) {
    return "image/svg+xml";
  }
  return "text/html; charset=utf-8";
}

function looksLikeAssetPath(requestPath) {
  const basename = path.basename(requestPath || "");
  return basename.includes(".");
}
