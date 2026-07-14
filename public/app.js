import { requestApi } from "./app/api.js";
import {
  BOOTSTRAP_FALLBACK,
  DOCK_TABS,
  WORKSPACE_META,
  WORKSPACES,
  createInitialState
} from "./app/constants.js";
import { getDom } from "./app/dom.js";
import {
  appendIncident,
  installHistorySync,
  readIncidentHistory
} from "./app/history.js";
import {
  renderActivity,
  renderChannels,
  renderConfiguration,
  renderDiagnostics,
  renderLogs,
  renderNodes,
  renderOverview,
  renderPayments,
  renderReports,
  renderRouting,
  renderTesting
} from "./app/renderers/index.js";
import {
  createActivityViewModel,
  createChannelsViewModel,
  createDiagnosticsViewModel,
  createLogsViewModel,
  createNodesViewModel,
  createOverviewViewModel,
  createPaymentsViewModel,
  createReportsViewModel,
  createRoutingViewModel
} from "./app/view-models/index.js";
import {
  escapeHtml,
  formatTimestamp,
  humanize,
  shortenHash
} from "./app/utils.js";
import {
  renderEmptyState,
  renderInspectorBody,
  renderInspectorSection,
  renderKeyValueList,
  renderTimelineItems
} from "./app/renderers/shared.js";

const STORAGE_KEY = "fiberops:desktop-state";
const COMMAND_LIMIT = 24;
const MAX_RECENT_COMMANDS = 8;
const MAX_NOTIFICATION_ITEMS = 24;
const MAX_TOASTS = 3;
const TOAST_DURATION_MS = 2600;
const VIEWPORT_WIDE_QUERY = "(min-width: 1180px)";
const DOCK_VISIBLE_WORKSPACES = new Set();
const WORKSPACE_SHORTCUTS = {
  1: "overview",
  2: "nodes",
  3: "channels",
  4: "payments",
  5: "routing",
  6: "diagnostics",
  7: "activity",
  8: "logs",
  9: "testing"
};

const state = createInitialState();
const dom = getDom(state);
let disposeHistorySync = null;
let globalEventsBound = false;
let viewportWideMedia = null;
let themeMedia = null;
let lastFocusedElement = null;
let pendingFocusRowId = null;

void boot();

async function boot() {
  restoreUiState();
  bindThemeMedia();
  applyTheme();
  bindEvents();
  syncInspectorDockModeForViewport();
  render();

  try {
    const bootstrap = await requestApi("/api/bootstrap");
    state.bootstrap = { ...BOOTSTRAP_FALLBACK, ...bootstrap };
    state.bootstrapState = "ready";
    state.environment = state.bootstrap.environmentFacts || state.environment;
    seedDraftsFromBootstrap();
  } catch (error) {
    state.bootstrap = { ...BOOTSTRAP_FALLBACK };
    state.bootstrapError = error;
    state.bootstrapState = "failed";
    state.ui.error = error;
    pushNotification({
      kind: "warning",
      title: "Bootstrap degraded",
      message: error?.message || "Initial payload unavailable.",
      source: "bootstrap"
    });
  }

  await refreshWorkspaceData();
  render();

  if (state.bootstrapState === "failed") {
    state.lastDiagnosisResult = null;
  }
}

function bindEvents() {
  dom.navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveWorkspace(button.dataset.navWorkspace);
    });
  });

  dom.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setMode(button.dataset.modeButton);
    });
  });
  dom.themeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setTheme(button.dataset.themeButton);
    });
  });

  if (!globalEventsBound) {
    dom.commandPaletteButton?.addEventListener("click", openCommandPalette);
    dom.commandQuery?.addEventListener("input", () => {
      state.ui.commandPaletteIndex = 0;
      renderCommandPaletteResults();
    });
    dom.commandResults?.addEventListener("click", onCommandPaletteClick);
    dom.commandResults?.addEventListener("mousemove", onCommandResultHover);
    dom.commandPalette?.addEventListener("close", onCommandPaletteClose);
    dom.notificationButton?.addEventListener("click", toggleNotificationsTray);
    dom.notificationTrayList?.addEventListener(
      "click",
      onNotificationTrayClick
    );
    dom.inspectorCloseButton?.addEventListener("click", closeInspector);
    dom.inspectorToggleButton?.addEventListener(
      "click",
      toggleInspectorDockMode
    );
    dom.dockTabButtons?.forEach((button) => {
      button.addEventListener("click", () => {
        setDockTab(button.dataset.dockTab);
      });
    });
    dom.dockToggleButton?.addEventListener("click", toggleDockPanel);

    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onDocumentKeydown);
    dom.workspaceRoot.addEventListener("click", onWorkspaceClick);
    dom.workspaceRoot.addEventListener("submit", onWorkspaceSubmit);
    dom.workspaceRoot.addEventListener("change", onWorkspaceChange);
    dom.workspaceRoot.addEventListener("keydown", onWorkspaceRowKeydown);
    globalEventsBound = true;
  }

  if (!viewportWideMedia) {
    viewportWideMedia = globalThis.matchMedia?.(VIEWPORT_WIDE_QUERY) || null;
    viewportWideMedia?.addEventListener?.("change", () => {
      syncInspectorDockModeForViewport();
      render();
    });
  }

  disposeHistorySync?.();
  disposeHistorySync = installHistorySync(() => {
    syncActivitySnapshot();
    render();
  });
}

function bindThemeMedia() {
  if (themeMedia || !globalThis.matchMedia) {
    return;
  }

  themeMedia = globalThis.matchMedia("(prefers-color-scheme: dark)");
  themeMedia.addEventListener?.("change", () => {
    if (state.ui.theme === "system") {
      applyTheme();
      render();
    }
  });
}

function applyTheme() {
  const resolvedTheme =
    state.ui.theme === "system"
      ? themeMedia?.matches
        ? "dark"
        : "light"
      : state.ui.theme;

  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themePreference = state.ui.theme;
}

function onWorkspaceClick(event) {
  const dockTabTrigger = event.target.closest("[data-dock-tab]");
  if (dockTabTrigger) {
    setDockTab(dockTabTrigger.dataset.dockTab);
    return;
  }

  const navTrigger = event.target.closest("[data-nav-workspace]");
  if (navTrigger) {
    setActiveWorkspace(navTrigger.dataset.navWorkspace);
    return;
  }

  const quickActionTrigger = event.target.closest("[data-quick-action]");
  if (quickActionTrigger) {
    runQuickAction(quickActionTrigger.dataset.quickAction);
    return;
  }

  const presetTrigger = event.target.closest("[data-live-preset]");
  if (presetTrigger) {
    const preset = state.bootstrap?.livePresets?.find(
      (item) => item.id === presetTrigger.dataset.livePreset
    );
    if (preset) {
      applyPreset(preset);
    }
    return;
  }

  const configTrigger = event.target.closest("[data-config-test]");
  if (configTrigger) {
    setActiveWorkspace("diagnostics");
    render();
    return;
  }

  const reportExportTrigger = event.target.closest("[data-report-export]");
  if (reportExportTrigger) {
    exportReport(reportExportTrigger.dataset.reportExport);
    return;
  }

  const demoScenarioTrigger = event.target.closest("[data-demo-scenario]");
  if (demoScenarioTrigger) {
    runDemoScenario(demoScenarioTrigger.dataset.demoScenario);
    return;
  }

  const row = event.target.closest("tr[data-row-id]");
  if (row) {
    handleRowSelection(row.dataset.rowId);
  }
}

function onDocumentClick(event) {
  if (
    state.ui.notificationsTrayOpen &&
    !event.target.closest("#notification-tray") &&
    !event.target.closest("#notification-button")
  ) {
    state.ui.notificationsTrayOpen = false;
    render();
  }
}

function onDocumentKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openCommandPalette();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
    event.preventDefault();
    toggleInspector();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
    event.preventDefault();
    toggleNotificationsTray();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.altKey) {
    const workspace = WORKSPACE_SHORTCUTS[event.key];
    if (workspace) {
      event.preventDefault();
      setActiveWorkspace(workspace);
      return;
    }
  }

  if (dom.commandPalette?.open) {
    if (event.key === "Escape") {
      dom.commandPalette.close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveCommandPaletteSelection(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveCommandPaletteSelection(-1);
      return;
    }
    if (event.key === "Enter") {
      const activeEntry =
        getVisibleCommandEntries()[state.ui.commandPaletteIndex];
      if (activeEntry) {
        event.preventDefault();
        executeCommandEntry(activeEntry);
      }
    }
    return;
  }

  if (event.key === "Escape") {
    if (state.ui.notificationsTrayOpen) {
      state.ui.notificationsTrayOpen = false;
      render();
      return;
    }
    if (state.ui.inspector.open) {
      closeInspector();
    }
  }
}

function onWorkspaceRowKeydown(event) {
  const row = event.target.closest("tr[data-row-id]");
  if (!row) {
    return;
  }

  const rows = Array.from(
    row.closest("tbody")?.querySelectorAll('tr[data-row-id][role="button"]') ||
      []
  );
  const index = rows.indexOf(row);

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    handleRowSelection(row.dataset.rowId);
    return;
  }

  if (event.key === "ArrowDown" && index < rows.length - 1) {
    event.preventDefault();
    rows[index + 1]?.focus();
    return;
  }

  if (event.key === "ArrowUp" && index > 0) {
    event.preventDefault();
    rows[index - 1]?.focus();
  }
}

function onWorkspaceChange(event) {
  const form = event.target.closest("form");
  if (!form) {
    return;
  }

  if (form.id === "diagnostics-form") {
    const modeSelect = form.elements["mode-select"];
    if (modeSelect) {
      setMode(modeSelect.value);
    }
    persistDiagnosticsDraft(new FormData(form));
    render();
    return;
  }

  if (form.id === "routing-form") {
    persistRoutingDraft(new FormData(form));
    return;
  }

  if (form.id === "configuration-form") {
    const themeSelect = form.elements["theme"];
    if (themeSelect) {
      setTheme(themeSelect.value);
    }
  }
}

async function onWorkspaceSubmit(event) {
  const form = event.target;
  if (!(form instanceof globalThis.HTMLFormElement)) {
    return;
  }

  event.preventDefault();

  if (!form.reportValidity()) {
    return;
  }

  if (form.id === "diagnostics-form") {
    await submitDiagnostics(form);
    return;
  }

  if (form.id === "routing-form") {
    await submitRoutingPreview(form);
  }
}

function restoreUiState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (!saved || typeof saved !== "object") {
      return;
    }

    if (WORKSPACES.includes(saved.activeWorkspace)) {
      state.activeWorkspace = saved.activeWorkspace;
    }
    if (saved.mode === "live" || saved.mode === "demo") {
      state.mode = saved.mode;
    }
    if (saved.diagnosticsDraft && typeof saved.diagnosticsDraft === "object") {
      state.diagnosticsDraft = {
        ...state.diagnosticsDraft,
        ...saved.diagnosticsDraft,
        token: ""
      };
    }
    if (saved.routingDraft && typeof saved.routingDraft === "object") {
      state.routingDraft = {
        ...state.routingDraft,
        ...saved.routingDraft
      };
    }
    if (typeof saved.selectedNodeId === "string") {
      state.selectedNodeId = saved.selectedNodeId;
    }
    if (typeof saved.selectedChannelId === "string") {
      state.selectedChannelId = saved.selectedChannelId;
    }
    if (typeof saved.selectedPaymentId === "string") {
      state.selectedPaymentId = saved.selectedPaymentId;
    }
    if (typeof saved.selectedActivityItemId === "string") {
      state.selectedActivityItemId = saved.selectedActivityItemId;
    }
    if (typeof saved.selectedLogId === "string") {
      state.selectedLogId = saved.selectedLogId;
    }
    if (typeof saved.selectedReportId === "string") {
      state.selectedReportId = saved.selectedReportId;
    }
    if (saved.ui && typeof saved.ui === "object") {
      state.ui.recentCommands = Array.isArray(saved.ui.recentCommands)
        ? saved.ui.recentCommands.slice(0, MAX_RECENT_COMMANDS)
        : [];
      state.ui.dismissedNotificationIds = Array.isArray(
        saved.ui.dismissedNotificationIds
      )
        ? saved.ui.dismissedNotificationIds
        : [];
      if (saved.ui.inspector && typeof saved.ui.inspector === "object") {
        state.ui.inspector = {
          ...state.ui.inspector,
          ...saved.ui.inspector
        };
      }
      if (typeof saved.ui.dockTab === "string") {
        state.ui.dockTab = saved.ui.dockTab;
      }
      if (typeof saved.ui.dockCollapsed === "boolean") {
        state.ui.dockCollapsed = saved.ui.dockCollapsed;
      }
      if (
        saved.ui.theme === "system" ||
        saved.ui.theme === "light" ||
        saved.ui.theme === "dark"
      ) {
        state.ui.theme = saved.ui.theme;
      }
    }
  } catch {
    // ignore persisted state failures
  }
}

function persistUiState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      activeWorkspace: state.activeWorkspace,
      mode: state.mode,
      diagnosticsDraft: {
        ...state.diagnosticsDraft,
        token: ""
      },
      routingDraft: state.routingDraft,
      selectedNodeId: state.selectedNodeId,
      selectedChannelId: state.selectedChannelId,
      selectedPaymentId: state.selectedPaymentId,
      selectedActivityItemId: state.selectedActivityItemId,
      selectedLogId: state.selectedLogId,
      selectedReportId: state.selectedReportId,
      ui: {
        recentCommands: state.ui.recentCommands,
        dismissedNotificationIds: state.ui.dismissedNotificationIds,
        dockTab: state.ui.dockTab,
        dockCollapsed: state.ui.dockCollapsed,
        theme: state.ui.theme,
        inspector: {
          open: state.ui.inspector.open,
          dockMode: state.ui.inspector.dockMode,
          preferredDockMode: state.ui.inspector.preferredDockMode,
          entityType: state.ui.inspector.entityType,
          entityId: state.ui.inspector.entityId
        }
      }
    })
  );
}

function seedDraftsFromBootstrap() {
  const bootstrap = state.bootstrap || BOOTSTRAP_FALLBACK;
  if (!state.diagnosticsDraft.endpoint) {
    state.diagnosticsDraft.endpoint =
      bootstrap.defaultEndpoint || BOOTSTRAP_FALLBACK.defaultEndpoint;
  }
  if (!state.diagnosticsDraft.scenarioId) {
    state.diagnosticsDraft.scenarioId = bootstrap.scenarios?.[0]?.id || "";
  }
}

function setMode(mode) {
  state.mode = mode === "live" ? "live" : "demo";
  persistUiState();
  render();
}

function setTheme(theme) {
  if (!["system", "light", "dark"].includes(theme)) {
    return;
  }
  state.ui.theme = theme;
  applyTheme();
  persistUiState();
  render();
}

function setActiveWorkspace(workspace) {
  if (!WORKSPACES.includes(workspace)) {
    return;
  }
  state.activeWorkspace = workspace;
  state.ui.lastActivityLabel = `Opened ${getWorkspaceMeta(workspace).label}`;
  if (state.ui.notificationsTrayOpen) {
    state.ui.notificationsTrayOpen = false;
  }
  persistUiState();
  render();
  focusSelectedRowIfNeeded();
}

