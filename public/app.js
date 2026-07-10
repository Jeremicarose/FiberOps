const form = document.querySelector("#diagnostics-form");
const scenarioSelect = document.querySelector("#scenarioId");
const scenarioDescription = document.querySelector("#scenario-description");
const modeButtons = document.querySelectorAll("[data-mode-button]");
const visibilityFields = document.querySelectorAll("[data-visibility]");
const resultEmpty = document.querySelector("#result-empty");
const resultContent = document.querySelector("#result-content");
const resultStatus = document.querySelector("#result-status");
const submitButton = document.querySelector("#submit-button");
const livePresetsContainer = document.querySelector("#live-presets");
const livePresetsGroup = document.querySelector("[data-live-presets-group]");
const liveStoryContainer = document.querySelector("#live-story");
const labFactsContainer = document.querySelector("#lab-facts");
const activeContext = document.querySelector("#active-context");
const alertsPanel = document.querySelector("#alerts-panel");
const routePreviewContainer = document.querySelector("#route-preview");
const incidentTimeline = document.querySelector("#incident-timeline");
const HISTORY_KEY = "fiberops:incident-history";
const HISTORY_LIMIT = 8;

const state = {
  mode: "demo",
  bootstrap: null,
  activePreset: null
};

bootstrap();

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setMode(button.dataset.modeButton);
  });
});

scenarioSelect.addEventListener("change", () => {
  renderScenarioDescription();
});

function handlePresetClick(event) {
  const button = event.target.closest("[data-live-preset]");
  if (!button || !state.bootstrap) {
    return;
  }

  const preset = state.bootstrap.livePresets?.find((item) => item.id === button.dataset.livePreset);
  if (!preset) {
    return;
  }

  applyLivePreset(preset);
  form.requestSubmit();
}

livePresetsContainer?.addEventListener("click", handlePresetClick);
liveStoryContainer?.addEventListener("click", handlePresetClick);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  submitButton.textContent = "Analyzing...";
  resultStatus.textContent = "Running";

  try {
    const payload = formDataToObject(new FormData(form));
    const response = await fetch("/api/diagnose", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    renderResult(data);
  } catch (error) {
    renderFailure(error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Run diagnostics";
  }
});

async function bootstrap() {
  const response = await fetch("/api/bootstrap");
  const data = await response.json();
  state.bootstrap = data;

  fillScenarios(data.scenarios);
  renderLiveStory(data.liveStory || [], data.livePresets || []);
  renderLivePresets(data.livePresets || []);
  renderLabFacts(data.localLab || null);
  document.querySelector("#endpoint").value = data.defaultEndpoint;
  renderScenarioDescription();
  renderTimeline();
}

function fillScenarios(scenarios) {
  scenarioSelect.innerHTML = scenarios
    .map(
      (scenario) =>
        `<option value="${scenario.id}">${escapeHtml(scenario.name)}</option>`
    )
    .join("");
}

function renderScenarioDescription() {
  if (!state.bootstrap) {
    return;
  }
  const scenario = state.bootstrap.scenarios.find((item) => item.id === scenarioSelect.value);
  scenarioDescription.textContent = scenario?.description || "";
}

function setMode(mode) {
  state.mode = mode;
  form.elements.mode.value = mode;

  if (mode !== "live") {
    state.activePreset = null;
  }

  modeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.modeButton === mode);
  });

  visibilityFields.forEach((field) => {
    field.hidden = field.dataset.visibility !== mode;
  });
}

function renderLiveStory(storyItems, presets) {
  if (!liveStoryContainer) {
    return;
  }

  liveStoryContainer.innerHTML = storyItems
    .map((item) => {
      const preset = presets.find((candidate) => candidate.id === item.presetId);
      return `
        <button type="button" class="story-card" data-live-preset="${escapeHtml(item.presetId)}">
          <span class="story-card__step">${escapeHtml(item.step)}</span>
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.description)}</p>
            <span class="story-card__action">${escapeHtml(preset?.label || "Run")}</span>
          </div>
        </button>
      `;
    })
    .join("");
}

