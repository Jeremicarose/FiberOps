#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import {
  formatDiagnosisOutput,
  runDiagnosis,
  validateDiagnosisRequest
} from "./lib/diagnostics.js";
import { createFiberOpsConfig, getLocalLabNodeSet } from "./lib/server-app.js";

const HELP_TEXT = `fiberops-diagnose

Usage:
  fiberops-diagnose --mode demo --scenario-id route-build-failure
  fiberops-diagnose --mode live --endpoint http://127.0.0.1:8227 --payment-hash 0x...
  cat payload.json | fiberops-diagnose --output-mode operator

Options:
  --mode demo|live
  --scenario-id <id>
  --invoice <invoice>
  --payment-hash <hash>
  --amount <amount>
  --target-pubkey <pubkey>
  --endpoint <url>
  --token <bearer-token>
  --analysis-depth standard|deep
  --output-mode full|machine|operator|backend|wallet
  --history-path <file>
  --history-backend json-file|ndjson-file
  --input <file>
  --multi-node
  --help
`;

const { values } = parseArgs({
  options: {
    mode: { type: "string" },
    "scenario-id": { type: "string" },
    invoice: { type: "string" },
    "payment-hash": { type: "string" },
    amount: { type: "string" },
    "target-pubkey": { type: "string" },
    endpoint: { type: "string" },
    token: { type: "string" },
    "analysis-depth": { type: "string" },
    "output-mode": { type: "string" },
    "history-path": { type: "string" },
    "history-backend": { type: "string" },
    input: { type: "string" },
    "multi-node": { type: "boolean" },
    help: { type: "boolean" }
  }
});

if (values.help) {
  process.stdout.write(`${HELP_TEXT}\n`);
  process.exit(0);
}

const payload = await loadPayload(values);
const validation = validateDiagnosisRequest(payload);

if (!validation.ok) {
  process.stderr.write(
    `Invalid diagnosis request:\n- ${validation.errors.join("\n- ")}\n`
  );
  process.exit(1);
}

const config = createFiberOpsConfig({
  defaultEndpoint: values.endpoint || undefined,
  historyPath: values["history-path"] || undefined,
  historyBackend: values["history-backend"] || undefined
});

const result = await runDiagnosis(validation.value, {
  defaultEndpoint: config.defaultEndpoint,
  historyPath: values["history-path"] || undefined,
  historyBackend: values["history-backend"] || undefined,
  analysisDepth: validation.value.analysisDepth,
  nodeSet: values["multi-node"] ? getLocalLabNodeSet(config) : undefined
});

process.stdout.write(
  `${JSON.stringify(formatDiagnosisOutput(result, validation.value.outputMode), null, 2)}\n`
);

async function loadPayload(cliValues) {
  if (cliValues.input) {
    const raw = await readFile(cliValues.input, "utf8");
    return JSON.parse(raw);
  }

  if (!process.stdin.isTTY) {
    const raw = await readStdin();
    if (raw.trim()) {
      return JSON.parse(raw);
    }
  }

  return {
    mode: cliValues.mode,
    scenarioId: cliValues["scenario-id"],
    invoice: cliValues.invoice,
    paymentHash: cliValues["payment-hash"],
    amount: cliValues.amount,
    targetPubkey: cliValues["target-pubkey"],
    endpoint: cliValues.endpoint,
    token: cliValues.token,
    analysisDepth: cliValues["analysis-depth"],
    outputMode: cliValues["output-mode"]
  };
}

async function readStdin() {
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += chunk;
  }
  return raw;
}