function applyPreset(preset) {
  state.activePreset = preset;
  const payload = preset.payload || {};

  if (payload.mode) {
    state.mode = payload.mode === "live" ? "live" : "demo";
  }

  state.diagnosticsDraft = {
    ...state.diagnosticsDraft,
    scenarioId: payload.scenarioId || state.diagnosticsDraft.scenarioId,
    endpoint: payload.endpoint || state.diagnosticsDraft.endpoint,
    invoice: payload.invoice || "",
    paymentHash: payload.paymentHash || "",
    amount: payload.amount || state.diagnosticsDraft.amount,
    targetPubkey: payload.targetPubkey || state.diagnosticsDraft.targetPubkey
  };

  if (payload.invoice || payload.amount || payload.targetPubkey) {
    state.routingDraft = {
      invoice: payload.invoice || "",
      amount: payload.amount || "",
      targetPubkey: payload.targetPubkey || ""
    };
  }

  state.activeWorkspace = payload.mode === "live" ? "diagnostics" : "testing";
  state.ui.lastActivityLabel = `Applied preset ${preset.name || preset.id}`;
  persistUiState();
  render();
}

function runDemoScenario(scenarioId) {
  const scenario = (state.bootstrap?.scenarios || []).find(
    (item) => item.id === scenarioId
  );
  if (!scenario) {
    pushNotification({
      kind: "warning",
      title: "Scenario unavailable",
      message:
        "This demo scenario is not present in the current bootstrap payload.",
      source: "demo-scenario"
    });
    return;
  }

  state.mode = "demo";
  state.activeWorkspace = "diagnostics";
  state.activePreset = {
    id: scenario.id,
    title: scenario.name,
    description: scenario.description
  };
  state.diagnosticsDraft = {
    ...state.diagnosticsDraft,
    scenarioId: scenario.id,
    endpoint: "",
    token: "",
    invoice: "",
    paymentHash: "",
    amount: "",
    targetPubkey: ""
  };
  state.ui.lastActivityLabel = `Running scenario ${scenario.name}`;
  persistUiState();
  void runCurrentDiagnostics({
    successLabel: scenario.name,
    source: "demo-scenario"
  });
}

async function refreshWorkspaceData() {
  const requests = await Promise.allSettled([
    requestApi("/api/runtime/status"),
    requestApi("/api/environment"),
    requestApi("/api/observability"),
    requestApi("/api/history/status"),
    requestApi("/api/history/recent"),
    requestApi("/api/nodes")
  ]);

  if (requests[0].status === "fulfilled") {
    state.runtimeStatus = requests[0].value;
  }
  if (requests[1].status === "fulfilled") {
    state.environment = requests[1].value;
  }
  if (requests[2].status === "fulfilled") {
    state.observability = requests[2].value;
  }
  if (requests[3].status === "fulfilled") {
    state.historyStatus = requests[3].value;
  }
  const serverRecent =
    requests[4].status === "fulfilled" ? requests[4].value : [];
  if (requests[5].status === "fulfilled") {
    syncNodesSnapshot(requests[5].value);
  }

  syncActivitySnapshot(serverRecent);
}

function syncNodesSnapshot(payload) {
  const snapshot = payload || { nodes: [] };
  state.nodesSnapshot = snapshot;
  if (!state.selectedNodeId) {
    state.selectedNodeId = snapshot.nodes?.[0]?.id || null;
  }

  const channels = [];
  for (const node of snapshot.nodes || []) {
    for (const channel of node.channels || []) {
      channels.push({
        ...channel,
        nodeId: node.id,
        nodeName: node.name,
        endpoint: node.endpoint
      });
    }
  }
  state.channelsSnapshot = { channels };
  if (!state.selectedChannelId) {
    state.selectedChannelId = channels[0]?.id || null;
  }
}

function syncActivitySnapshot(serverRecent = null) {
  const serverItems = Array.isArray(serverRecent)
    ? serverRecent
    : Array.isArray(state.activitySnapshot?.server)
      ? state.activitySnapshot.server
      : [];
  const localItems = readIncidentHistory();

  const normalizedServer = serverItems.map((item, index) => ({
    id: item.event?.id || `server-${index}`,
    timestamp: item.event?.timestamp || Date.now(),
    timestampLabel: formatTimestamp(item.event?.timestamp || Date.now()),
    type: item.diagnosis?.category || "history",
    category: item.diagnosis?.category || "history",
    title:
      item.diagnosis?.headline || item.event?.headline || "Historical record",
    message:
      item.routePreview?.blockingReason ||
      item.summary?.paymentReadiness ||
      "Server-backed diagnostic record",
    readiness: item.summary?.paymentReadiness || item.probe?.status || null,
    probeStatus: item.probe?.status || item.routePreview?.status || null,
    source: "server history",
    severity: item.diagnosis?.severity || item.event?.severity || null,
    tags: [
      item.source || "history",
      item.summary?.routeProof || "no-proof"
    ].filter(Boolean)
  }));

  const normalizedLocal = localItems.map((item) => ({
    id: item.id,
    timestamp: item.timestamp,
    timestampLabel: formatTimestamp(item.timestamp),
    type: item.category || "incident",
    category: item.category || "incident",
    title: item.headline || "Local incident",
    message: item.endpointOrScenario || "Local incident ledger entry",
    readiness: item.summary?.paymentReadiness || null,
    source: "local incidents",
    severity: item.severity || null,
    tags: [item.source || "incident"].filter(Boolean)
  }));

  const merged = [...normalizedServer, ...normalizedLocal]
    .sort(
      (left, right) =>
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
    )
    .slice(0, 50);

  state.activitySnapshot = {
    server: serverItems,
    items: merged
  };

  if (!state.selectedActivityItemId) {
    state.selectedActivityItemId = merged[0]?.id || null;
  }
}

function persistDiagnosticsDraft(formData) {
  state.diagnosticsDraft = {
    scenarioId: String(formData.get("scenarioId") || ""),
    endpoint: String(formData.get("endpoint") || ""),
    token: String(formData.get("token") || ""),
    invoice: String(formData.get("invoice") || ""),
    paymentHash: String(formData.get("paymentHash") || ""),
    amount: String(formData.get("amount") || ""),
    targetPubkey: String(formData.get("targetPubkey") || ""),
    analysisDepth: String(formData.get("analysisDepth") || "standard")
  };
  persistUiState();
}

function persistRoutingDraft(formData) {
  state.routingDraft = {
    targetPubkey: String(formData.get("targetPubkey") || ""),
    amount: String(formData.get("amount") || ""),
    invoice: String(formData.get("invoice") || "")
  };
  persistUiState();
}

async function submitDiagnostics(form) {
  persistDiagnosticsDraft(new FormData(form));
  await runCurrentDiagnostics({
    successLabel:
      state.mode === "demo"
        ? state.activePreset?.title ||
          state.diagnosticsDraft.scenarioId ||
          "demo diagnosis"
        : "live diagnosis",
    source: "diagnostics"
  });
}

async function runCurrentDiagnostics({
  successLabel = "diagnostics",
  source = "diagnostics"
} = {}) {
  const payload = buildDiagnosticsPayload();
  const requestId = beginActiveRequest();
  state.ui.loading = true;
  state.ui.error = null;
  render();

  try {
    const result = await requestApi("/api/diagnose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: state.activeAbortController?.signal
    });

    if (!isActiveRequest(requestId)) {
      return;
    }

    state.lastDiagnosisResult = result;
    state.lastExecutionPlan = result.execution || null;
    state.selectedNodeId =
      result.selectedNodeId ||
      result.execution?.selectedNodeId ||
      state.selectedNodeId;
    appendIncident(
      result.event,
      result.summary,
      result.diagnosis,
      result.scenario
    );

    if (Array.isArray(result.nodes) && result.nodes.length > 0) {
      syncNodesSnapshot({
        aggregateStatus:
          result.aggregateStatus || result.execution?.aggregateStatus || null,
        nodes: result.nodes.map((node) => ({
          ...node,
          routeStatus:
            node.routePreview?.status ||
            node.probe?.status ||
            node.summary?.paymentReadiness,
          channels: deriveNodeChannels(node)
        }))
      });
    }

    const serverRelated = await safeRequestHistoryRelated(
      result.event?.id,
      requestId
    );
    if (!isActiveRequest(requestId)) {
      return;
    }
    syncActivitySnapshot(
      serverRelated.recent || state.activitySnapshot.server || []
    );
    state.ui.lastActivityLabel =
      result.diagnosis?.headline || `Completed ${successLabel}`;
    openInspectorForCurrentWorkspace();
    pushNotification({
      kind: toneToNotificationKind(
        result.diagnosis?.severity || result.summary?.paymentReadiness
      ),
      title: "Diagnostics updated",
      message:
        result.diagnosis?.headline ||
        result.summary?.paymentReadiness ||
        `Completed ${successLabel}`,
      source
    });
  } catch (error) {
    if (!isActiveRequest(requestId) || error?.aborted) {
      return;
    }
    state.ui.error = error;
    pushNotification({
      kind: "error",
      title: "Diagnostics request failed",
      message: error?.message || "Unable to complete diagnosis.",
      source
    });
  } finally {
    finishActiveRequest(requestId);
  }
}

