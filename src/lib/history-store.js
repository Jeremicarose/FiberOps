import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_LIMIT = 20;

export class HistoryStore {
  constructor({
    filePath,
    maxRecords = 200,
    enabled = Boolean(filePath)
  } = {}) {
    this.filePath = filePath;
    this.maxRecords = maxRecords;
    this.enabled = enabled;
    this.writeQueue = Promise.resolve();
  }

  async readAll() {
    if (!this.enabled || !this.filePath) {
      return [];
    }

    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error?.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async append(record) {
    if (!this.enabled || !this.filePath) {
      return [];
    }

    this.writeQueue = this.writeQueue.then(async () => {
      const records = await this.readAll();
      records.unshift(record);
      const nextRecords = records.slice(0, this.maxRecords);
      await writeJsonAtomically(this.filePath, nextRecords);
      return nextRecords;
    });

    try {
      return await this.writeQueue;
    } catch (error) {
      this.writeQueue = Promise.resolve();
      throw error;
    }
  }

  async listRecent(limit = DEFAULT_LIMIT) {
    const records = await this.readAll();
    return records.slice(0, limit);
  }

  async findRelated(currentRecord, { limit = DEFAULT_LIMIT } = {}) {
    const records = await this.readAll();
    return records
      .filter((record) => {
        if (record.event?.id === currentRecord.event?.id) {
          return false;
        }
        return buildComparisonKey(record) === buildComparisonKey(currentRecord);
      })
      .slice(0, limit);
  }
}

export function buildComparisonKey(record) {
  const request = record?.request || {};
  const normalizedAmount = normalizeAmountBucket(
    request.amount || record?.probe?.requestedAmount || null
  );
  const target =
    request.targetPubkey || record?.summary?.targetPubkey || "unknown-target";
  const invoiceTarget = request.invoice ? "invoice" : "direct";
  const nodes = Array.isArray(record?.nodes)
    ? record.nodes
        .map((node) => node.name || node.endpoint || "unknown-node")
        .sort()
        .join(",")
    : "single";

  return [nodes, target, normalizedAmount, invoiceTarget].join("|");
}

export function normalizeAmountBucket(value) {
  if (value === null || value === undefined || value === "") {
    return "unknown-amount";
  }

  try {
    const amount = BigInt(value);
    if (amount <= 100000000n) {
      return "small";
    }
    if (amount <= 1000000000n) {
      return "medium";
    }
    return "large";
  } catch {
    return String(value);
  }
}

async function writeJsonAtomically(filePath, payload) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });

  const tempPath = `${filePath}.${process.pid}.${globalThis.crypto?.randomUUID?.() || Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(payload, null, 2), "utf8");
  await rename(tempPath, filePath);
}