function renderLivePresets(presets) {
  if (!livePresetsContainer || !livePresetsGroup) {
    return;
  }

  if (!presets.length) {
    livePresetsGroup.hidden = true;
    livePresetsContainer.innerHTML = "";
    return;
  }

  livePresetsGroup.hidden = state.mode !== "live";
  livePresetsContainer.innerHTML = presets
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

function applyLivePreset(preset) {
  setMode("live");
  state.activePreset = preset;

  const fields = ["endpoint", "token", "invoice", "paymentHash", "amount", "targetPubkey"];
  for (const field of fields) {
    form.elements[field].value = "";
  }

  for (const [key, value] of Object.entries(preset.payload || {})) {
    if (form.elements[key]) {
      form.elements[key].value = value;
    }
  }
}

function renderLabFacts(localLab) {
  if (!labFactsContainer || !localLab) {
    return;
  }

  const facts = [
    ["Node1 RPC", localLab.node1.endpoint],
    ["Node2 RPC", localLab.node2.endpoint],
    ["Channel", localLab.channelId],
    ["Success hash", localLab.successfulPaymentHash],
    ["Failure hash", localLab.failedPaymentHash]
  ];

  labFactsContainer.innerHTML = facts
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

function renderResult(data) {
  const diagnosis = data.diagnosis;

  resultEmpty.hidden = true;
  resultContent.hidden = false;
  resultStatus.textContent = diagnosis.severity.toUpperCase();
  resultStatus.dataset.severity = diagnosis.severity;

  document.querySelector("#result-category").textContent = humanize(diagnosis.category);
  document.querySelector("#result-headline").textContent = diagnosis.headline;
  document.querySelector("#result-confidence").textContent = `${Math.round(diagnosis.confidence * 100)}%`;
  document.querySelector("#result-explanation").textContent = diagnosis.explanation;
  renderContextBanner();

  appendIncident(data.event, data.summary, diagnosis, data.scenario);
  renderAlerts(data.alerts || []);
  renderSummary(data.summary);
  renderRoutePreview(data.routePreview || {});
  renderTimeline();
  renderChecks(diagnosis.checks);
  renderEvidence(diagnosis.evidence);
  renderActions(diagnosis.nextActions);
  renderReferences(diagnosis.references);
}

function renderFailure(error) {
  resultEmpty.hidden = true;
  resultContent.hidden = false;
  resultStatus.textContent = "ERROR";
  resultStatus.dataset.severity = "critical";
  document.querySelector("#result-category").textContent = "Request failed";
  document.querySelector("#result-headline").textContent = "The diagnostics request could not be completed";
  document.querySelector("#result-confidence").textContent = "0%";
  document.querySelector("#result-explanation").textContent = error.message || "Unknown error";
  renderContextBanner();
  renderAlerts([]);
  renderSummary({});
  renderRoutePreview({});
  renderTimeline();
  renderChecks([]);
  renderEvidence([]);
  renderActions(["Check the server console and verify the request payload."]);
  renderReferences([]);
}

function renderContextBanner() {
  if (!activeContext) {
    return;
  }

  if (!state.activePreset) {
    activeContext.hidden = true;
    activeContext.innerHTML = "";
    return;
  }

  activeContext.hidden = false;
  activeContext.innerHTML = `
    <span class="context-banner__label">Real local run</span>
    <strong>${escapeHtml(state.activePreset.title)}</strong>
    <p>${escapeHtml(state.activePreset.description)}</p>
  `;
}

function renderSummary(summary) {
  const metrics = [
    ["Endpoint", summary.endpoint || "Unknown"],
    ["Node version", summary.nodeVersion || "Unknown"],
    ["Payment status", summary.paymentStatus || "Not loaded"],
    ["Payment readiness", summary.paymentReadiness ? humanize(summary.paymentReadiness) : "Unknown"],
    ["Open channels", valueOrDash(summary.openChannels)],
    ["Ready channels", valueOrDash(summary.readyChannels)],
    ["Total channels", valueOrDash(summary.totalChannels)],
    ["Peer count", valueOrDash(summary.peerCount)],
    ["Estimated outbound", summary.estimatedOutbound || "Unknown"],
    ["Partial RPC errors", valueOrDash(summary.partialErrorCount)],
    ["Invoice expired", summary.invoiceExpired === null ? "Unknown" : summary.invoiceExpired ? "Yes" : "No"],
    ["Target in graph", summary.targetInGraph === null ? "Unknown" : summary.targetInGraph ? "Yes" : "No"]
  ];

  document.querySelector("#summary-grid").innerHTML = metrics
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(String(value))}</strong>
        </article>
      `
    )
    .join("");
}

function renderAlerts(alerts) {
  if (!alertsPanel) {
    return;
  }

  if (!alerts.length) {
    alertsPanel.hidden = true;
    alertsPanel.innerHTML = "";
    return;
  }

  alertsPanel.hidden = false;
  alertsPanel.innerHTML = alerts
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
            <span>Action</span>
            <strong>${escapeHtml(alert.suggestedAction || "Inspect the latest snapshot.")}</strong>
          </div>
        </article>
      `
    )
    .join("");
}