async function submitRoutingPreview(form) {
  persistRoutingDraft(new FormData(form));
  const payload = {
    mode: state.mode,
    analysisDepth: state.diagnosticsDraft.analysisDepth || "standard",
    ...(state.mode === "demo" && state.diagnosticsDraft.scenarioId
      ? { scenarioId: state.diagnosticsDraft.scenarioId }
      : {}),
    ...(state.mode === "live" && state.diagnosticsDraft.endpoint
      ? { endpoint: state.diagnosticsDraft.endpoint }
      : {}),
    ...(state.mode === "live" && state.diagnosticsDraft.token
      ? { token: state.diagnosticsDraft.token }
      : {}),
    ...compactObject(state.routingDraft)
  };
  const requestId = beginActiveRequest();
  state.ui.loading = true;
  state.ui.error = null;
  render();

  try {
    const result = await requestApi("/api/routing/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: state.activeAbortController?.signal
    });
    if (!isActiveRequest(requestId)) {
      return;
    }
    state.lastExecutionPlan = result;
    state.ui.lastActivityLabel = "Updated route preview";
    openInspectorForCurrentWorkspace();
    pushNotification({
      kind: toneToNotificationKind(result.routePreview?.status),
      title: "Route preview ready",
      message:
        result.routePreview?.blockingReason ||
        result.routePreview?.status ||
        "Candidate routes updated",
      source: "routing"
    });
  } catch (error) {
    if (!isActiveRequest(requestId) || error?.aborted) {
      return;
    }
    state.ui.error = error;
    pushNotification({
      kind: "error",
      title: "Route preview failed",
      message: error?.message || "Unable to preview route.",
      source: "routing"
    });
  } finally {
    finishActiveRequest(requestId);
  }
}

function buildDiagnosticsPayload() {
  const payload = {
    mode: state.mode,
    analysisDepth: state.diagnosticsDraft.analysisDepth || "standard"
  };

  if (state.mode === "demo") {
    payload.scenarioId = state.diagnosticsDraft.scenarioId;
  }

  for (const [key, value] of Object.entries(state.diagnosticsDraft)) {
    if (key === "scenarioId" && state.mode !== "demo") {
      continue;
    }
    if (key === "analysisDepth") {
      continue;
    }
    if (value) {
      payload[key] = value;
    }
  }

  return compactObject(payload);
}

async function safeRequestHistoryRelated(
  eventId,
  requestId = state.activeRequestId
) {
  if (!eventId || !isActiveRequest(requestId)) {
    return { recent: state.activitySnapshot.server || [], related: [] };
  }
  try {
    const related = await requestApi(
      `/api/history/related?eventId=${encodeURIComponent(eventId)}`
    );
    return isActiveRequest(requestId)
      ? related
      : { recent: state.activitySnapshot.server || [], related: [] };
  } catch {
    return { recent: state.activitySnapshot.server || [], related: [] };
  }
}

function deriveNodeChannels(node) {
  const rawChannels =
    node.context?.channels?.channels ||
    node.context?.channels?.items ||
    node.context?.channels ||
    [];

  if (!Array.isArray(rawChannels)) {
    return [];
  }

  return rawChannels.map((channel, index) => ({
    id:
      channel.channel_id ||
      channel.channelId ||
      channel.id ||
      `${node.id}-channel-${index + 1}`,
    state:
      channel.state?.state_name ||
      channel.state?.stateName ||
      channel.state ||
      channel.status ||
      "unknown",
    capacity: channel.capacity || channel.total_capacity || null,
    localBalance:
      channel.local_balance ||
      channel.localBalance ||
      channel.to_local_amount ||
      channel.balance ||
      null,
    remoteBalance:
      channel.remote_balance ||
      channel.remoteBalance ||
      channel.to_remote_amount ||
      null,
    peerPubkey:
      channel.peer_pubkey ||
      channel.peerPubkey ||
      channel.remote_pubkey ||
      channel.remotePubkey ||
      null,
    routeReadiness: node.summary?.paymentReadiness || null,
    failure: node.error?.message || null
  }));
}

function beginActiveRequest() {
  state.activeAbortController?.abort();
  state.activeAbortController = new globalThis.AbortController();
  state.activeRequestId += 1;
  return state.activeRequestId;
}

function isActiveRequest(requestId) {
  return requestId === state.activeRequestId;
}

function finishActiveRequest(requestId) {
  if (!isActiveRequest(requestId)) {
    return;
  }

  state.activeAbortController = null;
  state.ui.loading = false;
  render();
}

function handleRowSelection(rowId) {
  if (state.activeWorkspace === "nodes") {
    state.selectedNodeId = rowId;
  } else if (state.activeWorkspace === "channels") {
    state.selectedChannelId = rowId;
  } else if (state.activeWorkspace === "payments") {
    state.selectedPaymentId = rowId;
  } else if (state.activeWorkspace === "activity") {
    state.selectedActivityItemId = rowId;
  } else if (state.activeWorkspace === "logs") {
    state.selectedLogId = rowId;
  } else if (state.activeWorkspace === "reports") {
    state.selectedReportId = rowId;
  }

  openInspectorForCurrentWorkspace();
  state.ui.lastActivityLabel = `Selected ${rowId}`;
  persistUiState();
  render();
}

function render() {
  updateChrome();

  switch (state.activeWorkspace) {
    case "overview":
      renderOverview(dom, createOverviewViewModel(state));
      break;
    case "nodes":
      renderNodes(dom, createNodesViewModel(state));
      break;
    case "channels":
      renderChannels(dom, createChannelsViewModel(state));
      break;
    case "payments":
      renderPayments(dom, createPaymentsViewModel(state));
      break;
    case "routing":
      renderRouting(dom, createRoutingViewModel(state));
      break;
    case "diagnostics":
      renderDiagnostics(dom, createDiagnosticsViewModel(state));
      break;
    case "activity":
      renderActivity(dom, createActivityViewModel(state));
      break;
    case "logs":
      renderLogs(dom, createLogsViewModel(state));
      break;
    case "testing":
      renderTesting(dom, state);
      break;
    case "reports":
      renderReports(dom, createReportsViewModel(state));
      break;
    case "configuration":
      renderConfiguration(dom, state);
      break;
    default:
      renderOverview(dom, createOverviewViewModel(state));
  }

  renderInspector();
  renderNotificationsTray();
  renderToasts();
  renderCommandPaletteResults();
  renderDockPanel();
  focusSelectedRowIfNeeded();
}

