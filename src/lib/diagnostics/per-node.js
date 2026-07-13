import { buildDiagnosis } from "./classifiers.js";
import { buildRoutePreview } from "./engine.js";
import { buildAlerts } from "./recommendations.js";
import { summarizeContext } from "./summaries.js";

export function decorateNodeResult({ source, request, scenario = null, node }) {
  const nodeRequest = {
    ...request,
    endpoint: node.endpoint
  };
  const nodeContext = {
    ...node.context,
    endpoint: node.endpoint,
    partialErrors: node.partialErrors || {},
    routeProbe: node.probe || node.context?.routeProbe || null,
    routeBuild: node.routeBuild || node.context?.routeBuild || null
  };
  const summary =
    node.summary || summarizeContext(nodeContext, nodeRequest, []);
  const diagnosis = buildDiagnosis({
    source,
    request: nodeRequest,
    context: nodeContext,
    scenario
  });
  const routePreview = buildRoutePreview({
    request: nodeRequest,
    context: nodeContext,
    diagnosis,
    summary
  });
  const alerts = buildAlerts({
    request: nodeRequest,
    context: nodeContext,
    diagnosis,
    summary,
    routePreview,
    scenario
  });

  return {
    ...node,
    request: nodeRequest,
    summary,
    diagnosis,
    routePreview,
    alerts
  };
}

export function selectAggregateNode(nodes, { selectedNodeId = null } = {}) {
  const values = Array.isArray(nodes) ? nodes : [];
  if (values.length === 0) {
    return null;
  }

  if (selectedNodeId) {
    const explicit = values.find((node) => node.id === selectedNodeId);
    if (explicit) {
      return explicit;
    }
  }

  return [...values].sort(compareNodePriority)[0] || values[0];
}

export function buildAggregateStatus(nodes) {
  const values = Array.isArray(nodes) ? nodes : [];
  if (values.length <= 1) {
    return "single_node";
  }

  const fatalCount = values.filter((node) => node.error).length;
  if (fatalCount === values.length) {
    return "all_failed";
  }

  if (
    values.some((node) =>
      node.partialErrors ? Object.keys(node.partialErrors).length > 0 : false
    )
  ) {
    return "degraded";
  }

  const diagnosisCategories = new Set(
    values
      .map((node) => node.diagnosis?.category)
      .filter((value) => typeof value === "string" && value.length > 0)
  );
  const routeStatuses = new Set(
    values
      .map((node) => node.routePreview?.status)
      .filter((value) => typeof value === "string" && value.length > 0)
  );

  if (fatalCount > 0) {
    return "degraded";
  }

  if (diagnosisCategories.size <= 1 && routeStatuses.size <= 1) {
    return "consistent";
  }

  return "mixed";
}

function compareNodePriority(left, right) {
  return scoreNode(right) - scoreNode(left);
}

function scoreNode(node) {
  let score = 0;

  if (node.selected) {
    score += 1000;
  }
  if (node.routePreview?.status === "ready") {
    score += 200;
  }
  if (node.diagnosis?.category === "success") {
    score += 150;
  }
  if (!node.error) {
    score += 100;
  }
  if (node.primary) {
    score += 10;
  }

  return score;
}
