const DEFAULT_RECENT_LIMIT = 50;

const SENSITIVE_KEY_PATTERN =
  /token|authorization|password|secret|api[_-]?key/i;

export function createObservability({
  enabled = true,
  logger = console,
  recentLimit = DEFAULT_RECENT_LIMIT,
  now = () => Date.now()
} = {}) {
  const state = {
    enabled,
    logger,
    recentLimit,
    now,
    startedAt: now(),
    requestSequence: 0,
    requests: {
      total: 0,
      errors: 0,
      byRoute: new Map(),
      byErrorClass: new Map(),
      durations: {
        count: 0,
        totalMs: 0,
        maxMs: 0,
        byRoute: new Map()
      },
      recent: []
    },
    runs: {
      started: 0,
      completed: 0,
      failed: 0,
      bySource: new Map(),
      byCategory: new Map(),
      bySeverity: new Map(),
      byReadiness: new Map(),
      allNodesFailed: 0,
      historyPersistence: {
        success: 0,
        failure: 0,
        byBackendType: new Map()
      }
    }
  };

  return {
    enabled,

    createRequestContext({ method, route }) {
      const requestNumber = ++state.requestSequence;
      const timestamp = state.now();
      return {
        id: `req-${timestamp}-${requestNumber}`,
        method: method || "GET",
        route: route || "/",
        startedAt: timestamp,
        runStartedAt: null
      };
    },

    log(event, payload = {}, level = "info") {
      if (!state.enabled) {
        return;
      }

      const target =
        level === "error"
          ? state.logger.error || state.logger.log
          : level === "warn"
            ? state.logger.warn || state.logger.log
            : state.logger.info || state.logger.log;

      if (typeof target !== "function") {
        return;
      }

      target.call(
        state.logger,
        JSON.stringify(redactForLogs({ event, ...payload }))
      );
    },

    recordRequestStart(context) {
      if (!state.enabled || !context) {
        return;
      }

      this.log("request.start", {
        requestId: context.id,
        method: context.method,
        route: context.route
      });
    },

    recordRequestComplete(
      context,
      { statusCode = 200, errorClass = null } = {}
    ) {
      if (!state.enabled || !context) {
        return;
      }

      const durationMs = Math.max(state.now() - context.startedAt, 0);
      state.requests.total += 1;
      if (statusCode >= 400) {
        state.requests.errors += 1;
      }

      incrementCounter(state.requests.byRoute, context.route);
      if (errorClass) {
        incrementCounter(state.requests.byErrorClass, errorClass);
      }

      state.requests.durations.count += 1;
      state.requests.durations.totalMs += durationMs;
      state.requests.durations.maxMs = Math.max(
        state.requests.durations.maxMs,
        durationMs
      );
      const routeDuration =
        state.requests.durations.byRoute.get(context.route) ||
        createDurationAggregate();
      routeDuration.count += 1;
      routeDuration.totalMs += durationMs;
      routeDuration.maxMs = Math.max(routeDuration.maxMs, durationMs);
      state.requests.durations.byRoute.set(context.route, routeDuration);

      pushRecent(state.requests.recent, state.recentLimit, {
        timestamp: state.now(),
        route: context.route,
        statusCode,
        errorClass
      });

      this.log(
        "request.complete",
        {
          requestId: context.id,
          method: context.method,
          route: context.route,
          statusCode,
          errorClass,
          durationMs
        },
        statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info"
      );
    },

    recordRunStart({ requestId, source, mode }) {
      if (!state.enabled) {
        return;
      }

      state.runs.started += 1;
      incrementCounter(state.runs.bySource, source || mode || "unknown");
      this.log("diagnosis.start", {
        requestId,
        source: source || mode || "unknown"
      });
    },

    recordLiveFanout({ requestId, nodeCount, concurrency }) {
      if (!state.enabled) {
        return;
      }

      this.log("diagnosis.live_fanout", {
        requestId,
        nodeCount,
        concurrency
      });
    },

    recordAllNodesFailed({ requestId, nodeCount, errorCode = null }) {
      if (!state.enabled) {
        return;
      }

      state.runs.allNodesFailed += 1;
      this.log(
        "diagnosis.all_nodes_failed",
        {
          requestId,
          nodeCount,
          errorCode
        },
        "warn"
      );
    },

    recordHistoryPersistence({
      requestId,
      success,
      backendType = "unknown",
      errorCode = null
    }) {
      if (!state.enabled) {
        return;
      }

      incrementCounter(
        state.runs.historyPersistence.byBackendType,
        backendType
      );
      if (success) {
        state.runs.historyPersistence.success += 1;
      } else {
        state.runs.historyPersistence.failure += 1;
      }

      this.log(
        success ? "diagnosis.history_success" : "diagnosis.history_failure",
        {
          requestId,
          backendType,
          errorCode
        },
        success ? "info" : "warn"
      );
    },

    recordDiagnosisOutcome({
      requestId,
      source,
      category,
      severity,
      readiness,
      allNodesFailed = false
    }) {
      if (!state.enabled) {
        return;
      }

      incrementCounter(state.runs.bySource, source || "unknown");
      incrementCounter(state.runs.byCategory, category || "unknown");
      incrementCounter(state.runs.bySeverity, severity || "unknown");
      incrementCounter(state.runs.byReadiness, readiness || "unknown");
      if (allNodesFailed) {
        state.runs.allNodesFailed += 1;
      }

      this.log("diagnosis.outcome", {
        requestId,
        source,
        category,
        severity,
        readiness,
        allNodesFailed
      });
    },

    recordRunComplete({
      requestId,
      source,
      category = null,
      status = "completed",
      durationMs = null
    }) {
      if (!state.enabled) {
        return;
      }

      if (status === "failed") {
        state.runs.failed += 1;
      } else {
        state.runs.completed += 1;
      }

      this.log(
        "diagnosis.complete",
        {
          requestId,
          source,
          category,
          status,
          durationMs
        },
        status === "failed" ? "warn" : "info"
      );
    },

    snapshot() {
      const uptimeMs = Math.max(state.now() - state.startedAt, 0);
      const recentRequests = state.requests.recent.length;
      const recentErrors = state.requests.recent.filter(
        (entry) => entry.statusCode >= 400
      ).length;

      return {
        enabled: state.enabled,
        uptimeMs,
        requestIdsIssued: state.requestSequence,
        requests: {
          total: state.requests.total,
          errors: state.requests.errors,
          recent: {
            windowSize: state.requests.recent.length,
            requests: recentRequests,
            errors: recentErrors
          },
          byRoute: mapToObject(state.requests.byRoute),
          byErrorClass: mapToObject(state.requests.byErrorClass),
          durations: {
            count: state.requests.durations.count,
            averageMs:
              state.requests.durations.count > 0
                ? roundNumber(
                    state.requests.durations.totalMs /
                      state.requests.durations.count
                  )
                : 0,
            maxMs: roundNumber(state.requests.durations.maxMs),
            byRoute: Object.fromEntries(
              [...state.requests.durations.byRoute.entries()].map(
                ([route, aggregate]) => [
                  route,
                  snapshotDurationAggregate(aggregate)
                ]
              )
            )
          }
        },
        runs: {
          started: state.runs.started,
          completed: state.runs.completed,
          failed: state.runs.failed,
          bySource: mapToObject(state.runs.bySource),
          byCategory: mapToObject(state.runs.byCategory),
          bySeverity: mapToObject(state.runs.bySeverity),
          byReadiness: mapToObject(state.runs.byReadiness),
          allNodesFailed: state.runs.allNodesFailed,
          historyPersistence: {
            success: state.runs.historyPersistence.success,
            failure: state.runs.historyPersistence.failure,
            byBackendType: mapToObject(
              state.runs.historyPersistence.byBackendType
            )
          }
        }
      };
    }
  };
}

export function redactForLogs(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactForLogs(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, "[REDACTED]"];
      }
      return [key, redactForLogs(entryValue)];
    })
  );
}

function incrementCounter(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function pushRecent(list, limit, entry) {
  list.push(entry);
  if (list.length > limit) {
    list.splice(0, list.length - limit);
  }
}

function mapToObject(map) {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right))
  );
}

function createDurationAggregate() {
  return {
    count: 0,
    totalMs: 0,
    maxMs: 0
  };
}

function snapshotDurationAggregate(aggregate) {
  return {
    count: aggregate.count,
    averageMs:
      aggregate.count > 0
        ? roundNumber(aggregate.totalMs / aggregate.count)
        : 0,
    maxMs: roundNumber(aggregate.maxMs)
  };
}

function roundNumber(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
