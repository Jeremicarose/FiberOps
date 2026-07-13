export const DIAGNOSIS_CONTRACT_VERSION = "2026-07-12";
export const DIAGNOSIS_OUTPUT_MODES = [
  "full",
  "machine",
  "operator",
  "backend",
  "wallet"
];

export const diagnosisRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://fiberops.dev/contracts/diagnosis-request.schema.json",
  title: "FiberOps diagnosis request",
  description: "Strict top-level request contract for /api/diagnose.",
  type: "object",
  additionalProperties: false,
  properties: {
    mode: {
      type: "string",
      enum: ["demo", "live"]
    },
    scenarioId: {
      type: "string"
    },
    invoice: {
      type: "string"
    },
    paymentHash: {
      type: "string"
    },
    amount: {
      type: "string"
    },
    targetPubkey: {
      type: "string"
    },
    endpoint: {
      type: "string",
      format: "uri"
    },
    token: {
      type: "string"
    },
    timeoutMs: {
      type: "integer",
      minimum: 1
    },
    outputMode: {
      type: "string",
      enum: DIAGNOSIS_OUTPUT_MODES
    }
  }
};

export const diagnosisResultSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://fiberops.dev/contracts/diagnosis-result.schema.json",
  title: "FiberOps diagnosis result",
  description:
    "Canonical FiberOps diagnosis result. Top-level fields are validated, while many nested sections remain additive for forward-compatible evolution.",
  type: "object",
  required: [
    "contract",
    "source",
    "diagnosis",
    "summary",
    "routePreview",
    "alerts",
    "event",
    "analyzedAt"
  ],
  additionalProperties: true,
  properties: {
    contract: {
      type: "object",
      required: ["version", "outputModes", "defaultOutputMode"],
      additionalProperties: true,
      properties: {
        version: {
          type: "string"
        },
        outputModes: {
          type: "array",
          items: {
            type: "string"
          }
        },
        defaultOutputMode: {
          type: "string"
        }
      }
    },
    source: {
      type: "string",
      enum: ["demo", "live"]
    },
    diagnosis: {
      type: "object",
      required: [
        "category",
        "headline",
        "severity",
        "confidence",
        "checks",
        "evidence",
        "nextActions",
        "references"
      ],
      additionalProperties: true
    },
    summary: {
      type: "object",
      additionalProperties: true
    },
    routePreview: {
      type: "object",
      additionalProperties: true
    },
    alerts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true
      }
    },
    event: {
      type: "object",
      required: ["id", "timestamp", "category", "severity", "headline", "tags"],
      additionalProperties: true
    },
    analyzedAt: {
      type: "string",
      format: "date-time"
    }
  }
};

export const diagnosisExportSchemas = {
  machine: createExportSchema("machine"),
  operator: createExportSchema("operator"),
  backend: createExportSchema("backend"),
  wallet: createExportSchema("wallet")
};

export const ruleCatalogSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://fiberops.dev/contracts/diagnosis-rules.schema.json",
  title: "FiberOps diagnosis rules",
  type: "array",
  items: {
    type: "object",
    required: [
      "id",
      "kind",
      "pattern",
      "headline",
      "severity",
      "confidence",
      "refs"
    ],
    additionalProperties: false,
    properties: {
      id: { type: "string" },
      kind: { type: "string" },
      pattern: { type: "string" },
      headline: { type: "string" },
      severity: { type: "string" },
      confidence: { type: "number" },
      refs: {
        type: "array",
        items: { type: "string" }
      }
    }
  }
};

export function getContractBundle() {
  return {
    version: DIAGNOSIS_CONTRACT_VERSION,
    outputModes: [...DIAGNOSIS_OUTPUT_MODES],
    schemas: {
      request: diagnosisRequestSchema,
      result: diagnosisResultSchema,
      exports: diagnosisExportSchemas,
      rules: ruleCatalogSchema
    }
  };
}

