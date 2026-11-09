import { describe, expect, it, vi } from 'vitest';
import { compareVersions, findApkUpdate } from './githubUpdates';

describe('GitHub APK updates', () => {
  it('compares version numbers numerically', () => {
    expect(compareVersions('v0.1.10', '0.1.9')).toBe(1);
    expect(compareVersions('0.2.0', 'v0.1.99')).toBe(1);
    expect(compareVersions('0.1.0', 'v0.1.0')).toBe(0);
  });

  it('accepts a newer APK from the configured repository', async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v0.2.0',
        html_url: 'https://github.com/owner/azs/releases/tag/v0.2.0',
        assets: [{ name: 'AZS-Simulator-v0.2.0.apk', browser_download_url: 'https://github.com/owner/azs/releases/download/v0.2.0/AZS-Simulator-v0.2.0.apk' }],
      }),
    });
    expect(await findApkUpdate('owner/azs', '0.1.0', request)).toMatchObject({ version: '0.2.0' });
  });

  it('ignores a release without an APK', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tag_name: 'v0.2.0', assets: [] }) });
    expect(await findApkUpdate('owner/azs', '0.1.0', request)).toBeNull();
  });
});
