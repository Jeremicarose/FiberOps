import { requestApi } from "./app/api.js";
import { BOOTSTRAP_FALLBACK, createInitialState } from "./app/constants.js";
import { getDom } from "./app/dom.js";
import { appendIncident, installHistorySync } from "./app/history.js";
import {
  fillScenarios,
  renderActions,
  renderAlerts,
  renderChecks,
  renderComparison,
  renderContextBanner,
  renderEvidence,
  renderLabFacts,
  renderLivePresets,
  renderLiveStory,
  renderMultiNode,
  renderReferences,
  renderRoutePreview,
  renderScenarioDescription,
  renderServerHistory,
  renderSummary,
  renderTimeline,
  updateBootstrapState
} from "./app/renderers.js";
import { escapeHtml, humanize } from "./app/utils.js";

const state = createInitialState();
const dom = getDom();

void boot();

async function boot() {
  bindEvents();
  setMode("demo");
  setWorkspaceTab("guided");
  renderTimeline(dom);

  try {
    const bootstrap = await requestApi("/api/bootstrap");
    state.bootstrap = { ...BOOTSTRAP_FALLBACK, ...bootstrap };
    updateBootstrapState(state, dom, "ready");
  } catch (error) {
    state.bootstrap = { ...BOOTSTRAP_FALLBACK };
    state.bootstrapError = error;
    updateBootstrapState(state, dom, "failed", error);
    renderFailure(
      {
        ...error,
        headline: "The app could not load its initial API contract"
      },
      {
        routePreview: { status: "degraded", mode: "heuristic", limitations: [] }
      }
    );
  }

  syncBootstrapIntoUi();
}

function bindEvents() {
  dom.form.addEventListener("submit", onSubmit);
  dom.scenarioSelect.addEventListener("change", () =>
    renderScenarioDescription(state, dom)
  );

  dom.modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.modeButton));
  });

  dom.workspaceTabs.forEach((button) => {
    button.addEventListener("click", () =>
      setWorkspaceTab(button.dataset.workspaceTab)
    );
  });

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-live-preset]");
    if (!trigger) {
      return;
    }

    const presetId = trigger.dataset.livePreset;
    const preset = state.bootstrap?.livePresets?.find(
      (item) => item.id === presetId
    );
    if (!preset) {
      return;
    }

    applyPreset(preset);
  });

  installHistorySync(() => renderTimeline(dom));
}

function syncBootstrapIntoUi() {
  const bootstrap = state.bootstrap || BOOTSTRAP_FALLBACK;
  fillScenarios(dom, bootstrap.scenarios || []);
  renderScenarioDescription(state, dom);
  renderLiveStory(dom, bootstrap.liveStory || [], bootstrap.livePresets || []);
  renderLivePresets(state, dom, bootstrap.livePresets || []);
  renderLabFacts(dom, bootstrap.localLab || bootstrap.environmentFacts || null);
  renderContextBanner(state, dom);

  const endpointField = dom.form.elements.endpoint;
  if (endpointField && !endpointField.value) {
    endpointField.value =
      bootstrap.defaultEndpoint || BOOTSTRAP_FALLBACK.defaultEndpoint;
  }
}

function setMode(mode) {
  state.mode = mode === "live" ? "live" : "demo";
  dom.form.elements.mode.value = state.mode;

  dom.modeButtons.forEach((button) => {
    button.classList.toggle(
      "is-active",
      button.dataset.modeButton === state.mode
    );
  });

  dom.visibilityFields.forEach((field) => {
    field.hidden = field.dataset.visibility !== state.mode;
  });

  renderLivePresets(state, dom, state.bootstrap?.livePresets || []);
}

function setWorkspaceTab(tabId) {
  state.activeWorkspaceTab = tabId;
  dom.workspaceTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.workspaceTab === tabId);
  });
  dom.workspacePanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.workspacePanel === tabId);
    panel.hidden = panel.dataset.workspacePanel !== tabId;
  });
}

