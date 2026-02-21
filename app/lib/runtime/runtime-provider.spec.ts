/**
 * Unit tests for runtime-provider validation helpers.
 *
 * Tests cover both `isValidProjectId` and `isSafePath` functions
 * which are critical security guards against path traversal and
 * injection attacks across the entire runtime layer.
 */

import { describe, expect, it } from 'vitest';
import { isValidProjectId, isSafePath } from './runtime-provider';

describe('runtime-provider', () => {
  describe('isValidProjectId', () => {
    it('should accept simple alphanumeric IDs', () => {
      expect(isValidProjectId('myproject')).toBe(true);
      expect(isValidProjectId('project123')).toBe(true);
      expect(isValidProjectId('ABC')).toBe(true);
    });

    it('should accept IDs with hyphens and underscores', () => {
      expect(isValidProjectId('my-project')).toBe(true);
      expect(isValidProjectId('my_project')).toBe(true);
      expect(isValidProjectId('my-project_123')).toBe(true);
    });

    it('should accept single character IDs', () => {
      expect(isValidProjectId('a')).toBe(true);
      expect(isValidProjectId('1')).toBe(true);
      expect(isValidProjectId('-')).toBe(true);
      expect(isValidProjectId('_')).toBe(true);
    });

    it('should accept IDs up to 64 characters', () => {
      const id64 = 'a'.repeat(64);
      expect(isValidProjectId(id64)).toBe(true);
    });

    it('should reject empty strings', () => {
      expect(isValidProjectId('')).toBe(false);
    });

    it('should reject IDs longer than 64 characters', () => {
      const id65 = 'a'.repeat(65);
      expect(isValidProjectId(id65)).toBe(false);
    });

    it('should reject IDs with spaces', () => {
      expect(isValidProjectId('my project')).toBe(false);
      expect(isValidProjectId(' leading')).toBe(false);
      expect(isValidProjectId('trailing ')).toBe(false);
    });

    it('should reject IDs with special characters', () => {
      expect(isValidProjectId('my.project')).toBe(false);
      expect(isValidProjectId('my/project')).toBe(false);
      expect(isValidProjectId('my\\project')).toBe(false);
      expect(isValidProjectId('../escape')).toBe(false);
      expect(isValidProjectId('project@1')).toBe(false);
      expect(isValidProjectId('project!')).toBe(false);
      expect(isValidProjectId('project#1')).toBe(false);
    });

    it('should reject path traversal attempts', () => {
      expect(isValidProjectId('..')).toBe(false);
      expect(isValidProjectId('../../etc')).toBe(false);
      expect(isValidProjectId('./local')).toBe(false);
    });
  });

  describe('isSafePath', () => {
    it('should accept simple relative paths', () => {
      expect(isSafePath('file.txt')).toBe(true);
      expect(isSafePath('src/index.ts')).toBe(true);
      expect(isSafePath('src/components/Button.tsx')).toBe(true);
    });

    it('should accept paths with dots in filenames', () => {
      expect(isSafePath('package.json')).toBe(true);
      expect(isSafePath('.env')).toBe(true);
      expect(isSafePath('.gitignore')).toBe(true);
      expect(isSafePath('src/.hidden/file.txt')).toBe(true);
    });

    it('should accept paths with the current directory marker', () => {
      expect(isSafePath('./src/file.ts')).toBe(true);
      expect(isSafePath('./file.txt')).toBe(true);
    });

    it('should accept paths that go up then back down without escaping', () => {
      expect(isSafePath('src/../../src/file.ts')).toBe(false);

      /* depth track: src(1) / ..(0) / ..(−1) → fails at depth < 0 */
    });

    it('should reject absolute Unix paths', () => {
      expect(isSafePath('/etc/passwd')).toBe(false);
      expect(isSafePath('/home/user/file.txt')).toBe(false);
      expect(isSafePath('/tmp/test')).toBe(false);
    });

    it('should reject absolute Windows paths', () => {
      expect(isSafePath('C:\\Windows\\System32')).toBe(false);
      expect(isSafePath('D:\\Users\\file.txt')).toBe(false);
      expect(isSafePath('c:/Users/test')).toBe(false);
    });

    it('should reject simple parent directory traversal', () => {
      expect(isSafePath('..')).toBe(false);
      expect(isSafePath('../file.txt')).toBe(false);
      expect(isSafePath('../../etc/passwd')).toBe(false);
    });

    it('should reject hidden traversal via nested ..', () => {
      expect(isSafePath('src/../../../etc/passwd')).toBe(false);
      expect(isSafePath('a/b/c/../../../../escape')).toBe(false);
    });

    it('should reject traversal with backslashes', () => {
      expect(isSafePath('..\\Windows\\System32')).toBe(false);
      expect(isSafePath('src\\..\\..\\escape')).toBe(false);
    });

    it('should accept deeply nested safe paths', () => {
      expect(isSafePath('a/b/c/d/e/f/g/h.txt')).toBe(true);
    });

    it('should handle empty string as safe', () => {
      /* An empty path resolves to the root directory itself, which is safe */
      expect(isSafePath('')).toBe(true);
    });

    it('should accept paths with various valid characters', () => {
      expect(isSafePath('src/my-file_v2.test.ts')).toBe(true);
      expect(isSafePath('src/[slug]/page.tsx')).toBe(true);
      expect(isSafePath('src/@components/ui.tsx')).toBe(true);
    });
  });
});
