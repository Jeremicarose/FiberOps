import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");

const archivePath =
  process.env.FIBEROPS_FNN_ARCHIVE ||
  path.join(rootDir, "fnn_v0.9.0-rc5-x86_64-darwin-portable.tar.gz");
const runtimeDir =
  process.env.FIBEROPS_RUNTIME_DIR || path.join(rootDir, "runtime");
const vendorDir =
  process.env.FIBEROPS_VENDOR_DIR || path.join(rootDir, "vendor", "fnn");
const force =
  process.argv.includes("--force") || process.env.FIBEROPS_LAB_FORCE === "1";

if (!existsSync(archivePath)) {
  throw new Error(
    `Missing local lab archive at ${archivePath}. Set FIBEROPS_FNN_ARCHIVE or place the portable bundle in the repo root.`
  );
}

await mkdir(vendorDir, { recursive: true });
await mkdir(runtimeDir, { recursive: true });
await mkdir(path.join(runtimeDir, "node1"), { recursive: true });
await mkdir(path.join(runtimeDir, "node2"), { recursive: true });

extractArchiveFile("fnn", vendorDir);
extractArchiveFile("fnn-cli", vendorDir);

await syncBinary(
  path.join(vendorDir, "fnn"),
  path.join(runtimeDir, "node1", "fnn")
);
await syncBinary(
  path.join(vendorDir, "fnn-cli"),
  path.join(runtimeDir, "node1", "fnn-cli")
);
await syncBinary(
  path.join(vendorDir, "fnn"),
  path.join(runtimeDir, "node2", "fnn")
);
await syncBinary(
  path.join(vendorDir, "fnn-cli"),
  path.join(runtimeDir, "node2", "fnn-cli")
);

const baseConfig = readArchiveText("config/testnet/config.yml");
await writeConfigIfNeeded(
  path.join(runtimeDir, "node1", "config.yml"),
  baseConfig
);
await writeConfigIfNeeded(
  path.join(runtimeDir, "node2", "config.yml"),
  createNode2Config(baseConfig)
);

await writeFile(
  path.join(runtimeDir, "manifest.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      archivePath,
      vendorDir,
      nodes: [
        {
          name: "node1",
          rpc: "http://127.0.0.1:8227",
          p2p: "/ip4/0.0.0.0/tcp/8228"
        },
        {
          name: "node2",
          rpc: "http://127.0.0.1:8237",
          p2p: "/ip4/0.0.0.0/tcp/8238"
        }
      ]
    },
    null,
    2
  )
);

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
