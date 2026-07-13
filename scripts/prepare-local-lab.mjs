import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  createLocalLabManifest,
  getLocalLabPaths,
  getLocalLabTopology
} from "./local-lab-topology.mjs";

const rootDir = process.cwd();
const { archivePath, runtimeDir, vendorDir, manifestPath } = getLocalLabPaths();
const topology = getLocalLabTopology();
const force =
  process.argv.includes("--force") || process.env.FIBEROPS_LAB_FORCE === "1";

if (!existsSync(archivePath)) {
  throw new Error(
    `Missing local lab archive at ${archivePath}. Set FIBEROPS_FNN_ARCHIVE or place the portable bundle in the repo root.`
  );
}

await mkdir(vendorDir, { recursive: true });
await mkdir(runtimeDir, { recursive: true });
for (const node of topology.nodes) {
  await mkdir(node.runtimeDir, { recursive: true });
}

extractArchiveFile("fnn", vendorDir);
extractArchiveFile("fnn-cli", vendorDir);

for (const node of topology.nodes) {
  await syncBinary(path.join(vendorDir, "fnn"), node.binaryPaths.fnn);
  await syncBinary(path.join(vendorDir, "fnn-cli"), node.binaryPaths.cli);
}

const baseConfig = readArchiveText("config/testnet/config.yml");
await writeConfigIfNeeded(topology.nodes[0].configPath, baseConfig);
await writeConfigIfNeeded(topology.nodes[1].configPath, createNode2Config(baseConfig));

await writeFile(manifestPath, JSON.stringify(createLocalLabManifest(), null, 2));

process.stdout.write(
  `Prepared Fiber local lab in ${runtimeDir}. Run \"npm run lab:check\" to validate the generated state.\n`
);

async function syncBinary(sourcePath, targetPath) {
  await copyFile(sourcePath, targetPath);
  await chmod(targetPath, 0o755);
}

async function writeConfigIfNeeded(filePath, contents) {
  if (!force && existsSync(filePath)) {
    return;
  }
  await writeFile(filePath, contents, "utf8");
}

function createNode2Config(node1Config) {
  return node1Config
    .replace("/ip4/0.0.0.0/tcp/8228", "/ip4/0.0.0.0/tcp/8238")
    .replace("127.0.0.1:8227", "127.0.0.1:8237");
}

function extractArchiveFile(archiveEntry, destinationDir) {
  const result = spawnSync(
    "tar",
    ["-xzf", archivePath, "-C", destinationDir, archiveEntry],
    {
      cwd: rootDir,
      encoding: "utf8"
    }
  );

  if (result.status !== 0) {
    throw new Error(
      result.stderr || `Failed to extract ${archiveEntry} from ${archivePath}.`
    );
  }
}

function readArchiveText(archiveEntry) {
  const result = spawnSync("tar", ["-xOf", archivePath, archiveEntry], {
    cwd: rootDir,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(
      result.stderr || `Failed to read ${archiveEntry} from ${archivePath}.`
    );
  }

  return result.stdout;
}
