import {
  booleanLabel,
  booleanTone,
  escapeHtml,
  formatTimestamp,
  humanize,
  invoiceExpiryTone,
  numericTone,
  partialErrorTone,
  sanitizeReferenceUrl,
  shortenHash,
  toneFromPaymentStatus,
  toneFromReadiness,
  valueOrDash
} from "./utils.js";
import { readIncidentHistory } from "./history.js";

export function renderScenarioDescription(state, dom) {
  if (!state.bootstrap) {
    return;
  }
  const scenario = state.bootstrap.scenarios.find(
    (item) => item.id === dom.scenarioSelect.value
  );
  dom.scenarioDescription.textContent = scenario?.description || "";
}

export function updateBootstrapState(state, dom, nextState, error = null) {
  state.bootstrapState = nextState;

  if (dom.bootstrapBadge) {
    dom.bootstrapBadge.dataset.bootstrapState = nextState;
    dom.bootstrapBadge.textContent =
      nextState === "ready"
        ? "Ready"
        : nextState === "failed"
          ? "Degraded"
          : "Bootstrapping";
  }

  if (dom.bootstrapMessage) {
    dom.bootstrapMessage.dataset.bootstrapState = nextState;
    dom.bootstrapMessage.textContent =
      nextState === "ready"
        ? "Dashboard configuration, contract endpoints, and local-lab metadata loaded successfully."
        : nextState === "failed"
          ? `Bootstrap degraded: ${error?.message || "The app could not load /api/bootstrap."}`
          : "Loading dashboard configuration and local lab metadata.";
  }
}

export function fillScenarios(dom, scenarios) {
  dom.scenarioSelect.innerHTML = scenarios
    .map(
      (scenario) =>
        `<option value="${scenario.id}">${escapeHtml(scenario.name)}</option>`
    )
    .join("");
}

export function renderLiveStory(dom, storyItems, presets) {
  if (!dom.liveStoryContainer) {
    return;
  }

  dom.liveStoryContainer.innerHTML = storyItems
    .map((item, index) => {
      const preset = presets.find(
        (candidate) => candidate.id === item.presetId
      );
      const tone = resolveStoryTone(item.title, item.description, index);
      return `
        <button type="button" class="story-card" data-live-preset="${escapeHtml(item.presetId)}" data-tone="${escapeHtml(tone)}">
          <div class="story-card__step-wrap">
            <span class="story-card__step">${escapeHtml(item.step)}</span>
            <span class="story-card__tag">${escapeHtml(resolveStoryTag(item.title, item.description, index))}</span>
          </div>
          <div class="story-card__body">
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.description)}</p>
            <div class="story-card__footer">
              <span class="story-card__action">${escapeHtml(preset?.label || "Run")}</span>
              <span class="story-card__cta">Open</span>
            </div>
          </div>
        </button>
      `;
    })
    .join("");
}

export function renderLivePresets(state, dom, presets) {
  if (!dom.livePresetsContainer || !dom.livePresetsGroup) {
    return;
  }

  if (!presets.length) {
    dom.livePresetsGroup.hidden = true;
    dom.livePresetsContainer.innerHTML = "";
    return;
  }

  dom.livePresetsGroup.hidden = state.mode !== "live";
  dom.livePresetsContainer.innerHTML = presets
    .map(
      (preset) => `
        <button type="button" class="preset-card" data-live-preset="${escapeHtml(preset.id)}">
          <span class="preset-card__label">${escapeHtml(preset.label)}</span>
          <strong>${escapeHtml(preset.title)}</strong>
          <p>${escapeHtml(preset.description)}</p>
        </button>
      `
    )
    .join("");
}

export function renderLabFacts(dom, localLab) {
  if (!dom.labFactsContainer) {
    return;
  }

  if (!localLab) {
    dom.labFactsContainer.innerHTML = "";
    return;
  }

  const facts = [
    ["Environment", localLab.name || "Configured Fiber environment"],
    ["Topology", humanize(localLab.topology || "single_node")],
    ...(Array.isArray(localLab.nodes)
      ? localLab.nodes.map((node, index) => [
          `${humanize(node.name || `node${index + 1}`)} RPC`,
          node.endpoint || "Unknown"
        ])
      : []),
    ...(localLab.channelId ? [["Channel", localLab.channelId]] : []),
    ...(localLab.knownPayments?.success
      ? [["Success hash", localLab.knownPayments.success]]
      : []),
    ...(localLab.knownPayments?.failure
      ? [["Failure hash", localLab.knownPayments.failure]]
      : [])
  ];

  dom.labFactsContainer.innerHTML = facts
    .map(
      ([label, value]) => `
        <article class="fact-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(String(value))}</strong>
        </article>
      `
    )
    .join("");
}

