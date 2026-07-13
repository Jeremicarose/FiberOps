import {
  normalizeEndpoint,
  validateLiveEndpointPolicy
} from "./request-policy.js";

const DEFAULT_ENDPOINT = "http://127.0.0.1:8227";

export function resolveExecutionPlan({
  payload = {},
  configuredNodes = [],
  defaultEndpoint = DEFAULT_ENDPOINT
} = {}) {
  const nodes = Array.isArray(configuredNodes) ? configuredNodes : [];
  const requestedEndpoint = normalizeComparableEndpoint(payload.endpoint);
  const requestedToken =
    typeof payload.token === "string" && payload.token.trim()
      ? payload.token.trim()
      : "";

  if (nodes.length === 0) {
    const endpoint = requestedEndpoint || defaultEndpoint;
    return finalizePlan({
      scope: requestedEndpoint ? "requested_node" : "default_node",
      selectedNodeId: "node-1",
      nodes: [
        {
          id: "node-1",
          name: "Primary node",
          endpoint,
          token: requestedToken,
          tokenSource: requestedToken ? "request" : "none",
          timeoutMs: payload.timeoutMs,
          probe: true,
          primary: true,
          requested: Boolean(requestedEndpoint),
          selected: true
        }
      ]
    });
  }

  if (!requestedEndpoint) {
    const [selectedNode] = nodes;
    return finalizePlan({
      scope: nodes.length > 1 ? "configured_node_set" : "configured_node",
      selectedNodeId: selectedNode?.id || "node-1",
      nodes: nodes.map((node, index) => ({
        ...cloneNode(node),
        requested: false,
        selected: index === 0,
        primary: index === 0
      }))
    });
  }

  const matchedNode = nodes.find(
    (node) => normalizeComparableEndpoint(node.endpoint) === requestedEndpoint
  );
  if (matchedNode) {
    const selectedNodeId = matchedNode.id || "node-1";
    const orderedNodes = [
      matchedNode,
      ...nodes.filter((node) => node !== matchedNode)
    ];

    return finalizePlan({
      scope:
        orderedNodes.length > 1 ? "configured_node_set" : "configured_node",
      selectedNodeId,
      nodes: orderedNodes.map((node, index) => {
        const isSelected = index === 0;
        const nextNode = cloneNode(node);

        if (isSelected && requestedToken) {
          nextNode.token = requestedToken;
          nextNode.tokenSource = "request";
        } else {
          nextNode.tokenSource = nextNode.token ? "node_config" : "none";
        }

        return {
          ...nextNode,
          requested: isSelected,
          selected: isSelected,
          primary: isSelected
        };
      })
    });
  }

  return finalizePlan({
    scope: "requested_node",
    selectedNodeId: "requested-node",
    nodes: [
      {
        id: "requested-node",
        name: "Requested node",
        endpoint: requestedEndpoint,
        token: requestedToken,
        tokenSource: requestedToken ? "request" : "none",
        timeoutMs: payload.timeoutMs,
        probe: true,
        primary: true,
        requested: true,
        selected: true
      }
    ]
  });
}

export function validateExecutionPlan(
  executionPlan,
  policy,
  { defaultEndpoint = DEFAULT_ENDPOINT } = {}
) {
  const nodes = (executionPlan?.nodes || []).map((node) => {
    validateLiveEndpointPolicy(
      {
        endpoint: node.endpoint,
        token: node.token || ""
      },
      policy,
      {
        defaultEndpoint
      }
    );

    return {
      ...node,
      policyValidated: true
    };
  });

  return {
    ...executionPlan,
    nodes
  };
}

export function summarizeExecutionPlan(executionPlan) {
  const nodes = (executionPlan?.nodes || []).map((node) => ({
    id: node.id,
    name: node.name,
    endpoint: node.endpoint,
    primary: Boolean(node.primary),
    selected: Boolean(node.selected),
    requested: Boolean(node.requested),
    probe: node.probe !== false,
    tokenSource: node.tokenSource || "none",
    policyValidated: node.policyValidated === true
  }));

  return {
    scope: executionPlan?.scope || "default_node",
    selectedNodeId: executionPlan?.selectedNodeId || nodes[0]?.id || null,
    nodes
  };
}

function finalizePlan({ scope, selectedNodeId, nodes }) {
  return {
    scope,
    selectedNodeId,
    nodes: nodes.map((node, index) => ({
      ...node,
      id: node.id || `node-${index + 1}`,
      name: node.name || node.label || node.endpoint || `Node ${index + 1}`,
      endpoint: normalizeComparableEndpoint(node.endpoint) || DEFAULT_ENDPOINT,
      token: typeof node.token === "string" ? node.token.trim() : "",
      tokenSource: node.tokenSource || (node.token ? "node_config" : "none"),
      timeoutMs:
        Number(node.timeoutMs) > 0 ? Number(node.timeoutMs) : undefined,
      probe: node.probe !== false,
      primary: Boolean(node.primary),
      requested: Boolean(node.requested),
      selected: Boolean(node.selected)
    }))
  };
}

function cloneNode(node) {
  return {
    id: node.id,
    name: node.name,
    endpoint: node.endpoint,
    token: node.token || "",
    timeoutMs: node.timeoutMs,
    probe: node.probe !== false
  };
}

function normalizeComparableEndpoint(endpoint) {
  const normalized = normalizeEndpoint(endpoint);
  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    const pathname =
      url.pathname === "/" ? "" : url.pathname.replace(/\/+$/g, "");
    return `${url.protocol}//${url.host}${pathname}`;
  } catch {
    return normalized;
  }
}
