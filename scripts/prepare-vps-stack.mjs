#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");
const deployDir = path.join(rootDir, "deploy", "vps");
const templatePath = path.join(deployDir, "fiber-config.template.yml");

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const includeSecondNode = args.has("--two-node");
const outputDir = resolveOutputDir(rawArgs);

const template = await readFile(templatePath, "utf8");

await renderNode({
  nodeId: "node1",
  rpcPort: 8227,
  p2pPort: 8228,
  outputDir,
  template
});

if (includeSecondNode) {
  await renderNode({
    nodeId: "node2",
    rpcPort: 8237,
    p2pPort: 8238,
    outputDir,
    template
  });
}

await mkdir(path.join(outputDir, "fiberops"), { recursive: true });

process.stdout.write(
  [
    `Prepared VPS judging stack state in ${outputDir}`,
    "- Rendered node1 config with private RPC on 0.0.0.0:8227 for the Docker network.",
    includeSecondNode
      ? "- Rendered node2 config with private RPC on 0.0.0.0:8237 for two-node comparison."
      : "- Re-run with --two-node to render node2 as well.",
    "- Place Fiber key material under deploy/vps/state/node*/ckb before starting Docker Compose."
  ].join("\n") + "\n"
);

async function renderNode({ nodeId, rpcPort, p2pPort, outputDir, template }) {
  const nodeDir = path.join(outputDir, nodeId);
  await mkdir(path.join(nodeDir, "ckb"), { recursive: true });

  const rendered = template
    .replaceAll("__FIBER_RPC_BIND_HOST__", "0.0.0.0")
    .replaceAll("__FIBER_RPC_PORT__", String(rpcPort))
    .replaceAll("__FIBER_P2P_PORT__", String(p2pPort));

  await writeFile(path.join(nodeDir, "config.yml"), rendered, "utf8");
}
function resolveOutputDir(args) {
  const index = args.indexOf("--output-dir");
  if (index >= 0 && args[index + 1]) {
    return path.resolve(args[index + 1]);
  }
  return path.join(deployDir, "state");
}
