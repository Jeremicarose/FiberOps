export const HISTORY_KEY = "fiberops:incident-history";
export const HISTORY_LIMIT = 8;

export const WORKSPACES = [
  "overview",
  "nodes",
  "channels",
  "payments",
  "routing",
  "diagnostics",
  "activity",
  "logs",
  "testing",
  "reports",
  "configuration"
];

export const WORKSPACE_META = {
  overview: {
    label: "Overview",
    section: "Observe",
    description: "Health and changes"
  },
  nodes: {
    label: "Nodes",
    section: "Observe",
    description: "Node posture"
  },
  channels: {
    label: "Channels",
    section: "Observe",
    description: "Liquidity and readiness"
  },
  payments: {
    label: "Payments",
    section: "Observe",
    description: "History and failures"
  },
  routing: {
    label: "Routes",
    section: "Explain",
    description: "Paths and blockers"
  },
  diagnostics: {
    label: "Diagnostics",
    section: "Explain",
    description: "Explain a failure"
  },
  activity: {
    label: "Activity",
    section: "Explain",
    description: "Incidents and changes"
  },
  logs: {
    label: "Logs",
    section: "Explain",
    description: "Events and trace"
  },
  testing: {
    label: "Simulations",
    section: "Validate",
    description: "Scenarios and lab"
  },
  reports: {
    label: "Reports",
    section: "Validate",
    description: "Export summaries"
  },
  configuration: {
    label: "Settings",
    section: "Configure",
    description: "Connections and safety"
  }
};

export const DOCK_TABS = [
  { id: "activity", label: "Activity" },
  { id: "logs", label: "Logs" },
  { id: "trace", label: "Trace" },
  { id: "notifications", label: "Notifications" }
];

export const DEMO_SCENARIO_PRESETS = [
  {
    id: "healthy-payment",
    label: "Healthy Payment",
    detail: "Known-good baseline"
  },
  {
    id: "preflight-liquidity-block",
    label: "Low Liquidity",
    detail: "Outbound liquidity too low"
  },
  {
    id: "rpc-unavailable",
    label: "Offline Node",
    detail: "RPC unavailable"
  },
  {
    id: "fee-too-high",
    label: "Fee Budget Too Low",
    detail: "Route exists, fee budget fails"
  },
  {
    id: "route-build-failure",
    label: "Route Not Found",
    detail: "No viable route"
  }
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
    selectedPaymentId: null,
    selectedActivityItemId: null,
    selectedLogId: null,
    selectedReportId: null,
    workspaceFilters: {
      overview: {},
      nodes: {},
      channels: {},
      payments: {},
      routing: {},
      diagnostics: {},
      activity: {},
      logs: {},
      testing: {},
      reports: {},
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
      theme: "system",
      recentCommands: [],
      notifications: [],
      dismissedNotificationIds: [],
      dockTab: "activity",
      dockCollapsed: false,
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
