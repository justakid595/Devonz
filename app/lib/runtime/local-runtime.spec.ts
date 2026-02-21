/**
 * Unit tests for LocalRuntime and RuntimeManager.
 *
 * Tests cover:
 * - Runtime boot and project ID validation
 * - Command execution (exec)
 * - Process spawning (spawn) with I/O
 * - Terminal session management
 * - Port detection from process output
 * - RuntimeManager singleton and project lifecycle
 * - Teardown cleanup
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import { LocalRuntime, RuntimeManager } from './local-runtime';

describe('LocalRuntime', () => {
  let tmpDir: string;
  let runtime: LocalRuntime;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'devonz-runtime-test-'));
    runtime = new LocalRuntime({ projectsDir: tmpDir });
  });

  afterEach(async () => {
    try {
      await runtime.teardown();
    } catch {
      /* Teardown may fail if already torn down */
    }

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('boot', () => {
    it('should boot successfully with a valid project ID', async () => {
      await runtime.boot('test-project');

      expect(runtime.projectId).toBe('test-project');
      expect(runtime.workdir).toBe(nodePath.join(tmpDir, 'test-project'));
    });

    it('should create the project directory on boot', async () => {
      await runtime.boot('new-project');

      const stat = await fs.stat(nodePath.join(tmpDir, 'new-project'));

      expect(stat.isDirectory()).toBe(true);
    });

    it('should reject invalid project IDs', async () => {
      await expect(runtime.boot('../escape')).rejects.toThrow('Invalid project ID');
      await expect(runtime.boot('')).rejects.toThrow('Invalid project ID');
      await expect(runtime.boot('has spaces')).rejects.toThrow('Invalid project ID');
      await expect(runtime.boot('a'.repeat(65))).rejects.toThrow('Invalid project ID');
    });

    it('should accept valid project IDs with hyphens and underscores', async () => {
      await runtime.boot('my-cool_project-123');

      expect(runtime.projectId).toBe('my-cool_project-123');
    });

    it('should set type to local', () => {
      expect(runtime.type).toBe('local');
    });
  });

  describe('exec', () => {
    beforeEach(async () => {
      await runtime.boot('exec-test');
    });

    it('should execute a simple command and return output', async () => {
      const result = await runtime.exec('echo hello');

      expect(result.exitCode).toBe(0);
      expect(result.output.trim()).toContain('hello');
    });

    it('should capture stderr in output', async () => {
      const isWindows = os.platform() === 'win32';
      const command = isWindows ? 'echo error 1>&2' : 'echo error >&2';
      const result = await runtime.exec(command);

      expect(result.output).toContain('error');
    });

    it('should return non-zero exit code for failed commands', async () => {
      const isWindows = os.platform() === 'win32';
      const command = isWindows ? 'exit /b 42' : 'exit 42';
      const result = await runtime.exec(command);

      expect(result.exitCode).not.toBe(0);
    });

    it('should throw if runtime is not booted', async () => {
      const unboooted = new LocalRuntime({ projectsDir: tmpDir });

      await expect(unboooted.exec('echo test')).rejects.toThrow('Runtime not booted');
    });

    it('should use the project directory as cwd', async () => {
      const isWindows = os.platform() === 'win32';
      const command = isWindows ? 'cd' : 'pwd';
      const result = await runtime.exec(command);

      expect(result.output.trim()).toContain('exec-test');
    });

    it('should respect custom cwd option', async () => {
      await fs.mkdir(nodePath.join(tmpDir, 'exec-test', 'subdir'), { recursive: true });

      const isWindows = os.platform() === 'win32';
      const command = isWindows ? 'cd' : 'pwd';
      const result = await runtime.exec(command, { cwd: 'subdir' });

      expect(result.output.trim()).toContain('subdir');
    });

    it('should pass custom environment variables', async () => {
      const isWindows = os.platform() === 'win32';
      const command = isWindows ? 'echo %MY_VAR%' : 'echo $MY_VAR';
      const result = await runtime.exec(command, { env: { MY_VAR: 'custom_value' } });

      expect(result.output.trim()).toContain('custom_value');
    });
  });

  describe('spawn', () => {
    beforeEach(async () => {
      await runtime.boot('spawn-test');
    });

    it('should spawn a process and return a handle', async () => {
      const isWindows = os.platform() === 'win32';
      const cmd = isWindows ? 'cmd.exe' : 'echo';
      const args = isWindows ? ['/c', 'echo', 'spawned'] : ['spawned'];

      const proc = await runtime.spawn(cmd, args);

      expect(proc.id).toBeTruthy();
      expect(proc.pid).toBeGreaterThan(0);

      const exitCode = await proc.onExit;

      expect(exitCode).toBe(0);
    });

    it('should stream output via onData callback', async () => {
      const isWindows = os.platform() === 'win32';
      const cmd = isWindows ? 'cmd.exe' : 'echo';
      const args = isWindows ? ['/c', 'echo', 'stream-test'] : ['stream-test'];

      const proc = await runtime.spawn(cmd, args);
      const chunks: string[] = [];

      proc.onData((data) => {
        chunks.push(data);
      });

      await proc.onExit;

      const output = chunks.join('');

      expect(output).toContain('stream-test');
    });

    it('should allow removing a data listener via disposer', async () => {
      const isWindows = os.platform() === 'win32';
      const cmd = isWindows ? 'cmd.exe' : 'echo';
      const args = isWindows ? ['/c', 'echo', 'test'] : ['test'];

      const proc = await runtime.spawn(cmd, args);
      const fn = vi.fn();

      const dispose = proc.onData(fn);
      dispose();

      await proc.onExit;

      /* After disposal the listener should not have captured new data */
      expect(fn).not.toHaveBeenCalled();
    });

    it('should kill a spawned process', async () => {
      const isWindows = os.platform() === 'win32';
      const cmd = isWindows ? 'cmd.exe' : 'sleep';
      const args = isWindows ? ['/c', 'timeout', '/t', '30', '/nobreak'] : ['30'];

      const proc = await runtime.spawn(cmd, args);

      /* Kill after a short delay */
      setTimeout(() => proc.kill(), 100);

      const exitCode = await proc.onExit;

      /* The process should have been terminated (non-zero or signal) */
      expect(typeof exitCode).toBe('number');
    });
  });

  describe('getPreviewUrl', () => {
    it('should return localhost URL for a given port', () => {
      expect(runtime.getPreviewUrl(3000)).toBe('http://localhost:3000');
      expect(runtime.getPreviewUrl(8080)).toBe('http://localhost:8080');
    });
  });

  describe('onPortEvent', () => {
    it('should register and dispose port listeners', async () => {
      await runtime.boot('port-test');

      const callback = vi.fn();
      const dispose = runtime.onPortEvent(callback);

      expect(typeof dispose).toBe('function');
      dispose();
    });

    it('should detect ports from process output', async () => {
      await runtime.boot('port-detect');

      const portEvents: Array<{ port: number; type: string; url: string }> = [];
      runtime.onPortEvent((event) => portEvents.push(event));

      const isWindows = os.platform() === 'win32';
      const cmd = isWindows ? 'cmd.exe' : 'echo';
      const args = isWindows
        ? ['/c', 'echo', 'Server running at http://localhost:4567']
        : ['Server running at http://localhost:4567'];

      const proc = await runtime.spawn(cmd, args);
      await proc.onExit;

      /* Allow a tick for event processing */
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });

      expect(portEvents.length).toBeGreaterThanOrEqual(1);
      expect(portEvents[0].port).toBe(4567);
      expect(portEvents[0].type).toBe('open');
      expect(portEvents[0].url).toBe('http://localhost:4567');
    });
  });

  describe('terminal session management', () => {
    beforeEach(async () => {
      await runtime.boot('terminal-test');
    });

    it('should list active sessions', async () => {
      const isWindows = os.platform() === 'win32';
      const cmd = isWindows ? 'cmd.exe' : 'sleep';
      const args = isWindows ? ['/c', 'timeout', '/t', '5', '/nobreak'] : ['5'];

      const proc = await runtime.spawn(cmd, args);
      const sessions = runtime.listSessions();

      expect(sessions).toContain(proc.id);

      proc.kill();
      await proc.onExit;
    });

    it('should get a session by ID', async () => {
      const isWindows = os.platform() === 'win32';
      const cmd = isWindows ? 'cmd.exe' : 'sleep';
      const args = isWindows ? ['/c', 'timeout', '/t', '5', '/nobreak'] : ['5'];

      const proc = await runtime.spawn(cmd, args);
      const session = runtime.getSession(proc.id);

      expect(session).toBeDefined();
      expect(session?.id).toBe(proc.id);

      proc.kill();
      await proc.onExit;
    });

    it('should return undefined for non-existent session', () => {
      expect(runtime.getSession('nonexistent')).toBeUndefined();
    });

    it('should throw when writing to non-existent session', () => {
      expect(() => runtime.writeToSession('nonexistent', 'data')).toThrow('Terminal session not found');
    });

    it('should throw when killing non-existent session', () => {
      expect(() => runtime.killSession('nonexistent')).toThrow('Terminal session not found');
    });

    it('should kill a session by ID', async () => {
      const isWindows = os.platform() === 'win32';
      const cmd = isWindows ? 'cmd.exe' : 'sleep';
      const args = isWindows ? ['/c', 'timeout', '/t', '30', '/nobreak'] : ['30'];

      const proc = await runtime.spawn(cmd, args);

      expect(runtime.listSessions()).toContain(proc.id);

      runtime.killSession(proc.id);

      await proc.onExit;
    });
  });

  describe('filesystem integration', () => {
    it('should provide a working filesystem after boot', async () => {
      await runtime.boot('fs-integration');

      await runtime.fs.writeFile('test.txt', 'hello from runtime');

      const content = await runtime.fs.readFile('test.txt');

      expect(content).toBe('hello from runtime');
    });
  });

  describe('teardown', () => {
    it('should kill all running processes', async () => {
      await runtime.boot('teardown-test');

      const isWindows = os.platform() === 'win32';
      const cmd = isWindows ? 'cmd.exe' : 'sleep';
      const args = isWindows ? ['/c', 'timeout', '/t', '30', '/nobreak'] : ['30'];

      const proc1 = await runtime.spawn(cmd, args);
      const proc2 = await runtime.spawn(cmd, args);

      await runtime.teardown();

      /* Both processes should eventually exit */
      const code1 = await proc1.onExit;
      const code2 = await proc2.onExit;

      expect(typeof code1).toBe('number');
      expect(typeof code2).toBe('number');
    });

    it('should clear sessions after teardown', async () => {
      await runtime.boot('teardown-clear');

      const isWindows = os.platform() === 'win32';
      const cmd = isWindows ? 'cmd.exe' : 'sleep';
      const args = isWindows ? ['/c', 'timeout', '/t', '5', '/nobreak'] : ['5'];

      await runtime.spawn(cmd, args);

      expect(runtime.listSessions().length).toBeGreaterThan(0);

      await runtime.teardown();

      expect(runtime.listSessions()).toHaveLength(0);
    });

    it('should be safe to call teardown multiple times', async () => {
      await runtime.boot('multi-teardown');

      await runtime.teardown();
      await runtime.teardown();
      await runtime.teardown();

      /* No error means success */
    });
  });
});

