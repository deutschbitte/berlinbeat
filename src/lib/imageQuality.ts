// Migrated content links to a decade of hotlinked images sourced at
// whatever size the original author's theme requested at the time — mostly
// old WordPress "medium" thumbnails (?w=300) and Flickr's default ~500px
// rendition. Displayed at today's card/cover sizes, those get visibly
// upscaled and blurry. Both CDNs below clamp to the actual source
// resolution rather than upscaling or erroring when asked for a larger
// size than exists (verified directly against live URLs from this site's
// own content), so requesting a bigger size here can only help or be a
// no-op — never break an image that currently works.

const FLICKR_HOST = /(^|\.)staticflickr\.com$/i;
const FLICKR_FILENAME = /^(.*\/\d+_[0-9a-f]+)(?:_([a-z]))?(\.\w+)$/i;
// Sizes at or above ~800px on the long side — not worth "upgrading" further.
const FLICKR_LARGE_ENOUGH = new Set(['c', 'b', 'h', 'k', 'o']);

export function upgradeImageQuality(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (FLICKR_HOST.test(parsed.hostname)) {
    const match = parsed.pathname.match(FLICKR_FILENAME);
    if (!match) return url;
    const [, base, suffix, ext] = match;
    if (suffix && FLICKR_LARGE_ENOUGH.has(suffix.toLowerCase())) return url;
    parsed.pathname = `${base}_b${ext}`;
    return parsed.toString();
  }

  // WordPress.com/Jetpack Photon-style resize query param on self-hosted
  // wp-content/uploads URLs.
  if (parsed.pathname.includes('/wp-content/uploads/') && parsed.searchParams.has('w')) {
    const currentWidth = Number(parsed.searchParams.get('w'));
    if (!Number.isFinite(currentWidth) || currentWidth < 1200) {
      parsed.searchParams.set('w', '1200');
    }
    return parsed.toString();
  }

  return url;
}
