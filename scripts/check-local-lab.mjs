import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

import {
  getLocalLabPaths,
  getRequiredLabArtifacts
} from "./local-lab-topology.mjs";

const { archivePath, vendorDir, manifestPath } = getLocalLabPaths();
const requiredPaths = getRequiredLabArtifacts();

for (const filePath of requiredPaths) {
  await ensureReadable(filePath);
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
validateManifest(manifest);

const rpcChecks = await Promise.all((manifest.nodes || []).map(checkRpcHealth));

process.stdout.write(
  `${formatStatus("ok", `Archive available at ${archivePath}`)}\n`
);
process.stdout.write(
  `${formatStatus("ok", `Vendor runtime present at ${vendorDir}`)}\n`
);
process.stdout.write(
  `${formatStatus("ok", `Manifest loaded from ${manifestPath}`)}\n`
);

for (const rpcCheck of rpcChecks) {
  process.stdout.write(
    `${formatStatus(rpcCheck.ok ? "ok" : "warn", rpcCheck.message)}\n`
  );
}

process.stdout.write("Local lab check completed.\n");

async function ensureReadable(filePath) {
  try {
    await access(filePath, constants.R_OK);
  } catch {
    throw new Error(`Missing required lab artifact: ${filePath}`);
  }
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("runtime/manifest.json must contain a JSON object.");
  }

  if (!Array.isArray(manifest.nodes) || manifest.nodes.length < 2) {
    throw new Error("runtime/manifest.json must list both local lab nodes.");
  }

  for (const node of manifest.nodes) {
    if (!node?.name || !node?.rpc || !node?.p2p) {
      throw new Error(
        "Each manifest node must include name, rpc, and p2p fields."
      );
    }
  }
}

async function checkRpcHealth(node) {
  try {
    const response = await fetch(node.rpc, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `fiberops-lab-check-${node.name}`,
        method: "node_info",
        params: []
      }),
      signal: AbortSignal.timeout(2000)
    });

    const responseText = await response.text();
    let payload = null;
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        message: `${node.name} RPC check skipped: HTTP ${response.status}${payload?.error?.message ? ` (${payload.error.message})` : ""}`
      };
    }

    if (payload?.error) {
      return {
        ok: false,
        message: `${node.name} RPC responded with JSON-RPC error ${payload.error.code}: ${payload.error.message}`
      };
    }

    return {
      ok: true,
      message: `${node.name} RPC reachable at ${node.rpc}`
    };
  } catch (error) {
    return {
      ok: false,
      message: `${node.name} RPC not reachable at ${node.rpc} (${error.message})`
    };
  }
}

function formatStatus(level, message) {
  const label = level === "ok" ? "OK" : "WARN";
  return `[${label}] ${message}`;
}
