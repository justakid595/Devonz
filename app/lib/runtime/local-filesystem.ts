/**
 * @module local-filesystem
 * Server-side filesystem implementation using Node.js native `fs` module.
 *
 * All operations are scoped to a project directory. Paths are resolved
 * relative to the project root and validated against traversal attacks.
 *
 * @remarks This module is SERVER-ONLY — it imports `node:fs/promises` and
 * `node:path` which are not available in the browser.
 */

import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import { watch as fsWatch, type FSWatcher } from 'node:fs';
import type { RuntimeFileSystem, DirEntry, FileStat, WatchEvent, WatchCallback, Disposer } from './runtime-provider';
import { isSafePath } from './runtime-provider';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('LocalFileSystem');

/**
 * Node.js native filesystem implementation for local project execution.
 *
 * Every path operation:
 * 1. Validates the path is safe (no traversal)
 * 2. Resolves it against the project root
 * 3. Performs the native fs operation
 */
export class LocalFileSystem implements RuntimeFileSystem {
  readonly #root: string;

  constructor(projectRoot: string) {
    this.#root = nodePath.resolve(projectRoot);
  }

  /** Resolve a relative path to an absolute path within the project root. */
  #resolve(relativePath: string): string {
    if (!isSafePath(relativePath)) {
      throw new Error(`Path traversal rejected: ${relativePath}`);
    }

    const resolved = nodePath.resolve(this.#root, relativePath);

    // Double-check: resolved path must be within root
    if (!resolved.startsWith(this.#root)) {
      throw new Error(`Path escapes project boundary: ${relativePath}`);
    }

    return resolved;
  }

  async readFile(path: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    const resolved = this.#resolve(path);
    return fs.readFile(resolved, { encoding });
  }

  async readFileRaw(path: string): Promise<Uint8Array> {
    const resolved = this.#resolve(path);
    const buffer = await fs.readFile(resolved);

    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    const resolved = this.#resolve(path);
    const dir = nodePath.dirname(resolved);

    // Auto-create parent directories
    await fs.mkdir(dir, { recursive: true });

    if (content instanceof Uint8Array) {
      await fs.writeFile(resolved, content);
    } else {
      await fs.writeFile(resolved, content, 'utf-8');
    }
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const resolved = this.#resolve(path);
    await fs.mkdir(resolved, { recursive: options?.recursive ?? false });
  }

  async readdir(path: string): Promise<DirEntry[]> {
    const resolved = this.#resolve(path);
    const entries = await fs.readdir(resolved, { withFileTypes: true });

    return entries.map((entry) => ({
      name: entry.name,
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory(),
    }));
  }

  async stat(path: string): Promise<FileStat> {
    const resolved = this.#resolve(path);
    const stats = await fs.stat(resolved);

    return {
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      mtime: stats.mtime.toISOString(),
    };
  }

  async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    const resolved = this.#resolve(path);

    await fs.rm(resolved, {
      recursive: options?.recursive ?? false,
      force: options?.force ?? false,
    });
  }

  async exists(path: string): Promise<boolean> {
    const resolved = this.#resolve(path);

    try {
      await fs.access(resolved);
      return true;
    } catch {
      return false;
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const resolvedOld = this.#resolve(oldPath);
    const resolvedNew = this.#resolve(newPath);

    // Auto-create destination parent directory
    const destDir = nodePath.dirname(resolvedNew);
    await fs.mkdir(destDir, { recursive: true });

    await fs.rename(resolvedOld, resolvedNew);
  }

  /**
   * Watch for file-system changes using Node.js `fs.watch` (recursive).
   *
   * @remarks Uses native `fs.watch` with `{ recursive: true }` which is
   * supported on macOS and Windows. On Linux, recursive watching requires
   * `chokidar` — we'll add that dependency in Phase 2 if needed.
   * For Phase 1 this provides basic watch capability.
   */
  watch(glob: string, callback: WatchCallback): Disposer {
    const watchers: FSWatcher[] = [];

    // Buffer events to avoid flooding the callback
    let pending: WatchEvent[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const FLUSH_DELAY = 100;

    const flush = () => {
      if (pending.length > 0) {
        const batch = [...pending];
        pending = [];
        callback(batch);
      }

      flushTimer = null;
    };

    const scheduleFlush = () => {
      if (flushTimer === null) {
        flushTimer = setTimeout(flush, FLUSH_DELAY);
      }
    };

    try {
      const watcher = fsWatch(this.#root, { recursive: true }, (eventType, filename) => {
        if (!filename) {
          return;
        }

        // Normalize path separators
        const normalizedPath = filename.replace(/\\/g, '/');

        // Simple glob matching for `**/*` (match all)
        // More sophisticated glob matching can be added later
        if (glob !== '**/*' && glob !== '*') {
          // Basic extension matching: `*.ts` → ends with .ts
          if (glob.startsWith('*.')) {
            const ext = glob.slice(1);

            if (!normalizedPath.endsWith(ext)) {
              return;
            }
          }
        }

        const watchEvent: WatchEvent = {
          type: eventType === 'rename' ? 'add' : 'change',
          path: normalizedPath,
        };

        pending.push(watchEvent);
        scheduleFlush();
      });

      watchers.push(watcher);
    } catch (error) {
      logger.warn('Failed to start file watcher:', error);
    }

    return () => {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
      }

      for (const watcher of watchers) {
        watcher.close();
      }
    };
  }
}
