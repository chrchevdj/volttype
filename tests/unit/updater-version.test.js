import { describe, expect, test } from 'vitest';

function compareVersions(a, b) {
  const left = String(a || '').split(/[.-]/).map(part => Number.parseInt(part, 10) || 0);
  const right = String(b || '').split(/[.-]/).map(part => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    if ((left[i] || 0) > (right[i] || 0)) return 1;
    if ((left[i] || 0) < (right[i] || 0)) return -1;
  }
  return 0;
}

describe('updater version guard', () => {
  test('treats same version as not newer', () => {
    expect(compareVersions('1.2.2', '1.2.2')).toBe(0);
    expect(compareVersions('1.2.2.0', '1.2.2')).toBe(0);
  });

  test('allows only strictly newer releases through', () => {
    expect(compareVersions('1.2.3', '1.2.2')).toBe(1);
    expect(compareVersions('1.2.1', '1.2.2')).toBe(-1);
  });
});
