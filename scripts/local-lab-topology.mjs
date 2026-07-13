import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const rootDir = path.join(__dirname, "..");

export function getLocalLabPaths() {
  const runtimeDir =
    process.env.FIBEROPS_RUNTIME_DIR || path.join(rootDir, "runtime");
  const vendorDir =
    process.env.FIBEROPS_VENDOR_DIR || path.join(rootDir, "vendor", "fnn");
  const archivePath =
    process.env.FIBEROPS_FNN_ARCHIVE ||
    path.join(rootDir, "fnn_v0.9.0-rc5-x86_64-darwin-portable.tar.gz");

  return {
    rootDir,
    runtimeDir,
    vendorDir,
    archivePath,
    manifestPath: path.join(runtimeDir, "manifest.json")
  };
}

export function getLocalLabTopology(paths = getLocalLabPaths()) {
  return {
    nodes: [
      {
        id: "node1",
        name: "node1",
        rpc: "http://127.0.0.1:8227",
        p2p: "/ip4/0.0.0.0/tcp/8228",
        runtimeDir: path.join(paths.runtimeDir, "node1"),
        configPath: path.join(paths.runtimeDir, "node1", "config.yml"),
        binaryPaths: {
          fnn: path.join(paths.runtimeDir, "node1", "fnn"),
          cli: path.join(paths.runtimeDir, "node1", "fnn-cli")
        }
      },
      {
        id: "node2",
        name: "node2",
        rpc: "http://127.0.0.1:8237",
        p2p: "/ip4/0.0.0.0/tcp/8238",
        runtimeDir: path.join(paths.runtimeDir, "node2"),
        configPath: path.join(paths.runtimeDir, "node2", "config.yml"),
        binaryPaths: {
          fnn: path.join(paths.runtimeDir, "node2", "fnn"),
          cli: path.join(paths.runtimeDir, "node2", "fnn-cli")
        }
      }
    ],
    vendorBinaries: {
      fnn: path.join(paths.vendorDir, "fnn"),
      cli: path.join(paths.vendorDir, "fnn-cli")
    }
  };
}

export function createLocalLabManifest(paths = getLocalLabPaths()) {
  const topology = getLocalLabTopology(paths);
  return {
    generatedAt: new Date().toISOString(),
    archivePath: paths.archivePath,
    vendorDir: paths.vendorDir,
    nodes: topology.nodes.map((node) => ({
      name: node.name,
      rpc: node.rpc,
      p2p: node.p2p
    }))
  };
}

export function getRequiredLabArtifacts(paths = getLocalLabPaths()) {
  const topology = getLocalLabTopology(paths);
  return [
    paths.archivePath,
    topology.vendorBinaries.fnn,
    topology.vendorBinaries.cli,
    paths.manifestPath,
    ...topology.nodes.flatMap((node) => [
      node.binaryPaths.fnn,
      node.binaryPaths.cli,
      node.configPath
    ])
  ];
}

export function resolveContainedPath(rootDir, targetPath) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedPath = path.resolve(resolvedRoot, targetPath);
  const relative = path.relative(resolvedRoot, resolvedPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes lab root: ${targetPath}`);
  }

  return resolvedPath;
}