export function renderContextBanner(state, dom) {
  if (!dom.activeContext) {
    return;
  }

  if (!state.activePreset) {
    dom.activeContext.hidden = true;
    dom.activeContext.innerHTML = "";
    return;
  }

  dom.activeContext.hidden = false;
  dom.activeContext.innerHTML = `
    <span class="context-banner__label">Live proof</span>
    <strong>${escapeHtml(state.activePreset.title)}</strong>
    <p>${escapeHtml(state.activePreset.description)}</p>
  `;
}

export function renderSummary(dom, summary) {
  const multiNode = summary.multiNode || null;
  const priorityMetrics = [
    {
      label: "Payment readiness",
      value: summary.paymentReadiness
        ? humanize(summary.paymentReadiness)
        : "Unknown",
      tone: toneFromReadiness(summary.paymentReadiness),
      emphasis: "primary"
    },
    {
      label: "Payment status",
      value: summary.paymentStatus || "Not loaded",
      tone: toneFromPaymentStatus(summary.paymentStatus),
      emphasis: "primary"
    },
    {
      label: "Estimated outbound",
      value: summary.estimatedOutbound || "Unknown",
      tone: summary.estimatedOutbound ? "positive" : "muted",
      emphasis: "primary"
    },
    {
      label: "Ready channels",
      value: valueOrDash(summary.readyChannels),
      tone: numericTone(summary.readyChannels),
      emphasis: "primary"
    },
    {
      label: "Route proof",
      value: routeProofLabel(summary.routeProof),
      tone: routeProofTone(summary.routeProof),
      emphasis: "primary"
    },
    {
      label: "Partial RPC errors",
      value: valueOrDash(summary.partialErrorCount),
      tone: partialErrorTone(summary.partialErrorCount),
      emphasis: "primary"
    }
  ];

  const secondaryMetrics = [
    {
      label: "Endpoint",
      value: summary.endpoint || "Unknown",
      tone: "muted",
      emphasis: "secondary"
    },
    {
      label: "Node version",
      value: summary.nodeVersion || "Unknown",
      tone: "muted",
      emphasis: "secondary"
    },
    {
      label: "Peer count",
      value: valueOrDash(summary.peerCount),
      tone: summary.peerCount ? "positive" : "muted",
      emphasis: "secondary"
    },
    {
      label: "Graph visibility",
      value: targetVisibilityLabel(summary.targetVisibility),
      tone: targetVisibilityTone(summary.targetVisibility),
      emphasis: "secondary"
    },
    {
      label: "Invoice expired",
      value: booleanLabel(summary.invoiceExpired),
      tone: invoiceExpiryTone(summary.invoiceExpired),
      emphasis: "secondary"
    },
    {
      label: "Channels",
      value: `${valueOrDash(summary.openChannels)} / ${valueOrDash(summary.totalChannels)}`,
      tone: numericTone(summary.openChannels),
      emphasis: "secondary"
    },
    {
      label: "Nodes reached",
      value: multiNode?.nodeCount
        ? `${valueOrDash(multiNode.reachableNodes)} / ${valueOrDash(multiNode.nodeCount)}`
        : "—",
      tone: multiNode?.enabled
        ? multiNode.reachableNodes === multiNode.nodeCount
          ? "positive"
          : "warning"
        : "muted",
      emphasis: "secondary"
    },
    {
      label: "Probe agreement",
      value: multiNode?.enabled
        ? booleanLabel(multiNode.consistentProbeStatus)
        : "—",
      tone: multiNode?.enabled
        ? booleanTone(multiNode.consistentProbeStatus)
        : "muted",
      emphasis: "secondary"
    }
  ];

  document.querySelector("#summary-grid").innerHTML = [
    ...priorityMetrics.map((metric) => renderMetricCard(metric)),
    ...secondaryMetrics.map((metric) => renderMetricCard(metric))
  ].join("");
}

