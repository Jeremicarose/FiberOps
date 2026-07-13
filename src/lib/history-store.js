import {
  appendFile,
  mkdir,
  readFile,
  rename,
  writeFile
} from "node:fs/promises";
import path from "node:path";

const DEFAULT_LIMIT = 20;
const DEFAULT_BACKEND = "json-file";

export class HistoryStore {
  constructor({
    filePath,
    maxRecords = 200,
    enabled = Boolean(filePath),
    backendKind = DEFAULT_BACKEND
  } = {}) {
    this.filePath = filePath;
    this.maxRecords = maxRecords;
    this.enabled = enabled;
    this.backend = createHistoryStoreBackend({
      filePath,
      maxRecords,
      enabled,
      backendKind
    });
    this.type = this.backend.type;
  }

  async readAll() {
    return this.backend.readAll();
  }

  async append(record) {
    return this.backend.append(record);
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

  async getStatus() {
    return this.backend.getStatus();
  }
}

export function createHistoryStoreBackend({
  backendKind = DEFAULT_BACKEND,
  ...options
} = {}) {
  if (backendKind === "ndjson-file") {
    return new NdjsonFileHistoryAdapter(options);
  }
  return new JsonFileHistoryAdapter(options);
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

class JsonFileHistoryAdapter {
  constructor({
    filePath,
    maxRecords = 200,
    enabled = Boolean(filePath)
  } = {}) {
    this.filePath = filePath;
    this.maxRecords = maxRecords;
    this.enabled = enabled;
    this.type = "json-file";
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

  async getStatus() {
    return {
      configured: Boolean(this.filePath),
      enabled: this.enabled && Boolean(this.filePath),
      degraded: false,
      type: this.type,
      filePath: this.filePath || null,
      maxRecords: this.maxRecords
    };
  }
}

class NdjsonFileHistoryAdapter {
  constructor({
    filePath,
    maxRecords = 200,
    enabled = Boolean(filePath)
  } = {}) {
    this.filePath = filePath;
    this.maxRecords = maxRecords;
    this.enabled = enabled;
    this.type = "ndjson-file";
    this.writeQueue = Promise.resolve();
  }

  async readAll() {
    if (!this.enabled || !this.filePath) {
      return [];
    }

    try {
      const raw = await readFile(this.filePath, "utf8");
      return parseNdjsonRecords(raw);
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
      await mkdir(path.dirname(this.filePath), { recursive: true });

      const existingRaw = await safeReadText(this.filePath);
      if (looksLikeJsonArray(existingRaw)) {
        const migrated = parseNdjsonRecords(existingRaw);
        await writeNdjsonAtomically(this.filePath, migrated.slice().reverse());
      }

      await appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
      const records = await this.readAll();

      if (records.length > this.maxRecords * 2) {
        await writeNdjsonAtomically(
          this.filePath,
          records.slice(0, this.maxRecords).reverse()
        );
        return records.slice(0, this.maxRecords);
      }

      return records.slice(0, this.maxRecords);
    });

    try {
      return await this.writeQueue;
    } catch (error) {
      this.writeQueue = Promise.resolve();
      throw error;
    }
  }

  async getStatus() {
    return {
      configured: Boolean(this.filePath),
      enabled: this.enabled && Boolean(this.filePath),
      degraded: false,
      type: this.type,
      filePath: this.filePath || null,
      maxRecords: this.maxRecords
    };
  }
}

function parseNdjsonRecords(raw) {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) {
    return [];
  }

  if (looksLikeJsonArray(trimmed)) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  }

  const records = [];
  for (const line of trimmed.split("\n")) {
    const value = line.trim();
    if (!value) {
      continue;
    }
    records.push(JSON.parse(value));
  }

  return records.reverse();
}

async function safeReadText(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function looksLikeJsonArray(raw) {
  return typeof raw === "string" && raw.trim().startsWith("[");
}

async function writeJsonAtomically(filePath, payload) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });

  const tempPath = `${filePath}.${process.pid}.${globalThis.crypto?.randomUUID?.() || Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(payload, null, 2), "utf8");
  await rename(tempPath, filePath);
}

async function writeNdjsonAtomically(filePath, records) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });

  const tempPath = `${filePath}.${process.pid}.${globalThis.crypto?.randomUUID?.() || Date.now()}.tmp`;
  const payload = records.map((record) => JSON.stringify(record)).join("\n");
  await writeFile(tempPath, payload ? `${payload}\n` : "", "utf8");
  await rename(tempPath, filePath);
}
