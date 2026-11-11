export interface ApkUpdate {
  version: string;
  downloadUrl: string;
  releaseUrl: string;
}

export const DEFAULT_GITHUB_REPO = 'maxpnz/AZS-Simulator';

interface GithubRelease {
  tag_name?: string;
  html_url?: string;
  assets?: Array<{ name?: string; browser_download_url?: string }>;
}

export function compareVersions(left: string, right: string): number {
  const parse = (value: string) => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value);
    return match ? match.slice(1).map(Number) : null;
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return 0;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

export async function findApkUpdate(repo: string | undefined, currentVersion: string, request: typeof fetch = fetch): Promise<ApkUpdate | null> {
  repo = repo?.trim() || DEFAULT_GITHUB_REPO;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await request(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const release = await response.json() as GithubRelease;
    if (!release.tag_name || compareVersions(release.tag_name, currentVersion) <= 0) return null;
    const apk = release.assets?.find((asset) => asset.name?.endsWith('.apk') && asset.browser_download_url?.startsWith(`https://github.com/${repo}/releases/download/`));
    if (!apk?.browser_download_url || !release.html_url?.startsWith(`https://github.com/${repo}/releases/tag/`)) return null;
    return { version: release.tag_name.replace(/^v/, ''), downloadUrl: apk.browser_download_url, releaseUrl: release.html_url };
  } catch {
    // Offline play is always available; a failed check can be retried next launch.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
