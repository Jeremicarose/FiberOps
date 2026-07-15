import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execFile = promisify(execFileCallback);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

test("prepare-vps-stack renders a one-node private-rpc config", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "fiberops-vps-"));

  await execFile("node", [
    "scripts/prepare-vps-stack.mjs",
    "--output-dir",
    outputDir
  ], {
    cwd: repoRoot
  });

  const config = await readFile(
    path.join(outputDir, "node1", "config.yml"),
    "utf8"
  );

  assert.match(config, /listening_addr: "\/ip4\/0\.0\.0\.0\/tcp\/8228"/);
  assert.match(config, /listening_addr: "0\.0\.0\.0:8227"/);
});

test("prepare-vps-stack renders the optional second node", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "fiberops-vps-"));

  await execFile("node", [
    "scripts/prepare-vps-stack.mjs",
    "--two-node",
    "--output-dir",
    outputDir
  ], {
    cwd: repoRoot
  });

  const config = await readFile(
    path.join(outputDir, "node2", "config.yml"),
    "utf8"
  );

  assert.match(config, /listening_addr: "\/ip4\/0\.0\.0\.0\/tcp\/8238"/);
  assert.match(config, /listening_addr: "0\.0\.0\.0:8237"/);
});

test("compose stack publishes app and p2p ports but not raw rpc", async () => {
  const compose = await readFile(
    path.join(repoRoot, "deploy", "vps", "docker-compose.yml"),
    "utf8"
  );
  const override = await readFile(
    path.join(repoRoot, "deploy", "vps", "docker-compose.two-node.yml"),
    "utf8"
  );

  assert.match(compose, /FIBER_RPC_URL: http:\/\/fiber-node:8227/);
  assert.match(compose, /\$\{FIBEROPS_PUBLIC_PORT:-3000\}:3000/);
  assert.match(compose, /\$\{FIBER_NODE1_P2P_PUBLIC_PORT:-8228\}:8228/);
  assert.doesNotMatch(compose, /8227:8227/);
  assert.match(override, /FIBER_RPC_URL_NODE2: http:\/\/fiber-node-2:8237/);
  assert.match(override, /\$\{FIBER_NODE2_P2P_PUBLIC_PORT:-8238\}:8238/);
  assert.doesNotMatch(override, /8237:8237/);
});
