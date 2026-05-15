import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('desktop entitlement gates', () => {
  it('does not default new users into Pro-only local mode', () => {
    const settings = fs.readFileSync('src/settings.js', 'utf8');
    expect(settings).toContain("engine: 'groq'");
  });

  it('gates local dictation and model downloads through plan status', () => {
    const main = fs.readFileSync('main.js', 'utf8');
    expect(main).toContain('const PAID_LOCAL_PLANS');
    expect(main).toContain('async function requireLocalEntitlement');
    expect(main).toContain("if (engineMode === 'local')");
    expect(main.match(/requireLocalEntitlement\(\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('exposes plan status to the renderer for paywall UI', () => {
    const preload = fs.readFileSync('preload.js', 'utf8');
    const renderer = fs.readFileSync('renderer/app.js', 'utf8');
    expect(preload).toContain('getPlanStatus');
    expect(renderer).toContain('planStatus.canUseLocal');
    expect(renderer).toContain('engineDenied');
  });
});
