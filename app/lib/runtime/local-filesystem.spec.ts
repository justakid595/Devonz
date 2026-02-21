/**
 * Unit tests for LocalFileSystem.
 *
 * Uses real temp directories to exercise actual filesystem operations
 * rather than mocking — this validates the implementation end-to-end
 * including path resolution, traversal guards, and auto-mkdir logic.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import { LocalFileSystem } from './local-filesystem';

describe('LocalFileSystem', () => {
  let tmpDir: string;
  let localFs: LocalFileSystem;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'devonz-test-'));
    localFs = new LocalFileSystem(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('writeFile + readFile', () => {
    it('should write and read a text file', async () => {
      await localFs.writeFile('hello.txt', 'Hello World');

      const content = await localFs.readFile('hello.txt');

      expect(content).toBe('Hello World');
    });

    it('should auto-create parent directories on write', async () => {
      await localFs.writeFile('deep/nested/dir/file.ts', 'const x = 1;');

      const content = await localFs.readFile('deep/nested/dir/file.ts');

      expect(content).toBe('const x = 1;');
    });

    it('should overwrite existing files', async () => {
      await localFs.writeFile('file.txt', 'version 1');
      await localFs.writeFile('file.txt', 'version 2');

      const content = await localFs.readFile('file.txt');

      expect(content).toBe('version 2');
    });

    it('should write and read binary data', async () => {
      const data = new Uint8Array([0x00, 0x01, 0x02, 0xff]);
      await localFs.writeFile('binary.dat', data);

      const result = await localFs.readFileRaw('binary.dat');

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result[0]).toBe(0x00);
      expect(result[3]).toBe(0xff);
      expect(result.length).toBe(4);
    });

    it('should read file with specific encoding', async () => {
      await localFs.writeFile('utf8.txt', 'café');

      const content = await localFs.readFile('utf8.txt', 'utf-8');

      expect(content).toBe('café');
    });
  });

  describe('path traversal protection', () => {
    it('should reject parent directory traversal via ..', async () => {
      await expect(localFs.readFile('../outside.txt')).rejects.toThrow('Path traversal rejected');
    });

    it('should reject traversal hidden in nested path', async () => {
      await expect(localFs.writeFile('a/../../escape.txt', 'data')).rejects.toThrow('Path traversal rejected');
    });

    it('should reject absolute Unix paths', async () => {
      await expect(localFs.readFile('/etc/passwd')).rejects.toThrow('Path traversal rejected');
    });

    it('should reject absolute Windows paths', async () => {
      await expect(localFs.readFile('C:\\Windows\\System32\\config')).rejects.toThrow('Path traversal rejected');
    });

    it('should allow relative paths within the project', async () => {
      await localFs.writeFile('src/app.ts', 'export {}');

      const content = await localFs.readFile('src/app.ts');

      expect(content).toBe('export {}');
    });
  });

  describe('mkdir', () => {
    it('should create a directory', async () => {
      await localFs.mkdir('new-dir');

      const stat = await localFs.stat('new-dir');

      expect(stat.isDirectory).toBe(true);
    });

    it('should create nested directories with recursive option', async () => {
      await localFs.mkdir('a/b/c', { recursive: true });

      const stat = await localFs.stat('a/b/c');

      expect(stat.isDirectory).toBe(true);
    });

    it('should not throw when creating an existing directory with recursive', async () => {
      await localFs.mkdir('existing', { recursive: true });
      await localFs.mkdir('existing', { recursive: true });

      const stat = await localFs.stat('existing');

      expect(stat.isDirectory).toBe(true);
    });
  });

  describe('readdir', () => {
    it('should list directory entries', async () => {
      await localFs.writeFile('file1.txt', 'content');
      await localFs.writeFile('file2.ts', 'export {}');
      await localFs.mkdir('subdir');

      const entries = await localFs.readdir('.');
      const names = entries.map((e) => e.name).sort();

      expect(names).toContain('file1.txt');
      expect(names).toContain('file2.ts');
      expect(names).toContain('subdir');
    });

    it('should correctly identify files and directories', async () => {
      await localFs.writeFile('readme.md', '# Hello');
      await localFs.mkdir('src');

      const entries = await localFs.readdir('.');

      const file = entries.find((e) => e.name === 'readme.md');
      const dir = entries.find((e) => e.name === 'src');

      expect(file?.isFile).toBe(true);
      expect(file?.isDirectory).toBe(false);
      expect(dir?.isFile).toBe(false);
      expect(dir?.isDirectory).toBe(true);
    });

    it('should list subdirectory contents', async () => {
      await localFs.writeFile('src/a.ts', '');
      await localFs.writeFile('src/b.ts', '');

      const entries = await localFs.readdir('src');

      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.name).sort()).toEqual(['a.ts', 'b.ts']);
    });
  });

  describe('stat', () => {
    it('should return file metadata', async () => {
      await localFs.writeFile('data.json', '{"key": "value"}');

      const stat = await localFs.stat('data.json');

      expect(stat.isFile).toBe(true);
      expect(stat.isDirectory).toBe(false);
      expect(stat.size).toBeGreaterThan(0);
      expect(stat.mtime).toBeTruthy();

      /* Verify mtime is a valid ISO-8601 date string */
      expect(new Date(stat.mtime).toISOString()).toBe(stat.mtime);
    });

    it('should return directory metadata', async () => {
      await localFs.mkdir('my-dir');

      const stat = await localFs.stat('my-dir');

      expect(stat.isFile).toBe(false);
      expect(stat.isDirectory).toBe(true);
    });

    it('should throw on non-existent paths', async () => {
      await expect(localFs.stat('nonexistent.txt')).rejects.toThrow();
    });
  });

  describe('exists', () => {
    it('should return true for existing files', async () => {
      await localFs.writeFile('exists.txt', 'yes');

      expect(await localFs.exists('exists.txt')).toBe(true);
    });

    it('should return true for existing directories', async () => {
      await localFs.mkdir('exists-dir');

      expect(await localFs.exists('exists-dir')).toBe(true);
    });

    it('should return false for non-existent paths', async () => {
      expect(await localFs.exists('ghost.txt')).toBe(false);
    });
  });

  describe('rm', () => {
    it('should remove a file', async () => {
      await localFs.writeFile('removeme.txt', 'bye');
      await localFs.rm('removeme.txt');

      expect(await localFs.exists('removeme.txt')).toBe(false);
    });

    it('should remove a directory recursively', async () => {
      await localFs.writeFile('rmdir/a.txt', 'a');
      await localFs.writeFile('rmdir/b/c.txt', 'c');
      await localFs.rm('rmdir', { recursive: true });

      expect(await localFs.exists('rmdir')).toBe(false);
    });

    it('should force-remove non-existent paths without throwing', async () => {
      await localFs.rm('never-existed.txt', { force: true });

      /* No error thrown — success */
    });
  });

  describe('rename', () => {
    it('should rename a file', async () => {
      await localFs.writeFile('old.txt', 'data');
      await localFs.rename('old.txt', 'new.txt');

      expect(await localFs.exists('old.txt')).toBe(false);
      expect(await localFs.readFile('new.txt')).toBe('data');
    });

    it('should move a file to a new directory', async () => {
      await localFs.writeFile('src/file.ts', 'code');
      await localFs.rename('src/file.ts', 'dist/file.ts');

      expect(await localFs.exists('src/file.ts')).toBe(false);
      expect(await localFs.readFile('dist/file.ts')).toBe('code');
    });

    it('should auto-create destination parent directory', async () => {
      await localFs.writeFile('file.txt', 'content');
      await localFs.rename('file.txt', 'deep/nested/new-name.txt');

      expect(await localFs.readFile('deep/nested/new-name.txt')).toBe('content');
    });
  });

  describe('watch', () => {
    it('should return a disposer function', () => {
      const disposer = localFs.watch('**/*', () => {
        /* no-op */
      });

      expect(typeof disposer).toBe('function');

      /* Clean up */
      disposer();
    });
  });
});