export function renderMultiNode(dom, nodes, multiNode) {
  if (!dom.multiNodePanel || !dom.nodesGrid) {
    return;
  }

  if (!Array.isArray(nodes) || nodes.length === 0 || !multiNode?.enabled) {
    dom.multiNodePanel.hidden = true;
    dom.nodesGrid.innerHTML = "";
    return;
  }

  dom.multiNodePanel.hidden = false;
  dom.nodesGrid.innerHTML = nodes
    .map((node) => {
      const probe = node.probe || {};
      const summary = node.summary || {};
      const error = node.error?.message || null;
      return `
        <article class="node-card" data-status="${escapeHtml(probe.status || summary.paymentReadiness || "unknown")}">
          <div class="node-card__top">
            <div>
              <span class="node-card__label">${escapeHtml(node.primary ? "Primary" : "Peer")}</span>
              <strong>${escapeHtml(node.name || node.endpoint || "Node")}</strong>
            </div>
            <span class="node-card__status">${escapeHtml(humanize(probe.status || summary.paymentReadiness || "unknown"))}</span>
          </div>
          <p class="node-card__meta">${escapeHtml(node.endpoint || "Unknown endpoint")}</p>
          <div class="node-card__facts">
            <span>Outbound <strong>${escapeHtml(summary.estimatedOutbound || "Unknown")}</strong></span>
            <span>Ready <strong>${escapeHtml(String(valueOrDash(summary.readyChannels)))}</strong></span>
            <span>Probe <strong>${escapeHtml(routeProofLabel(summary.routeProof))}</strong></span>
            <span>Graph <strong>${escapeHtml(targetVisibilityLabel(summary.targetVisibility))}</strong></span>
          </div>
          <p class="node-card__explanation">${escapeHtml(error || probe.blockingError || probe.supportMessage || "Snapshot collected without node-level errors.")}</p>
        </article>
      `;
    })
    .join("");
}

export function renderComparison(dom, history) {
  if (!dom.comparisonPanel) {
    return;
  }

  const comparison = history?.comparison;
  if (!comparison) {
    dom.comparisonPanel.innerHTML =
      '<div class="history-empty">No cross-run comparison yet. Run another related diagnosis to unlock transitions.</div>';
    return;
  }

  const transitions = Array.isArray(comparison.transitions)
    ? comparison.transitions
    : [];
  const nodeChanges = Array.isArray(comparison.nodeChanges)
    ? comparison.nodeChanges
    : [];
  dom.comparisonPanel.innerHTML = `
    <article class="history-card">
      <div class="history-card__top">
        <div>
          <span class="history-card__label">Comparison</span>
          <strong>${escapeHtml(comparison.previous?.category ? `${humanize(comparison.previous.category)} → ${humanize(comparison.current?.category || "current")}` : "Cross-run comparison")}</strong>
        </div>
        <span class="history-card__status">${escapeHtml(String(history.relatedCount ?? 0))} related</span>
      </div>
      <p>${escapeHtml(transitions.length ? transitions.join(" · ") : "No material state transition detected between the latest related runs.")}</p>
      ${
        nodeChanges.length
          ? `
        <div class="history-list">
          ${nodeChanges
            .map(
              (change) => `
            <article class="history-entry">
              <div class="history-entry__top">
                <strong>${escapeHtml(change.node || "Node")}</strong>
                <span>${escapeHtml(change.probeStatusAfter || change.routeProofAfter || "changed")}</span>
              </div>
              <p>${escapeHtml((change.highlights || []).join(" · "))}</p>
            </article>
          `
            )
            .join("")}
        </div>
      `
          : ""
      }
    </article>
  `;
}