export function validateDiagnosisRequest(payload = {}) {
  const errors = [];

  if (!isRecord(payload)) {
    return {
      ok: false,
      errors: ["Payload must be a JSON object."]
    };
  }

  const allowedKeys = new Set(Object.keys(diagnosisRequestSchema.properties));
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      errors.push(`Unknown request field "${key}".`);
    }
  }

  const mode =
    payload.mode === "live"
      ? "live"
      : payload.mode === undefined || payload.mode === ""
        ? undefined
        : String(payload.mode);
  if (mode && mode !== "demo" && mode !== "live") {
    errors.push('Field "mode" must be "demo" or "live".');
  }

  const outputMode =
    payload.outputMode === undefined || payload.outputMode === ""
      ? undefined
      : String(payload.outputMode).trim();
  if (outputMode && !DIAGNOSIS_OUTPUT_MODES.includes(outputMode)) {
    errors.push(
      `Field "outputMode" must be one of: ${DIAGNOSIS_OUTPUT_MODES.join(", ")}.`
    );
  }

  const timeoutValue = normalizeTimeout(payload.timeoutMs);
  if (payload.timeoutMs !== undefined && timeoutValue === null) {
    errors.push('Field "timeoutMs" must be a positive integer.');
  }

  const normalized = {
    mode: mode || "demo",
    scenarioId: normalizeOptionalString(payload.scenarioId),
    invoice: normalizeOptionalString(payload.invoice),
    paymentHash: normalizeOptionalString(payload.paymentHash),
    amount: normalizeOptionalString(payload.amount),
    targetPubkey: normalizeOptionalString(payload.targetPubkey),
    endpoint: normalizeOptionalString(payload.endpoint),
    token: normalizeOptionalString(payload.token),
    timeoutMs: timeoutValue,
    outputMode: outputMode || "full"
  };

  if (normalized.mode === "live" && !normalized.endpoint) {
    normalized.endpoint = undefined;
  }

  return {
    ok: errors.length === 0,
    errors,
    value: removeUndefined(normalized)
  };
}

export function validateDiagnosisResult(result) {
  const errors = [];

  if (!isRecord(result)) {
    return {
      ok: false,
      errors: ["Result must be an object."]
    };
  }

  if (result.contract?.version !== DIAGNOSIS_CONTRACT_VERSION) {
    errors.push("Missing or unexpected contract version.");
  }
  if (!["demo", "live"].includes(result.source)) {
    errors.push("Result source must be demo or live.");
  }
  if (
    !isRecord(result.diagnosis) ||
    typeof result.diagnosis.category !== "string" ||
    typeof result.diagnosis.headline !== "string"
  ) {
    errors.push("Diagnosis payload is incomplete.");
  }
  if (!isRecord(result.summary)) {
    errors.push("Summary payload is missing.");
  }
  if (!isRecord(result.routePreview)) {
    errors.push("Route preview payload is missing.");
  }
  if (!Array.isArray(result.alerts)) {
    errors.push("Alerts must be an array.");
  }
  if (
    !isRecord(result.event) ||
    typeof result.event.id !== "string" ||
    typeof result.event.timestamp !== "string"
  ) {
    errors.push("Event envelope is incomplete.");
  }
  if (typeof result.analyzedAt !== "string") {
    errors.push("Result is missing analyzedAt.");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function createExportSchema(name) {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `https://fiberops.dev/contracts/diagnosis-export-${name}.schema.json`,
    title: `FiberOps ${name} export`,
    type: "object",
    required: ["contractVersion", "outputMode"],
    additionalProperties: true,
    properties: {
      contractVersion: {
        type: "string"
      },
      outputMode: {
        type: "string",
        const: name
      }
    }
  };
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const normalized = String(value).trim();
  return normalized === "" ? undefined : normalized;
}

function normalizeTimeout(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function removeUndefined(source) {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined)
  );
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