function renderRoutePreview(routePreview) {
  if (!routePreviewContainer) {
    return;
  }

  const hopHints = Array.isArray(routePreview.hopHints) ? routePreview.hopHints : [];
  routePreviewContainer.innerHTML = `
    <div class="route-preview-card" data-status="${escapeHtml(routePreview.status || "unknown")}">
      <div class="route-preview-card__top">
        <div>
          <span class="route-preview-card__eyebrow">${escapeHtml((routePreview.mode || "heuristic").toUpperCase())} PREVIEW</span>
          <strong>${escapeHtml(humanize(routePreview.status || "unknown"))}</strong>
        </div>
        <span class="route-preview-card__metric">Outbound ${escapeHtml(routePreview.estimatedOutbound || "Unknown")}</span>
      </div>
      <p>${escapeHtml(routePreview.blockingReason || routePreview.feeHint || "No preflight blockers were identified from the current snapshot.")}</p>
      <div class="route-preview-card__footer">
        <span>Fee hint</span>
        <strong>${escapeHtml(routePreview.feeHint || "No fee guidance available.")}</strong>
      </div>
      <ul class="route-hop-list">
        ${hopHints.length
          ? hopHints
              .map(
                (hop) => `
                  <li>
                    <span>Hop ${escapeHtml(String(hop.hop))}</span>
                    <strong>${escapeHtml(hop.channelId)}</strong>
                    <p>${escapeHtml(hop.state)} · local ${escapeHtml(hop.localBalance)}</p>
                  </li>
                `
              )
              .join("")
          : '<li><span>Path</span><strong>No hop hints</strong><p>FiberOps did not find open channel candidates in this snapshot.</p></li>'}
      </ul>
    </div>
  `;
}

function renderTimeline() {
  if (!incidentTimeline) {
    return;
  }

  const incidents = readIncidentHistory();
  if (!incidents.length) {
    incidentTimeline.innerHTML = '<div class="timeline-empty">No local incidents yet. Run a demo or live snapshot to start the timeline.</div>';
    return;
  }

  incidentTimeline.innerHTML = incidents
    .map(
      (incident) => `
        <article class="timeline-entry" data-severity="${escapeHtml(incident.severity)}">
          <div class="timeline-entry__rail"></div>
          <div class="timeline-entry__body">
            <div class="timeline-entry__top">
              <span>${escapeHtml(formatTimestamp(incident.timestamp))}</span>
              <span>${escapeHtml(incident.source.toUpperCase())}</span>
            </div>
            <strong>${escapeHtml(incident.headline)}</strong>
            <p>${escapeHtml(humanize(incident.category))} · ${escapeHtml(incident.endpointOrScenario || "Unknown target")}</p>
            <div class="timeline-entry__meta">
              <span>${escapeHtml(incident.summary.paymentStatus || "No payment state")}</span>
              <span>${escapeHtml(incident.summary.estimatedOutbound || "No outbound estimate")}</span>
              <span>${escapeHtml(humanize(incident.summary.paymentReadiness || "unknown"))}</span>
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

function appendIncident(event, summary, diagnosis, scenario) {
  if (!event?.id) {
    return;
  }

  const history = readIncidentHistory().filter((item) => item.id !== event.id);
  history.unshift({
    id: event.id,
    timestamp: event.timestamp,
    severity: event.severity,
    category: event.category,
    headline: event.headline,
    source: event.source,
    endpointOrScenario: scenario?.name || event.endpoint || event.scenarioId || "Unknown",
    summary: {
      paymentStatus: summary?.paymentStatus || null,
      estimatedOutbound: summary?.estimatedOutbound || null,
      paymentReadiness: summary?.paymentReadiness || null
    },
    diagnosis: {
      category: diagnosis?.category || null
    }
  });

  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
}

function readIncidentHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderChecks(checks) {
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

function renderEvidence(items) {
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

function renderActions(actions) {
  document.querySelector("#actions-list").innerHTML = actions
    .map((action) => `<li>${escapeHtml(action)}</li>`)
    .join("");
}

function renderReferences(references) {
  document.querySelector("#references-list").innerHTML = references
    .map(
      (reference) => `
        <li><a href="${reference.url}" target="_blank" rel="noreferrer">${escapeHtml(reference.label)}</a></li>
      `
    )
    .join("");
}

function formDataToObject(formData) {
  const payload = Object.fromEntries(formData.entries());

  if (payload.mode !== "live") {
    delete payload.endpoint;
    delete payload.token;
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => typeof value !== "string" || value.trim() !== "")
  );
}

function humanize(value) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTimestamp(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function valueOrDash(value) {
  return value === null || value === undefined ? "Unknown" : String(value);
}
