export const HISTORY_KEY = "fiberops:incident-history";
export const HISTORY_LIMIT = 8;

export const BOOTSTRAP_FALLBACK = {
  scenarios: [],
  liveStory: [],
  livePresets: [],
  localLab: null,
  defaultEndpoint: "http://127.0.0.1:8227"
};

export function createInitialState() {
  return {
    mode: "demo",
    bootstrap: null,
    bootstrapState: "loading",
    bootstrapError: null,
    activePreset: null,
    activeWorkspaceTab: "guided",
    activeRequestId: 0,
    activeAbortController: null,
    lastSubmittedPayload: null
  };
}