function applyPreset(preset) {
  state.activePreset = preset;
  renderContextBanner(state, dom);
  setMode(preset.payload?.mode || "live");

  for (const [key, value] of Object.entries(preset.payload || {})) {
    const field = dom.form.elements[key];
    if (field) {
      field.value = value ?? "";
    }
  }

  if (preset.payload?.scenarioId) {
    dom.scenarioSelect.value = preset.payload.scenarioId;
    renderScenarioDescription(state, dom);
  }

  setWorkspaceTab("manual");
}

async function onSubmit(event) {
  event.preventDefault();

  const payload = formDataToObject(new FormData(dom.form));
  state.lastSubmittedPayload = globalThis.structuredClone(payload);
  const requestId = ++state.activeRequestId;

  if (state.activeAbortController) {
    state.activeAbortController.abort();
  }

  const abortController = new globalThis.AbortController();
  state.activeAbortController = abortController;
  dom.submitButton.disabled = true;
  dom.submitButton.textContent = "Running…";
  dom.resultStatus.textContent = "Running";
  setWorkspaceTab("results");

  try {
    const result = await requestApi("/api/diagnose", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: abortController.signal
    });

    if (requestId !== state.activeRequestId) {
      return;
    }

    renderResult(result, payload);
    appendIncident(
      result.event,
      result.summary,
      result.diagnosis,
      result.scenario
    );
    renderTimeline(dom);
  } catch (error) {
    if (error?.aborted || requestId !== state.activeRequestId) {
      return;
    }
    renderFailure(error, payload);
  } finally {
    if (requestId === state.activeRequestId) {
      state.activeAbortController = null;
      dom.submitButton.disabled = false;
      dom.submitButton.textContent = "Run FiberOps";
    }
  }
}

function renderResult(result, submittedPayload) {
  dom.resultEmpty.hidden = true;
  dom.resultContent.hidden = false;
  dom.resultStatus.textContent = humanize(result.diagnosis.severity || "info");
  document.querySelector("#result-headline").textContent =
    result.diagnosis.headline;
  document.querySelector("#result-explanation").textContent =
    result.diagnosis.explanation;

  renderSummary(dom, result.summary || {});
  renderChecks(result.diagnosis.checks || []);
  renderEvidence(result.diagnosis.evidence || []);
  renderActions(dom, result.diagnosis.nextActions || []);
  renderReferences(result.diagnosis.references || []);
  renderAlerts(dom, result.alerts || []);
  renderRoutePreview(dom, result.routePreview || {}, submittedPayload);
  renderMultiNode(dom, result.nodes || [], result.summary?.multiNode || null);
  renderComparison(dom, result.history || null);
  renderServerHistory(dom, result.history || null);
}

function renderFailure(error, submittedPayload) {
  dom.resultEmpty.hidden = true;
  dom.resultContent.hidden = false;
  dom.resultStatus.textContent = humanize(error.code || "request_failed");
  document.querySelector("#result-headline").textContent =
    error.headline || "The diagnostics request could not be completed";
  document.querySelector("#result-explanation").textContent =
    error.message || "Unknown failure.";
  document.querySelector("#summary-grid").innerHTML = "";
  document.querySelector("#checks-list").innerHTML = `
    <li class="status-item">
      <span class="status-dot status-dot--fail"></span>
      <div>
        <strong>${escapeHtml(humanize(error.code || "request_failed"))}</strong>
        <p>${escapeHtml(error.message || "Unknown failure.")}</p>
      </div>
    </li>
  `;
  document.querySelector("#evidence-list").innerHTML = "";
  document.querySelector("#actions-list").innerHTML = "";
  document.querySelector("#references-list").innerHTML = "";
  renderAlerts(dom, []);
  renderRoutePreview(
    dom,
    {
      status: "degraded",
      mode: "heuristic",
      blockingReason: error.message,
      limitations: [
        "No complete backend result was returned for this request."
      ],
      requestedAmount: submittedPayload?.amount || null
    },
    submittedPayload
  );
  renderMultiNode(dom, [], null);
  renderComparison(dom, null);
  renderServerHistory(dom, null);
}

function formDataToObject(formData) {
  return Object.fromEntries(
    Array.from(formData.entries())
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() : value
      ])
      .filter(([, value]) => value !== "")
  );
}