function updateChrome() {
  dom.navButtons.forEach((button) => {
    button.classList.toggle(
      "is-active",
      button.dataset.navWorkspace === state.activeWorkspace
    );
  });
  dom.modeButtons.forEach((button) => {
    button.classList.toggle(
      "is-active",
      button.dataset.modeButton === state.mode
    );
  });
  dom.themeButtons.forEach((button) => {
    button.classList.toggle(
      "is-active",
      button.dataset.themeButton === state.ui.theme
    );
  });

  dom.dockTabButtons?.forEach((button) => {
    button.classList.toggle(
      "is-active",
      button.dataset.dockTab === state.ui.dockTab
    );
  });
  dom.dockPanel?.classList.toggle("is-collapsed", state.ui.dockCollapsed);
  if (dom.dockToggleButton) {
    dom.dockToggleButton.textContent = state.ui.dockCollapsed
      ? "Expand"
      : "Collapse";
  }

  const bootstrapReady = state.bootstrapState === "ready";
  const badgeLabel =
    state.bootstrapState === "failed"
      ? "Degraded"
      : bootstrapReady
        ? "Ready"
        : "Bootstrapping";
  dom.bootstrapBadge.textContent = badgeLabel;
  dom.bootstrapBadge.dataset.bootstrapState = state.bootstrapState;
  dom.bootstrapMessage.textContent =
    state.bootstrapState === "failed"
      ? `Bootstrap degraded: ${
          state.bootstrapError?.message || "initial payload unavailable"
        }.`
      : bootstrapReady
        ? "Connected. Node, payment, routing, and history surfaces are ready."
        : "Loading bootstrap payload and runtime context.";
  dom.bootstrapMessage.dataset.bootstrapState = state.bootstrapState;

  const workspaceMeta = getWorkspaceMeta(state.activeWorkspace);
  const runtime = state.runtimeStatus || {};
  const observability = state.observability || runtime.observability || {};
  const recentErrors = observability.requests?.recent?.errors || 0;
  const unreadNotifications = getUnreadNotifications().length;
  const lastNotification = state.ui.notifications.find((item) => !item.read);
  const summaryMessage = state.ui.loading
    ? "Refreshing runtime and workspace state"
    : state.bootstrapState === "failed"
      ? "Degraded bootstrap · cached workspace context stays available"
      : recentErrors > 0
        ? `${recentErrors} recent request error(s) · inspect notifications`
        : state.ui.lastActivityLabel ||
          `${workspaceMeta.label} workspace ready`;

  dom.statusSummary.textContent = summaryMessage;
  if (dom.workspaceLabel) {
    dom.workspaceLabel.textContent = workspaceMeta.label;
  }
  if (dom.workspaceDescription) {
    dom.workspaceDescription.textContent = workspaceMeta.description;
  }
  dom.statusEnvironment.textContent =
    state.environment?.name ||
    state.bootstrap?.environmentFacts?.name ||
    "Unknown";
  dom.statusConnection.textContent = humanize(
    state.lastDiagnosisResult?.summary?.paymentReadiness ||
      state.nodesSnapshot?.aggregateStatus ||
      state.bootstrapState
  );
  dom.statusSync.textContent = state.ui.loading
    ? "Refreshing"
    : lastNotification
      ? shortenHash(lastNotification.title, 20)
      : "Idle";
  dom.statusNotifications.textContent = String(unreadNotifications);
  dom.notificationButton?.setAttribute(
    "aria-expanded",
    String(state.ui.notificationsTrayOpen)
  );
  dom.notificationButton?.classList.toggle(
    "is-active",
    state.ui.notificationsTrayOpen
  );
  if (dom.commandPaletteButton) {
    dom.commandPaletteButton.title = "Search everywhere (⌘K / Ctrl+K)";
  }
}

function openCommandPalette() {
  lastFocusedElement = document.activeElement;
  state.ui.commandPaletteOpen = true;
  state.ui.commandPaletteIndex = 0;
  dom.commandPalette?.showModal();
  renderCommandPaletteResults();
  globalThis.queueMicrotask(() => dom.commandQuery?.focus());
}

function onCommandPaletteClose() {
  state.ui.commandPaletteOpen = false;
  state.ui.commandPaletteIndex = 0;
  if (dom.commandQuery) {
    dom.commandQuery.value = "";
  }
  renderCommandPaletteResults();
  restoreFocus();
}

function moveCommandPaletteSelection(direction) {
  const entries = getVisibleCommandEntries();
  if (!entries.length) {
    state.ui.commandPaletteIndex = 0;
    renderCommandPaletteResults();
    return;
  }
  const nextIndex =
    (state.ui.commandPaletteIndex + direction + entries.length) %
    entries.length;
  state.ui.commandPaletteIndex = nextIndex;
  renderCommandPaletteResults();
}

function onCommandResultHover(event) {
  const item = event.target.closest("[data-command-index]");
  if (!item) {
    return;
  }
  state.ui.commandPaletteIndex = Number(item.dataset.commandIndex || 0);
  renderCommandPaletteResults();
}

function renderCommandPaletteResults() {
  if (!dom.commandResults) {
    return;
  }
  const entries = getVisibleCommandEntries();
  const activeIndex = Math.min(
    state.ui.commandPaletteIndex,
    Math.max(entries.length - 1, 0)
  );
  state.ui.commandPaletteIndex = activeIndex;

  if (!entries.length) {
    dom.commandResults.innerHTML = renderEmptyState(
      "No matching commands",
      "Try a workspace, node name, endpoint, history item, or action keyword."
    );
    return;
  }

  const grouped = entries.reduce((accumulator, entry, index) => {
    const key = entry.group || "Other";
    if (!accumulator[key]) {
      accumulator[key] = [];
    }
    accumulator[key].push({ entry, index });
    return accumulator;
  }, {});

  dom.commandResults.innerHTML = Object.entries(grouped)
    .map(
      ([group, items]) => `
        <section class="command-group">
          <div class="command-group__label">${escapeHtml(group)}</div>
          <div class="command-group__items">
            ${items
              .map(
                ({ entry, index }) => `
                  <button
                    type="button"
                    class="command-result ${index === activeIndex ? "is-active" : ""}"
                    data-command-index="${index}"
                    data-command-action="${escapeHtml(entry.action)}"
                    data-command-value="${escapeHtml(entry.value || "")}"
                    data-command-meta="${escapeHtml(entry.meta || "")}"
                    role="option"
                    aria-selected="${String(index === activeIndex)}"
                  >
                    <div class="command-result__top">
                      <strong>${escapeHtml(entry.label)}</strong>
                      ${entry.shortcut ? `<span class="command-result__shortcut">${escapeHtml(entry.shortcut)}</span>` : ""}
                    </div>
                    <span>${escapeHtml(entry.detail)}</span>
                  </button>
                `
              )
              .join("")}
          </div>
        </section>
      `
    )
    .join("");

  dom.commandResults
    .querySelector('[data-command-index="' + activeIndex + '"]')
    ?.scrollIntoView({ block: "nearest" });
}

function onCommandPaletteClick(event) {
  const item = event.target.closest("[data-command-index]");
  if (!item) {
    return;
  }
  const entry =
    getVisibleCommandEntries()[Number(item.dataset.commandIndex || 0)];
  if (entry) {
    executeCommandEntry(entry);
  }
}

function executeCommandEntry(entry) {
  rememberRecentCommand(entry);

  if (entry.action === "workspace") {
    setActiveWorkspace(entry.value);
  } else if (entry.action === "node") {
    state.selectedNodeId = entry.value;
    setActiveWorkspace("nodes");
    openInspectorForEntity("node", entry.value, true);
  } else if (entry.action === "channel") {
    state.selectedChannelId = entry.value;
    setActiveWorkspace("channels");
    openInspectorForEntity("channel", entry.value, true);
  } else if (entry.action === "payment") {
    state.selectedPaymentId = entry.value;
    setActiveWorkspace("payments");
    openInspectorForEntity("payment", entry.value, true);
  } else if (entry.action === "activity") {
    state.selectedActivityItemId = entry.value;
    setActiveWorkspace("activity");
    openInspectorForEntity("activity", entry.value, true);
  } else if (entry.action === "log") {
    state.selectedLogId = entry.value;
    setActiveWorkspace("logs");
    openInspectorForEntity("log", entry.value, true);
  } else if (entry.action === "report") {
    state.selectedReportId = entry.value;
    setActiveWorkspace("reports");
    openInspectorForEntity("report", entry.value, true);
  } else if (entry.action === "copy") {
    copyToClipboard(entry.value || "", entry.label);
  } else if (entry.action === "quick-action") {
    runQuickAction(entry.value, { fromPalette: true });
  } else if (entry.action === "open-notifications") {
    state.ui.notificationsTrayOpen = true;
    render();
  }

  dom.commandPalette?.close();
}

