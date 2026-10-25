'use strict';

const fs = require('node:fs/promises');
const { constants: fsConstants } = require('node:fs');
const path = require('node:path');
const { sanitizeDocument, isLegacyProgress } = require('./progress-schema');

const MAX_BYTES = 4 * 1024 * 1024; // up to 8 players with 1,500 words each fits well under this

/**
 * Persists progress as JSON in the user's profile folder.
 * Writes are atomic (temp file + rename) and serialised so a crash or a burst
 * of saves can never leave a half-written file behind.
 */
class ProgressStore {
  constructor(filePath, { maxBytes = MAX_BYTES } = {}) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
      throw new TypeError('ProgressStore needs an absolute file path');
    }
    this.filePath = filePath;
    this.maxBytes = maxBytes;
    this.queue = Promise.resolve();
  }

  async load() {
    let raw;
    try {
      const stat = await fs.stat(this.filePath);
      if (!stat.isFile()) return null;
      if (stat.size > this.maxBytes) {
        await this.quarantine();
        return null;
      }
      raw = await fs.readFile(this.filePath, 'utf8');
    } catch (err) {
      if (err && err.code === 'ENOENT') return null;
      throw err;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await this.quarantine();
      return null;
    }
    // Keep a copy of a version 1 save before it is upgraded, so nothing can be lost.
    if (isLegacyProgress(parsed)) await this.backupLegacy();
    return sanitizeDocument(parsed);
  }

  save(data) {
    const clean = sanitizeDocument(data);
    const json = JSON.stringify(clean);
    if (Buffer.byteLength(json, 'utf8') > this.maxBytes) {
      return Promise.reject(new RangeError('Progress data is too large to save'));
    }
    const run = async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
      try {
        await fs.writeFile(tmp, json, { encoding: 'utf8', mode: 0o600 });
        await fs.rename(tmp, this.filePath);
      } catch (err) {
        await fs.rm(tmp, { force: true });
        throw err;
      }
      return clean;
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  async backupLegacy() {
    try {
      await fs.copyFile(this.filePath, `${this.filePath}.v1-backup`, fsConstants.COPYFILE_EXCL);
    } catch {
      /* a backup already exists, or copying failed: never block loading */
    }
  }

  /** Keep a corrupt file for inspection instead of silently deleting it. */
  async quarantine() {
    const backup = `${this.filePath}.corrupt-${Date.now()}`;
    try {
      await fs.rename(this.filePath, backup);
    } catch {
      /* best effort */
    }
  }
}

module.exports = { ProgressStore, MAX_BYTES };
