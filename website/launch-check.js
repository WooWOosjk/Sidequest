'use strict';
// Shared checks for launch files that are missing-game notices or point at a dead loader.
(function (root) {
  function failureReason(html) {
    const raw = String(html || '').slice(0, 8000);
    const visible = raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (/couldn['’]t find the requested file/i.test(visible)) {
      return 'This launch file is a missing-file notice, not a playable game.';
    }
    const compact = raw.trim();
    if (compact && compact.length < 500 && !/<(?:!doctype|html|body|script|canvas|iframe)\b/i.test(compact)) {
      return 'This launch file is not a playable HTML game.';
    }
    return '';
  }

  function loaderUrl(html, pageUrl) {
    const raw = String(html || '').slice(0, 65536);
    const baseMatch = raw.match(/<base\s+href=["']([^"']+)["']/i);
    let base = pageUrl;
    try {
      if (baseMatch) base = new URL(baseMatch[1], pageUrl).href;
    } catch { /* keep the page URL */ }
    const srcs = [...raw.matchAll(/<script\b[^>]*?\bsrc=["']([^"']+)["']/gi)].map((match) => match[1]);
    for (const src of srcs) {
      if (/googletagmanager|google-analytics|doubleclick|facebook\.com/i.test(src)) continue;
      try {
        const url = new URL(src, base);
        if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
      } catch { /* skip malformed sources */ }
    }
    return '';
  }

  root.LaunchCheck = { failureReason, loaderUrl };
})(typeof window !== 'undefined' ? window : globalThis);