function buildCommandEntries() {
  const entries = [];

  for (const recent of state.ui.recentCommands) {
    entries.push({
      ...recent,
      group: "Recent",
      detail: recent.detail || "Recent command"
    });
  }

  for (const workspace of WORKSPACES) {
    const workspaceMeta = getWorkspaceMeta(workspace);
    entries.push({
      action: "workspace",
      value: workspace,
      label: `Open ${workspaceMeta.label}`,
      detail: workspaceMeta.description,
      group: "Workspaces"
    });
  }

  for (const node of state.nodesSnapshot?.nodes || []) {
    entries.push({
      action: "node",
      value: node.id,
      label: `Inspect ${node.name}`,
      detail: node.endpoint || "Configured node",
      group: "Nodes"
    });
    if (node.endpoint) {
      entries.push({
        action: "copy",
        value: node.endpoint,
        label: `Copy endpoint for ${node.name}`,
        detail: node.endpoint,
        group: "Copy"
      });
    }
  }

  for (const channel of state.channelsSnapshot?.channels || []) {
    entries.push({
      action: "channel",
      value: channel.id,
      label: `Inspect channel ${shortenHash(channel.id || "channel", 16)}`,
      detail: `${channel.nodeName || "Unknown node"} · ${humanize(channel.state || "unknown")}`,
      group: "Actions"
    });
  }

  for (const payment of createPaymentsViewModel(state).rows.slice(0, 8)) {
    entries.push({
      action: "payment",
      value: payment.id,
      label: `Inspect payment ${payment.cells.payment?.text || payment.id}`,
      detail: payment.cells.reason?.text || "Payment history item",
      group: "Payments"
    });
  }

  for (const item of (state.activitySnapshot?.items || []).slice(0, 8)) {
    entries.push({
      action: "activity",
      value: item.id,
      label: item.title,
      detail: `${item.timestampLabel} · ${humanize(item.source || "activity")}`,
      group: "Activity"
    });
  }

  for (const log of createLogsViewModel(state).rows.slice(0, 6)) {
    entries.push({
      action: "log",
      value: log.id,
      label: `Inspect log ${log.cells.subsystem?.text || log.id}`,
      detail: log.cells.message?.text || "Runtime event",
      group: "Logs"
    });
  }

  for (const report of createReportsViewModel(state).rows) {
    entries.push({
      action: "report",
      value: report.id,
      label: report.cells.report?.text || "Open report",
      detail: report.cells.summary?.text || "Exportable report",
      group: "Reports"
    });
  }

  const quickActions = createOverviewViewModel(state).quickActions || [];
  for (const action of quickActions) {
    entries.push({
      action: "quick-action",
      value: action.id,
      label: action.label,
      detail: action.detail,
      group: "Actions"
    });
  }

  entries.push({
    action: "open-notifications",
    value: "notifications",
    label: "Open notifications tray",
    detail: `${getUnreadNotifications().length} unread`,
    group: "Actions"
  });

  if (state.diagnosticsDraft.targetPubkey) {
    entries.push({
      action: "copy",
      value: state.diagnosticsDraft.targetPubkey,
      label: "Copy target pubkey",
      detail: shortenHash(state.diagnosticsDraft.targetPubkey, 30),
      group: "Copy"
    });
  }

  if (state.routingDraft.invoice) {
    entries.push({
      action: "copy",
      value: state.routingDraft.invoice,
      label: "Copy route invoice",
      detail: "Current routing draft",
      group: "Copy"
    });
  }

  return dedupeCommandEntries(entries);
}

function getVisibleCommandEntries() {
  const query = String(dom.commandQuery?.value || "")
    .trim()
    .toLowerCase();

  return buildCommandEntries()
    .filter((entry) => {
      if (!query) {
        return true;
      }
      return `${entry.label} ${entry.detail} ${entry.group}`
        .toLowerCase()
        .includes(query);
    })
    .slice(0, COMMAND_LIMIT);
}

function dedupeCommandEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.action}:${entry.value}:${entry.label}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function rememberRecentCommand(entry) {
  const normalized = {
    action: entry.action,
    value: entry.value,
    label: entry.label,
    detail: entry.detail,
    group: entry.group
  };
  state.ui.recentCommands = [
    normalized,
    ...state.ui.recentCommands.filter((item) => {
      return !(
        item.action === normalized.action && item.value === normalized.value
      );
    })
  ].slice(0, MAX_RECENT_COMMANDS);
  persistUiState();
}

function runQuickAction(actionId, options = {}) {
  switch (actionId) {
    case "go-diagnostics":
      setActiveWorkspace("diagnostics");
      state.ui.lastActivityLabel = "Opened diagnostics with current draft";
      break;
    case "go-payments":
      setActiveWorkspace("payments");
      openInspectorForEntity(
        "payment",
        state.selectedPaymentId ||
          createPaymentsViewModel(state).selected?.id ||
          null,
        true
      );
      state.ui.lastActivityLabel = "Opened payment history";
      break;
    case "go-routing":
      if (
        state.diagnosticsDraft.targetPubkey &&
        !state.routingDraft.targetPubkey
      ) {
        state.routingDraft.targetPubkey = state.diagnosticsDraft.targetPubkey;
      }
      if (state.diagnosticsDraft.amount && !state.routingDraft.amount) {
        state.routingDraft.amount = state.diagnosticsDraft.amount;
      }
      if (state.diagnosticsDraft.invoice && !state.routingDraft.invoice) {
        state.routingDraft.invoice = state.diagnosticsDraft.invoice;
      }
      setActiveWorkspace("routing");
      state.ui.lastActivityLabel = "Opened routing with last target";
      break;
    case "go-nodes":
      setActiveWorkspace("nodes");
      openInspectorForEntity("node", state.selectedNodeId, true);
      state.ui.lastActivityLabel = "Opened selected node inspector";
      break;
    case "go-channels":
      setActiveWorkspace("channels");
      openInspectorForEntity("channel", state.selectedChannelId, true);
      state.ui.lastActivityLabel = "Opened channel readiness view";
      break;
    case "go-logs":
      setActiveWorkspace("logs");
      openInspectorForEntity(
        "log",
        state.selectedLogId || createLogsViewModel(state).selected?.id || null,
        true
      );
      state.ui.lastActivityLabel = "Opened runtime logs";
      break;
    case "go-testing":
      setActiveWorkspace("testing");
      state.ui.lastActivityLabel = "Opened simulations and presets";
      break;
    case "go-reports":
      setActiveWorkspace("reports");
      openInspectorForEntity(
        "report",
        state.selectedReportId ||
          createReportsViewModel(state).selected?.id ||
          null,
        true
      );
      state.ui.lastActivityLabel = "Opened exportable reports";
      break;
    case "go-activity":
      setActiveWorkspace("activity");
      openInspectorForEntity("activity", state.selectedActivityItemId, true);
      state.ui.lastActivityLabel = "Opened recent activity";
      break;
    default:
      return;
  }

  if (!options.fromPalette) {
    pushNotification({
      kind: "success",
      title: "Quick action complete",
      message: state.ui.lastActivityLabel,
      source: "quick-action",
      toast: true
    });
  }

  persistUiState();
  render();
}

function toggleNotificationsTray() {
  lastFocusedElement = document.activeElement;
  state.ui.notificationsTrayOpen = !state.ui.notificationsTrayOpen;
  if (state.ui.notificationsTrayOpen) {
    markNotificationsRead();
  }
  render();
}

