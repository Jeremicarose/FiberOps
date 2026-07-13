import { rm } from "node:fs/promises";

import {
  getLocalLabPaths,
  resolveContainedPath,
  rootDir
} from "./local-lab-topology.mjs";

const { runtimeDir, vendorDir } = getLocalLabPaths();
const runtimeTarget = resolveContainedPath(rootDir, runtimeDir);
const vendorTarget = resolveContainedPath(rootDir, vendorDir);

await rm(runtimeTarget, { recursive: true, force: true });
await rm(vendorTarget, { recursive: true, force: true });

process.stdout.write(
  `Removed generated local lab state from ${runtimeTarget} and ${vendorTarget}.\n`
);
