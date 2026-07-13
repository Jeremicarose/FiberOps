import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");

const runtimeDir =
  process.env.FIBEROPS_RUNTIME_DIR || path.join(rootDir, "runtime");
const vendorRoot = process.env.FIBEROPS_VENDOR_DIR
  ? path.dirname(process.env.FIBEROPS_VENDOR_DIR)
  : path.join(rootDir, "vendor");

await rm(runtimeDir, { recursive: true, force: true });
await rm(vendorRoot, { recursive: true, force: true });

process.stdout.write(
  `Removed generated local lab state from ${runtimeDir} and ${vendorRoot}.\n`
);
