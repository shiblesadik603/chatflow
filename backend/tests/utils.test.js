import { msFromDuration } from '../src/utils/duration.js';
import { sanitizeFileName } from '../src/utils/sanitizeFileName.js';
import { escapeRegex } from '../src/utils/escapeRegex.js';

describe('msFromDuration', () => {
  it('converts supported units correctly', () => {
    expect(msFromDuration('15m')).toBe(15 * 60_000);
    expect(msFromDuration('7d')).toBe(7 * 86_400_000);
    expect(msFromDuration('30s')).toBe(30_000);
    expect(msFromDuration('2h')).toBe(2 * 3_600_000);
  });

  it('throws a clear error on an unsupported format', () => {
    expect(() => msFromDuration('15 minutes')).toThrow(/Unsupported duration format/);
    expect(() => msFromDuration('')).toThrow(/Unsupported duration format/);
  });
});

describe('sanitizeFileName', () => {
  it('strips path-traversal and unsafe characters', () => {
    expect(sanitizeFileName('../../etc/passwd')).not.toContain('..');
    expect(sanitizeFileName('a/b\\c?d%e*f:g|h"i<j>k')).toBe('abcdefghijk');
  });

  it('falls back to "file" for an empty or whitespace-only name', () => {
    expect(sanitizeFileName('')).toBe('file');
    expect(sanitizeFileName('   ')).toBe('file');
    expect(sanitizeFileName(undefined)).toBe('file');
  });

  it('truncates very long names', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeFileName(long).length).toBe(150);
  });
});

describe('escapeRegex', () => {
  it('makes special regex characters literal', () => {
    const dangerous = '.*+?^${}()|[]\\';
    const escaped = escapeRegex(dangerous);
    // Matching the escaped pattern against the original string should
    // succeed only as a literal match, not as an active regex.
    expect(new RegExp(`^${escaped}$`).test(dangerous)).toBe(true);
  });
});