describe('RuntimeManager', () => {
  /**
   * RuntimeManager uses a private static singleton.
   * We can't easily reset it between tests without reflection,
   * so we test the public API on the shared singleton.
   */

  it('should return a singleton instance', () => {
    const a = RuntimeManager.getInstance();
    const b = RuntimeManager.getInstance();

    expect(a).toBe(b);
  });

  it('should create and return a runtime for a project', async () => {
    const manager = RuntimeManager.getInstance();
    const runtime = await manager.getRuntime('manager-test-1');

    expect(runtime).toBeDefined();
    expect(runtime.projectId).toBe('manager-test-1');
    expect(runtime.type).toBe('local');

    /* Clean up */
    await manager.removeRuntime('manager-test-1');
  });

  it('should return the same runtime for the same project ID', async () => {
    const manager = RuntimeManager.getInstance();
    const r1 = await manager.getRuntime('manager-test-2');
    const r2 = await manager.getRuntime('manager-test-2');

    expect(r1).toBe(r2);

    await manager.removeRuntime('manager-test-2');
  });

  it('should list active projects', async () => {
    const manager = RuntimeManager.getInstance();
    await manager.getRuntime('list-test-a');

    const projects = manager.listProjects();

    expect(projects).toContain('list-test-a');

    await manager.removeRuntime('list-test-a');
  });

  it('should remove a runtime and clean up', async () => {
    const manager = RuntimeManager.getInstance();
    await manager.getRuntime('remove-test');

    await manager.removeRuntime('remove-test');

    const projects = manager.listProjects();

    expect(projects).not.toContain('remove-test');
  });

  it('should expose the projects directory', () => {
    const manager = RuntimeManager.getInstance();

    expect(manager.projectsDir).toBeTruthy();
    expect(typeof manager.projectsDir).toBe('string');
  });
});
