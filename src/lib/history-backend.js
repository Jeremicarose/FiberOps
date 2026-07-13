import { HistoryStore } from "./history-store.js";

export function createHistoryBackend(options = {}) {
  if (
    options.historyBackend &&
    typeof options.historyBackend === "object" &&
    typeof options.historyBackend.append === "function"
  ) {
    return normalizeHistoryBackend(options.historyBackend);
  }

  if (options.historyStore) {
    return normalizeHistoryBackend(options.historyStore);
  }

  if (options.historyPath) {
    return normalizeHistoryBackend(
      new HistoryStore({
        filePath: options.historyPath,
        maxRecords: options.maxRecords,
        enabled: options.enabled,
        backendKind:
          typeof options.historyBackend === "string"
            ? options.historyBackend
            : options.backendKind
      })
    );
  }

  return null;
}

export function normalizeHistoryBackend(backend) {
  if (!backend || typeof backend !== "object") {
    return null;
  }

  const normalized = {
    append: bindRequiredMethod(backend, "append"),
    listRecent: bindRequiredMethod(backend, "listRecent"),
    findRelated: bindRequiredMethod(backend, "findRelated")
  };

  if (typeof backend.getStatus === "function") {
    normalized.getStatus = backend.getStatus.bind(backend);
  }

  if (backend.type) {
    normalized.type = String(backend.type);
  } else if (backend.constructor?.name) {
    normalized.type = backend.constructor.name;
  } else {
    normalized.type = "custom";
  }

  return normalized;
}

export async function getHistoryBackendStatus(backend) {
  if (!backend) {
    return {
      configured: false,
      enabled: false,
      degraded: false,
      type: null
    };
  }

  const fallback = {
    configured: true,
    enabled: true,
    degraded: false,
    type: backend.type || "custom"
  };

  if (typeof backend.getStatus !== "function") {
    return fallback;
  }

  try {
    const status = await backend.getStatus();
    return {
      ...fallback,
      ...(status && typeof status === "object" ? status : {}),
      type:
        status && typeof status === "object" && status.type
          ? String(status.type)
          : fallback.type
    };
  } catch (error) {
    return {
      ...fallback,
      degraded: true,
      error: {
        code: error?.code || "HISTORY_STATUS_FAILED",
        message: error?.message || "History backend status failed."
      }
    };
  }
}

function bindRequiredMethod(target, name) {
  if (typeof target[name] !== "function") {
    throw new TypeError(`History backend must implement ${name}().`);
  }
  return target[name].bind(target);
}