function renderNotificationsTray() {
  if (!dom.notificationTray || !dom.notificationTrayList) {
    return;
  }

  dom.notificationTray.hidden = !state.ui.notificationsTrayOpen;
  if (!state.ui.notificationsTrayOpen) {
    return;
  }

  const notifications = getVisibleNotifications();
  dom.notificationTrayList.innerHTML = notifications.length
    ? notifications
        .map(
          (item) => `
            <article class="signal-card signal-card--${escapeHtml(item.kind)}">
              <div class="signal-card__top">
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(formatTimestamp(item.timestamp))}</span>
              </div>
              <p>${escapeHtml(item.message)}</p>
              <div class="signal-card__meta">
                ${escapeHtml(item.source || "system")}
                <button type="button" class="ghost-button" data-dismiss-notification="${escapeHtml(item.id)}">Dismiss</button>
              </div>
            </article>
          `
        )
        .join("")
    : renderEmptyState(
        "No notifications",
        "Copy actions, quick actions, and request warnings appear here."
      );
}

function onNotificationTrayClick(event) {
  const dismissButton = event.target.closest("[data-dismiss-notification]");
  if (!dismissButton) {
    return;
  }
  dismissNotification(dismissButton.dataset.dismissNotification);
}

function pushNotification({
  kind = "info",
  title,
  message,
  source = "system",
  toast = kind === "success"
}) {
  const id = `notification-${Date.now()}-${Math.round(Math.random() * 10000)}`;
  const notification = {
    id,
    kind: normalizeNotificationKind(kind),
    title: title || "Notification",
    message: message || "No message provided.",
    source,
    timestamp: Date.now(),
    read: false,
    toast: Boolean(toast)
  };
  state.ui.notifications = [notification, ...state.ui.notifications].slice(
    0,
    MAX_NOTIFICATION_ITEMS
  );
  persistUiState();

  if (notification.toast) {
    const toastId = id;
    globalThis.setTimeout(() => {
      state.ui.notifications = state.ui.notifications.map((item) =>
        item.id === toastId ? { ...item, toast: false, read: true } : item
      );
      render();
    }, TOAST_DURATION_MS);
  }
}

function renderToasts() {
  if (!dom.toastStack) {
    return;
  }
  const toasts = state.ui.notifications
    .filter((item) => item.toast)
    .slice(0, MAX_TOASTS);
  dom.toastStack.innerHTML = toasts
    .map(
      (item) => `
        <article class="toast toast--${escapeHtml(item.kind)}" data-toast-id="${escapeHtml(item.id)}">
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.message)}</p>
        </article>
      `
    )
    .join("");
}

function renderDockPanel() {
  if (!dom.dockPanel || !dom.dockPanelContent) {
    return;
  }

  const dockVisible = DOCK_VISIBLE_WORKSPACES.has(state.activeWorkspace);
  dom.dockPanel.hidden = !dockVisible;
  if (!dockVisible) {
    dom.dockPanelContent.innerHTML = "";
    return;
  }

  dom.dockPanel.classList.toggle("is-collapsed", state.ui.dockCollapsed);
  if (state.ui.dockCollapsed) {
    dom.dockPanelContent.innerHTML = "";
    return;
  }

  switch (state.ui.dockTab) {
    case "logs":
      dom.dockPanelContent.innerHTML = renderDockLogs();
      break;
    case "trace":
      dom.dockPanelContent.innerHTML = renderDockTrace();
      break;
    case "notifications":
      dom.dockPanelContent.innerHTML = renderDockNotifications();
      break;
    case "activity":
    default:
      dom.dockPanelContent.innerHTML = renderDockActivity();
      break;
  }
}

function renderDockActivity() {
  const items = (state.activitySnapshot?.items || [])
    .slice(0, 5)
    .map((item) => ({
      title: item.title,
      message: item.message,
      timestamp: item.timestamp,
      severity: item.severity || item.status,
      tags: item.tags || []
    }));

  return items.length
    ? `<div class="dock-timeline">${renderTimelineItems(items)}</div>`
    : renderEmptyState(
        "No recent activity",
        "Diagnostics runs, history events, and incident bookmarks appear here."
      );
}

