import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getBootstrapData, runDiagnosis } from "./lib/diagnostics.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const defaultEndpoint = process.env.FIBER_RPC_URL || "http://127.0.0.1:8227";
const node2Endpoint = process.env.FIBER_RPC_URL_NODE2 || "http://127.0.0.1:8237";
const runtimeDir = path.join(__dirname, "..", "runtime");
const knownLabPayments = {
  success: "0x729f0879b24702a9226ebb35bbcbbbdcca0eb859addc62da1f121dc1c20df209",
  failure: "0x7bfb24cba169ec57a1743d4b0ed35b522a4dfbd5d9d04626aef866d82d9cd845"
};
const localLab = {
  node1: {
    endpoint: defaultEndpoint,
    pubkey: "02942f9602e5afe0287879b829306d35804c8a2d28ace1d8248b553f580850d696"
  },
  node2: {
    endpoint: node2Endpoint,
    pubkey: "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
  },
  channelId: "0x9c87857dedd1065732f27338ed92ea2eb02c079f29ce43e599129884595bf753",
  successfulPaymentHash: knownLabPayments.success,
  failedPaymentHash: knownLabPayments.failure
};

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/api/bootstrap") {
      return sendJson(response, 200, await buildBootstrapPayload());
    }

    if (request.method === "POST" && request.url === "/api/diagnose") {
      const payload = await readJsonBody(request);
      const result = await runDiagnosis(payload, { defaultEndpoint });
      return sendJson(response, 200, result);
    }

    if (request.method === "GET" && request.url === "/api/health") {
      return sendJson(response, 200, {
        ok: true,
        service: "fiberops",
        defaultEndpoint
      });
    }

    if (request.method === "GET") {
      return sendStatic(request.url || "/", response);
    }

    sendJson(response, 405, {
      error: "Method not allowed."
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error?.message || "Unexpected server error."
    });
  }
});

server.listen(port, host, () => {
  console.log(`FiberOps running at http://${host}:${port}`);
});

async function buildBootstrapPayload() {
  const base = getBootstrapData(defaultEndpoint);
  return {
    ...base,
    livePresets: await getLivePresets(),
    liveStory: getLiveStory(),
    localLab
  };
}

async function getLivePresets() {
  const latestInvoice = await tryReadJson(path.join(runtimeDir, "node2", "latest-invoice.json"));
  const tooBigInvoice = await tryReadJson(path.join(runtimeDir, "node2", "too-big-invoice.json"));

  const presets = [
    {
      id: "node1-success-payment",
      label: "Run Success",
      title: "Real successful payment",
      description: "Loads the real 100 CKB payment hash from node1 and diagnoses it immediately.",
      payload: {
        mode: "live",
        endpoint: defaultEndpoint,
        paymentHash: knownLabPayments.success
      }
    },
    {
      id: "node1-liquidity-failure",
      label: "Run Failure",
      title: "Real liquidity failure",
      description: "Loads the real insufficient-liquidity payment hash from node1 and diagnoses it immediately.",
      payload: {
        mode: "live",
        endpoint: defaultEndpoint,
        paymentHash: knownLabPayments.failure
      }
    },
    {
      id: "node1-channel-state",
      label: "Node1 State",
      title: "Sender node state",
      description: "Loads the sender node endpoint so you can inspect current channel readiness and outbound liquidity.",
      payload: {
        mode: "live",
        endpoint: defaultEndpoint
      }
    },
    {
      id: "node2-channel-state",
      label: "Node2 State",
      title: "Receiver node state",
      description: "Switches the endpoint to node2 so you can inspect the receiving side of the local channel.",
      payload: {
        mode: "live",
        endpoint: node2Endpoint
      }
    }
  ];

  if (latestInvoice?.invoice_address) {
    presets.push({
      id: "node2-latest-invoice",
      label: "Run Preflight",
      title: "Valid 100 CKB invoice",
      description: "Loads the current node2 invoice so FiberOps can validate it against the live channel before payment.",
      payload: {
        mode: "live",
        endpoint: defaultEndpoint,
        invoice: latestInvoice.invoice_address
      }
    });
  }

  if (tooBigInvoice?.invoice_address) {
    presets.push({
      id: "node2-too-big-invoice",
      label: "Run Preflight",
      title: "Over-capacity invoice",
      description: "Loads the 350 CKB invoice that exceeds current outbound liquidity and triggers a real preflight failure.",
      payload: {
        mode: "live",
        endpoint: defaultEndpoint,
        invoice: tooBigInvoice.invoice_address
      }
    });
  }

  return presets;
}

function getLiveStory() {
  return [
    {
      id: "judge-preflight",
      step: "01",
      title: "Preflight catches the problem",
      description: "Load the 350 CKB invoice. FiberOps compares requested amount to outbound liquidity before a send is attempted.",
      presetId: "node2-too-big-invoice"
    },
    {
      id: "judge-failure",
      step: "02",
      title: "Real failure explains why",
      description: "Run the stored failed payment hash from node1. The node recorded an insufficient-liquidity failed_error and FiberOps translates it cleanly.",
      presetId: "node1-liquidity-failure"
    },
    {
      id: "judge-success",
      step: "03",
      title: "Real success proves the channel works",
      description: "Run the successful payment hash from node1. This shows the tool distinguishes a healthy payment from a broken one using the same live setup.",
      presetId: "node1-success-payment"
    }
  ];
}

async function tryReadJson(filePath) {
  try {
    const contents = await readFile(filePath, "utf8");
    return JSON.parse(contents);
  } catch {
    return null;
  }
}

async function sendStatic(requestPath, response) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(publicDir, normalizedPath));

  if (!filePath.startsWith(publicDir)) {
    sendJson(response, 403, {
      error: "Forbidden."
    });
    return;
  }

  try {
    const contents = await readFile(filePath);
    response.writeHead(200, {
      "content-type": getContentType(filePath)
    });
    response.end(contents);
  } catch {
    const fallback = await readFile(path.join(publicDir, "index.html"));
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8"
    });
    response.end(fallback);
  }
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function getContentType(filePath) {
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".svg")) {
    return "image/svg+xml";
  }
  return "text/html; charset=utf-8";
}