export function renderServerHistory(dom, history) {
  if (!dom.historyPanel) {
    return;
  }

  const recent = Array.isArray(history?.recent) ? history.recent : [];
  if (!recent.length) {
    dom.historyPanel.innerHTML = "";
    return;
  }

  dom.historyPanel.innerHTML = `
    <div class="history-card">
      <div class="history-card__top">
        <div>
          <span class="history-card__label">Backend history</span>
          <strong>Recent related runs</strong>
        </div>
        <span class="history-card__status">${escapeHtml(String(recent.length))} loaded</span>
      </div>
      <div class="history-list">
        ${recent
          .map(
            (entry) => `
          <article class="history-entry">
            <div class="history-entry__top">
              <strong>${escapeHtml(humanize(entry.category || "unknown"))}</strong>
              <span>${escapeHtml(formatTimestamp(entry.timestamp))}</span>
            </div>
            <p>${escapeHtml(humanize(entry.paymentReadiness || entry.probeStatus || "unknown"))}${entry.blockingError ? ` · ${escapeHtml(entry.blockingError)}` : ""}</p>
          </article>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

export function renderAlerts(dom, alerts) {
  if (!dom.alertsPanel) {
    return;
  }

  if (!alerts.length) {
    dom.alertsPanel.hidden = true;
    dom.alertsPanel.innerHTML = "";
    return;
  }

  const uniqueAlerts = alerts.filter((alert, index, items) => {
    return (
      items.findIndex(
        (item) => item.title === alert.title && item.message === alert.message
      ) === index
    );
  });

  dom.alertsPanel.hidden = false;
  dom.alertsPanel.innerHTML = uniqueAlerts
    .map(
      (alert) => `
        <article class="alert-card" data-severity="${escapeHtml(alert.severity)}">
          <div class="alert-card__top">
            <span class="alert-card__eyebrow">${escapeHtml(humanize(alert.cause || "alert"))}</span>
            <span class="alert-card__severity">${escapeHtml(alert.severity.toUpperCase())}</span>
          </div>
          <strong>${escapeHtml(alert.title)}</strong>
          <p>${escapeHtml(alert.message)}</p>
          <div class="alert-card__footer">
            <span>Operator action</span>
            <strong>${escapeHtml(alert.suggestedAction || "Inspect the latest snapshot.")}</strong>
          </div>
        </article>
      `
    )
    .join("");
}

export function renderRoutePreview(dom, routePreview, submittedPayload) {
  if (!dom.routePreviewContainer) {
    return;
  }

  const hopHints = Array.isArray(routePreview.hopHints)
    ? routePreview.hopHints
    : [];
  const limitations = Array.isArray(routePreview.limitations)
    ? routePreview.limitations
    : [];
  const status = routePreview.status || "unknown";
  const mode = routePreview.mode || "heuristic";
  const explanation =
    routePreview.blockingReason ||
    routePreview.feeHint ||
    "No preflight blockers were identified from the current snapshot.";
  const evidenceSource =
    routePreview.evidenceSource ||
    routePreview.probeMethod ||
    routePreview.routeBuildMethod ||
    routePreview.probe?.source ||
    "fallback";
  const confidence =
    routePreview.confidence ||
    (mode === "dry_run" ? "high" : mode === "heuristic" ? "medium" : "low");
  const routeAlternatives = Array.isArray(routePreview.routeAlternatives)
    ? routePreview.routeAlternatives
    : [];
  const chosenRoute = routePreview.chosenRoute || null;
  const routeDecisionReason = routePreview.routeDecisionReason || null;
  const hopMarkup = hopHints.length
    ? hopHints
        .map(
          (hop) => `
            <li class="route-hop">
              <span class="route-hop__index">Hop ${escapeHtml(String(hop.hop))}</span>
              <strong>${escapeHtml(shortenHash(hop.channelId || hop.nodeId || `hop-${hop.hop}`, 18))}</strong>
              <p>${escapeHtml(hop.state || "Observed")} · ${escapeHtml(hop.localBalance || hop.fee || "live probe")}</p>
            </li>
          `
        )
        .join("")
    : '<li class="route-hop route-hop--empty"><span class="route-hop__index">Path</span><strong>No hop hints</strong><p>FiberOps did not find open channel candidates in this snapshot.</p></li>';
  const chosenRouteMarkup = chosenRoute
    ? `
      <div class="route-preview-card__footer">
        <span>Chosen route</span>
        <strong>${escapeHtml(chosenRoute.pathPubkeys.map((pubkey) => shortenHash(pubkey, 14)).join(" → "))}</strong>
      </div>
      <div class="route-preview-metrics">
        <article>
          <span>Hops</span>
          <strong>${escapeHtml(String(chosenRoute.hopCount || 0))}</strong>
        </article>
        <article>
          <span>Total amount</span>
          <strong>${escapeHtml(chosenRoute.totalAmount || "Unknown")}</strong>
        </article>
        <article>
          <span>Estimated fee</span>
          <strong>${escapeHtml(chosenRoute.totalFee || "Unknown")}</strong>
        </article>
        <article>
          <span>Total expiry</span>
          <strong>${escapeHtml(String(chosenRoute.totalExpiry || "Unknown"))}</strong>
        </article>
      </div>
      ${
        routeDecisionReason
          ? `<p class="route-preview-card__explanation">${escapeHtml(routeDecisionReason)}</p>`
          : ""
      }
    `
    : "";
  const alternativeMarkup = routeAlternatives.length
    ? `
      <div class="history-card">
        <div class="history-card__top">
          <div>
            <span class="history-card__label">Built routes</span>
            <strong>Candidate paths</strong>
          </div>
          <span class="history-card__status">${escapeHtml(String(routeAlternatives.length))} tested</span>
        </div>
        <div class="history-list">
          ${routeAlternatives
            .map(
              (candidate) => `
            <article class="history-entry">
              <div class="history-entry__top">
                <strong>${escapeHtml(candidate.pathPubkeys?.length ? candidate.pathPubkeys.map((pubkey) => shortenHash(pubkey, 10)).join(" → ") : `Candidate ${candidate.rank || "?"}`)}</strong>
                <span>${escapeHtml(humanize(candidate.status || "unknown"))}</span>
              </div>
              <p>${escapeHtml(
                [
                  candidate.hopCount ? `${candidate.hopCount} hop(s)` : null,
                  candidate.totalFee ? `fee ${candidate.totalFee}` : null,
                  candidate.totalAmount
                    ? `amount ${candidate.totalAmount}`
                    : null,
                  candidate.blockingError || null
                ]
                  .filter(Boolean)
                  .join(" · ")
              )}</p>
            </article>
          `
            )
            .join("")}
        </div>
      </div>
    `
    : "";

  dom.routePreviewContainer.innerHTML = `
    <div class="route-preview-card" data-status="${escapeHtml(status)}" data-mode="${escapeHtml(mode)}">
      <div class="route-preview-card__top">
        <div>
          <span class="route-preview-card__eyebrow">Route preview</span>
          <strong>${escapeHtml(humanize(status))}</strong>
        </div>
        <span class="route-preview-card__status">${escapeHtml(humanize(status))}</span>
      </div>
      <div class="route-preview-card__badges">
        <span class="route-preview-badge">${escapeHtml(humanize(mode))}</span>
        <span class="route-preview-badge">${escapeHtml(humanize(confidence))} confidence</span>
      </div>
      <p class="route-preview-card__explanation">${escapeHtml(explanation)}</p>
      <div class="route-preview-metrics">
        <article>
          <span>Requested amount</span>
          <strong>${escapeHtml(routePreview.requestedAmount || deriveRequestedAmount(submittedPayload))}</strong>
        </article>
        <article>
          <span>Estimated outbound</span>
          <strong>${escapeHtml(routePreview.estimatedOutbound || "Unknown")}</strong>
        </article>
        <article>
          <span>Preview basis</span>
          <strong>${escapeHtml(humanize(mode))}</strong>
        </article>
        <article>
          <span>Evidence source</span>
          <strong>${escapeHtml(evidenceSource)}</strong>
        </article>
      </div>
      <div class="route-preview-card__footer">
        <span>Readiness note</span>
        <strong>${escapeHtml(routePreview.feeHint || "Heuristic preview only; no live fee quote was requested from Fiber RPC.")}</strong>
      </div>
      ${chosenRouteMarkup}
      ${alternativeMarkup}
      ${
        limitations.length
          ? `
        <div class="route-preview-limitations">
          <span class="route-path__label">Limitations</span>
          <ul>${limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>
      `
          : ""
      }
      <div class="route-path">
        <span class="route-path__label">Hop hints</span>
        <ul class="route-hop-list">${hopMarkup}</ul>
      </div>
    </div>
  `;
}

export function renderTimeline(dom) {
  if (!dom.incidentTimeline) {
    return;
  }

  const incidents = readIncidentHistory();
  if (!incidents.length) {
    dom.incidentTimeline.innerHTML =
      '<div class="timeline-empty">No local incidents yet. Run a demo or live proof artifact to start the incident ledger.</div>';
    return;
  }

  dom.incidentTimeline.innerHTML = incidents
    .map(
      (incident) => `
        <article class="timeline-entry" data-severity="${escapeHtml(incident.severity)}">
          <div class="timeline-entry__rail"></div>
          <div class="timeline-entry__body">
            <div class="timeline-entry__top">
              <span>${escapeHtml(formatTimestamp(incident.timestamp))}</span>
              <span>${escapeHtml(resolveTimelineSource(incident.source))}</span>
            </div>
            <strong>${escapeHtml(incident.headline)}</strong>
            <p>${escapeHtml(humanize(incident.category))} · ${escapeHtml(incident.endpointOrScenario || "Unknown target")}</p>
            <div class="timeline-entry__meta">
              <span>${escapeHtml(incident.summary.paymentStatus || incident.summary.probeStatus || "No payment state")}</span>
              <span>${escapeHtml(incident.summary.estimatedOutbound || "No outbound estimate")}</span>
              <span>${escapeHtml(humanize(incident.summary.paymentReadiness || "unknown"))}</span>
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

export function renderChecks(checks) {
  document.querySelector("#checks-list").innerHTML = checks
    .map(
      (check) => `
        <li class="status-item">
          <span class="status-dot status-dot--${check.status}"></span>
          <div>
            <strong>${escapeHtml(check.title)}</strong>
            <p>${escapeHtml(check.detail)}</p>
          </div>
        </li>
      `
    )
    .join("");
}

export function renderEvidence(items) {
  document.querySelector("#evidence-list").innerHTML = items
    .map(
      (item) => `
        <li>
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(String(item.value))}</strong>
        </li>
      `
    )
    .join("");
}

export function renderActions(dom, actions) {
  if (dom.primaryAction) {
    const [firstAction] = actions;
    if (firstAction) {
      dom.primaryAction.hidden = false;
      dom.primaryAction.innerHTML = `
        <span class="primary-action__label">Next</span>
        <strong>${escapeHtml(firstAction)}</strong>
      `;
    } else {
      dom.primaryAction.hidden = true;
      dom.primaryAction.innerHTML = "";
    }
  }

  document.querySelector("#actions-list").innerHTML = actions
    .slice(1)
    .map((action) => `<li>${escapeHtml(action)}</li>`)
    .join("");
}

export function renderReferences(references) {
  const safeReferences = references
    .map((reference) => ({
      label: reference.label,
      url: sanitizeReferenceUrl(reference.url)
    }))
    .filter((reference) => reference.url);

  document.querySelector("#references-list").innerHTML = safeReferences
    .map(
      (reference) => `
        <li><a href="${escapeHtml(reference.url)}" target="_blank" rel="noreferrer">${escapeHtml(reference.label)}</a></li>
      `
    )
    .join("");
}

function renderMetricCard(metric) {
  return `
    <article class="metric-card" data-tone="${escapeHtml(metric.tone)}" data-emphasis="${escapeHtml(metric.emphasis)}">
      <span>${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(String(metric.value))}</strong>
    </article>
  `;
}

function resolveStoryTone(title, description, index) {
  const value = `${title} ${description}`.toLowerCase();
  if (value.includes("success") || value.includes("known-good")) {
    return "success";
  }
  if (
    value.includes("failure") ||
    value.includes("blocked") ||
    value.includes("problem")
  ) {
    return "failure";
  }
  if (value.includes("preflight") || index === 0) {
    return "preflight";
  }
  return "neutral";
}

function resolveStoryTag(title, description, index) {
  const value = `${title} ${description}`.toLowerCase();
  if (value.includes("success") || value.includes("known-good")) {
    return "Success";
  }
  if (value.includes("failure")) {
    return "Failure";
  }
  if (value.includes("preflight") || index === 0) {
    return "Preflight";
  }
  return "Guided";
}

function resolveTimelineSource(source) {
  if (source === "live") {
    return "LIVE SNAPSHOT";
  }
  if (source === "demo") {
    return "DEMO FIXTURE";
  }
  return String(source || "UNKNOWN").toUpperCase();
}

function deriveRequestedAmount(submittedPayload) {
  const explicitAmount = submittedPayload?.amount?.trim();
  if (explicitAmount) {
    return explicitAmount;
  }
  return "Not specified";
}

function routeProofLabel(value) {
  switch (value) {
    case "confirmed":
      return "Confirmed";
    case "blocked":
      return "Blocked";
    case "inconclusive":
      return "Inconclusive";
    case "skipped":
      return "Skipped";
    case "not_supported":
      return "Not probed";
    default:
      return "Unknown";
  }
}

function routeProofTone(value) {
  switch (value) {
    case "confirmed":
      return "positive";
    case "blocked":
      return "critical";
    case "inconclusive":
      return "warning";
    default:
      return "muted";
  }
}

function targetVisibilityLabel(value) {
  switch (value) {
    case "visible":
      return "Visible";
    case "route_proven":
      return "Route proven";
    case "not_visible":
      return "Not visible";
    case "not_checked":
      return "Not checked";
    default:
      return "Unknown";
  }
}

function targetVisibilityTone(value) {
  switch (value) {
    case "visible":
      return "positive";
    case "route_proven":
      return "warning";
    case "not_visible":
      return "critical";
    default:
      return "muted";
  }
}