function renderDockLogs() {
  const logItems = createLogsViewModel(state).rows.slice(0, 8);
  if (!logItems.length) {
    return renderEmptyState(
      "No log entries",
      "Runtime events and partial RPC failures appear here."
    );
  }

  return `
    <div class="dock-log-list">
      ${logItems
        .map(
          (item) => `
            <article class="dock-log-entry">
              <div class="dock-log-entry__meta">
                <span>${escapeHtml(item.cells.level?.text || "Info")}</span>
                <span>${escapeHtml(item.cells.time?.text || "")}</span>
              </div>
              <strong>${escapeHtml(item.cells.subsystem?.text || "Runtime")}</strong>
              <p>${escapeHtml(item.cells.message?.text || "")}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderDockTrace() {
  const trace = state.lastExecutionPlan || state.lastDiagnosisResult || null;
  if (!trace) {
    return renderEmptyState(
      "No active trace",
      "Run route analysis or diagnostics to inspect the latest execution payload."
    );
  }

  return `
    <pre class="code-panel code-panel--dock">${escapeHtml(
      JSON.stringify(trace, null, 2)
    )}</pre>
  `;
}

function renderDockNotifications() {
  const notifications = getVisibleNotifications().slice(0, 8);
  if (!notifications.length) {
    return renderEmptyState(
      "No notifications",
      "Short-lived feedback and degraded-state alerts appear here."
    );
  }

  return `
    <div class="dock-log-list">
      ${notifications
        .map(
          (item) => `
            <article class="dock-log-entry">
              <div class="dock-log-entry__meta">
                <span>${escapeHtml(humanize(item.kind))}</span>
                <span>${escapeHtml(formatTimestamp(item.timestamp))}</span>
              </div>
              <strong>${escapeHtml(item.title)}</strong>
              <p>${escapeHtml(item.message)}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function setDockTab(tab) {
  if (!DOCK_TABS.some((item) => item.id === tab)) {
    return;
  }
  state.ui.dockTab = tab;
  persistUiState();
  render();
}

function toggleDockPanel() {
  state.ui.dockCollapsed = !state.ui.dockCollapsed;
  persistUiState();
  render();
}

function dismissNotification(notificationId) {
  if (!notificationId) {
    return;
  }
  state.ui.dismissedNotificationIds = [
    notificationId,
    ...state.ui.dismissedNotificationIds.filter((id) => id !== notificationId)
  ].slice(0, MAX_NOTIFICATION_ITEMS);
  state.ui.notifications = state.ui.notifications.filter(
    (item) => item.id !== notificationId
  );
  persistUiState();
  render();
}

function getVisibleNotifications() {
  return state.ui.notifications.filter(
    (item) => !state.ui.dismissedNotificationIds.includes(item.id)
  );
}

function getUnreadNotifications() {
  return getVisibleNotifications().filter((item) => !item.read);
}

function markNotificationsRead() {
  state.ui.notifications = state.ui.notifications.map((item) => ({
    ...item,
    read: true,
    toast: false
  }));
  persistUiState();
}

function copyToClipboard(value, label) {
  globalThis.navigator?.clipboard?.writeText(value || "");
  pushNotification({
    kind: "success",
    title: "Copied to clipboard",
    message: label || "Value copied.",
    source: "copy",
    toast: true
  });
  render();
}

function toggleInspector() {
  if (state.ui.inspector.open) {
    closeInspector();
    return;
  }
  openInspectorForCurrentWorkspace();
  render();
}

function closeInspector() {
  state.ui.inspector.open = false;
  persistUiState();
  render();
  restoreFocus();
}

function toggleInspectorDockMode() {
  const nextMode =
    state.ui.inspector.preferredDockMode === "docked" ? "floating" : "docked";
  state.ui.inspector.preferredDockMode = nextMode;
  syncInspectorDockModeForViewport();
  persistUiState();
  render();
}

function syncInspectorDockModeForViewport() {
  const prefersDocked = state.ui.inspector.preferredDockMode !== "floating";
  const canDock = viewportWideMedia?.matches ?? true;
  state.ui.inspector.dockMode =
    prefersDocked && canDock ? "docked" : "floating";
}

function openInspectorForCurrentWorkspace() {
  if (state.activeWorkspace === "nodes") {
    openInspectorForEntity(
      "node",
      state.selectedNodeId || state.nodesSnapshot?.nodes?.[0]?.id,
      false
    );
  } else if (state.activeWorkspace === "channels") {
    openInspectorForEntity(
      "channel",
      state.selectedChannelId || state.channelsSnapshot?.channels?.[0]?.id,
      false
    );
  } else if (state.activeWorkspace === "payments") {
    const paymentsModel = createPaymentsViewModel(state);
    openInspectorForEntity(
      "payment",
      state.selectedPaymentId || paymentsModel.selected?.id || null,
      false
    );
  } else if (state.activeWorkspace === "activity") {
    openInspectorForEntity(
      "activity",
      state.selectedActivityItemId || state.activitySnapshot?.items?.[0]?.id,
      false
    );
  } else if (state.activeWorkspace === "logs") {
    const logsModel = createLogsViewModel(state);
    openInspectorForEntity(
      "log",
      state.selectedLogId || logsModel.selected?.id || null,
      false
    );
  } else if (state.activeWorkspace === "routing") {
    const route =
      state.lastExecutionPlan?.routePreview?.chosenRoute ||
      state.lastDiagnosisResult?.routePreview?.chosenRoute;
    openInspectorForEntity(
      "route",
      route?.id || route?.pathPubkeys?.join(":") || null,
      false
    );
  } else if (state.activeWorkspace === "reports") {
    const reportsModel = createReportsViewModel(state);
    openInspectorForEntity(
      "report",
      state.selectedReportId || reportsModel.selected?.id || null,
      false
    );
  }
}

function openInspectorForEntity(
  entityType,
  entityId,
  preserveLastFocus = true
) {
  if (!entityType || !entityId) {
    return;
  }
  if (preserveLastFocus) {
    lastFocusedElement = document.activeElement;
  }
  state.ui.inspector.open = true;
  state.ui.inspector.entityType = entityType;
  state.ui.inspector.entityId = entityId;
  syncInspectorDockModeForViewport();
  persistUiState();
}

function renderInspector() {
  if (!dom.inspectorDrawer || !dom.inspectorContent) {
    return;
  }

  const inspector = buildInspectorModel();
  const isOpen = Boolean(state.ui.inspector.open && inspector);
  dom.inspectorDrawer.hidden = !isOpen;
  dom.inspectorDrawer.dataset.mode = state.ui.inspector.dockMode;
  dom.inspectorDrawer.classList.toggle(
    "is-floating",
    state.ui.inspector.dockMode === "floating"
  );

  if (!isOpen) {
    dom.inspectorContent.innerHTML = "";
    return;
  }

  document
    .querySelector("#inspector-title")
    ?.replaceChildren(
      document.createTextNode(inspector.title || "Selected detail")
    );
  if (dom.inspectorToggleButton) {
    dom.inspectorToggleButton.textContent =
      state.ui.inspector.preferredDockMode === "docked" ? "Float" : "Dock";
  }

  dom.inspectorContent.innerHTML = renderInspectorBody({
    title: inspector.title,
    subtitle: inspector.subtitle,
    sections: inspector.sections.map((section) =>
      renderInspectorSection(section.title, renderKeyValueList(section.fields))
    )
  });
}

function buildInspectorModel() {
  const nodesModel = createNodesViewModel(state);
  const channelsModel = createChannelsViewModel(state);
  const paymentsModel = createPaymentsViewModel(state);
  const routingModel = createRoutingViewModel(state);
  const activityModel = createActivityViewModel(state);
  const logsModel = createLogsViewModel(state);
  const reportsModel = createReportsViewModel(state);

  switch (state.ui.inspector.entityType) {
    case "node":
      return nodesModel.inspector;
    case "channel":
      return channelsModel.inspector;
    case "payment":
      return paymentsModel.inspector;
    case "route":
      return routingModel.inspector;
    case "activity":
      return activityModel.inspector;
    case "log":
      return logsModel.inspector;
    case "report":
      return reportsModel.inspector;
    default:
      return null;
  }
}

function focusSelectedRowIfNeeded() {
  if (!pendingFocusRowId) {
    return;
  }
  const row = dom.workspaceRoot.querySelector(
    `tr[data-row-id="${globalThis.CSS.escape(pendingFocusRowId)}"]`
  );
  row?.focus();
  pendingFocusRowId = null;
}

function restoreFocus() {
  const element = lastFocusedElement;
  lastFocusedElement = null;
  if (element && typeof element.focus === "function") {
    globalThis.queueMicrotask(() => element.focus());
  }
}

function exportReport(kind) {
  const safeKind = kind || "json";
  if (safeKind === "markdown") {
    copyToClipboard(buildMarkdownReport(), "Markdown report");
    return;
  }
  if (safeKind === "timeline") {
    copyToClipboard(buildTimelineReport(), "Activity timeline");
    return;
  }
  copyToClipboard(buildJsonReport(), "JSON report");
}

function buildJsonReport() {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      workspace: state.activeWorkspace,
      environment:
        state.environment || state.bootstrap?.environmentFacts || null,
      diagnosis: state.lastDiagnosisResult || null,
      routePreview: state.lastExecutionPlan || null,
      nodes: state.nodesSnapshot || null,
      activity: state.activitySnapshot?.items || [],
      notifications: getVisibleNotifications()
    },
    null,
    2
  );
}

function buildMarkdownReport() {
  const diagnosis = state.lastDiagnosisResult;
  const lines = [
    "# Fiber Desktop Report",
    "",
    `Generated: ${new Date().toLocaleString()}`,
    `Workspace: ${getWorkspaceMeta(state.activeWorkspace).label}`,
    `Environment: ${state.environment?.name || state.bootstrap?.environmentFacts?.name || "Unknown"}`,
    ""
  ];

  if (diagnosis) {
    lines.push("## Current Investigation", "");
    lines.push(`- Headline: ${diagnosis.diagnosis?.headline || "Unknown"}`);
    lines.push(
      `- Readiness: ${diagnosis.summary?.paymentReadiness || "Unknown"}`
    );
    lines.push(`- Route proof: ${diagnosis.summary?.routeProof || "Unknown"}`);
    lines.push(
      `- Blocking reason: ${diagnosis.routePreview?.blockingReason || "None recorded"}`
    );
    lines.push("");
  }

  lines.push("## Recent Activity", "");
  for (const item of (state.activitySnapshot?.items || []).slice(0, 5)) {
    lines.push(
      `- ${item.timestampLabel || formatTimestamp(item.timestamp)}: ${item.title} (${humanize(
        item.category || item.type || "event"
      )})`
    );
  }

  return lines.join("\n");
}

function buildTimelineReport() {
  const items = (state.activitySnapshot?.items || []).slice(0, 10);
  return items
    .map(
      (item) =>
        `${item.timestampLabel || formatTimestamp(item.timestamp)} | ${item.title} | ${item.message || ""}`
    )
    .join("\n");
}

function getWorkspaceMeta(workspace) {
  return (
    WORKSPACE_META[workspace] || {
      label: humanize(workspace),
      section: "Workspace",
      description: `${humanize(workspace)} workspace`
    }
  );
}

function compactObject(source) {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([, value]) => value !== null && value !== undefined && value !== ""
    )
  );
}

function normalizeNotificationKind(kind) {
  return ["success", "info", "warning", "error", "critical"].includes(kind)
    ? kind
    : "info";
}

function toneToNotificationKind(value) {
  switch (value) {
    case "ready":
    case "healthy":
    case "success":
    case "low":
      return "success";
    case "blocked":
    case "critical":
    case "high":
    case "failed":
      return "error";
    case "warning":
    case "degraded":
    case "medium":
      return "warning";
    default:
      return "info";
  }
}
