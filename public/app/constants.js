export const HISTORY_KEY = "fiberops:incident-history";
export const HISTORY_LIMIT = 8;

export const WORKSPACES = [
  "overview",
  "nodes",
  "channels",
  "routing",
  "diagnostics",
  "activity",
  "testing",
  "configuration"
];

export const BOOTSTRAP_FALLBACK = {
  scenarios: [],
  liveStory: [],
  livePresets: [],
  localLab: null,
  environmentFacts: null,
  defaultEndpoint: "http://127.0.0.1:8227",
  runtime: {
    policy: {
      analysisDepths: ["standard", "deep"],
      routeProbeEnabled: true,
      liveExternalEndpointsAllowed: false,
      insecureTokenForwardingAllowed: false
    }
  }
};

export function createInitialState() {
  return {
    mode: "demo",
    activeWorkspace: "overview",
    bootstrap: null,
    bootstrapState: "loading",
    bootstrapError: null,
    runtimeStatus: null,
    environment: null,
    observability: null,
    historyStatus: null,
    activePreset: null,
    selectedNodeId: null,
    selectedChannelId: null,
    selectedActivityItemId: null,
    workspaceFilters: {
      overview: {},
      nodes: {},
      channels: {},
      routing: {},
      diagnostics: {},
      activity: {},
      testing: {},
      configuration: {}
    },
    diagnosticsDraft: {
      scenarioId: "",
      endpoint: "",
      token: "",
      invoice: "",
      paymentHash: "",
      amount: "",
      targetPubkey: "",
      analysisDepth: "deep"
    },
    routingDraft: {
      invoice: "",
      amount: "",
      targetPubkey: ""
    },
    lastDiagnosisResult: null,
    lastExecutionPlan: null,
    overviewSnapshot: null,
    nodesSnapshot: { nodes: [] },
    channelsSnapshot: { channels: [] },
    activitySnapshot: { items: [] },
    ui: {
      drawerOpen: false,
      commandPaletteOpen: false,
      commandPaletteIndex: 0,
      notificationsTrayOpen: false,
      loading: false,
      error: null,
      lastActivityLabel: "Waiting for runtime status",
      recentCommands: [],
      notifications: [],
      dismissedNotificationIds: [],
      inspector: {
        open: false,
        dockMode: "docked",
        preferredDockMode: "docked",
        entityType: null,
        entityId: null
      }
    },
    activeRequestId: 0,
    activeAbortController: null
  };
}
