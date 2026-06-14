/**
 * Article extraction — fetch URL, run Readability, save HTML.
 *
 * Used by:
 *  - web-watcher (smart monitor, on detected page change → extract each new link)
 *  - server.js (/api/article-content endpoint, lazy extract when user clicks an article)
 *  - rss-fetcher (eager extract on first sighting — optional, off by default to save LLM)
 */
import * as cheerio from "cheerio";
import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "../logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, "..", "data", "pages");

/** Sanitize a string for use as a directory/file name. */
export function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9一-鿿_-]/g, "_").slice(0, 80);
}

/** Hash content for cheap change detection. */
export function hashContent(text) {
  return crypto.createHash("sha256").update(text.trim()).digest("hex");
}

/**
 * Fetch a URL, run Readability, save content + images to disk.
 *
 * @param url            the article URL
 * @param siteDir        absolute directory under DATA_DIR to write into
 * @returns              {title, text, content, imageCount, contentPath} or null
 */
export async function fetchArticle(url, siteDir) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "StudioArona-ArticleBot/1.0" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (!article) return null;

    // Extract content images (>100px, not pixel/track/ads/1x1)
    const imgUrls = [];
    const contentDom = new JSDOM(article.content || "");
    const imgs = contentDom.window.document.querySelectorAll("img");
    for (const img of imgs) {
      const src = img.getAttribute("src");
      const w = parseInt(img.getAttribute("width") || "0");
      const h = parseInt(img.getAttribute("height") || "0");
      if (src && (w > 100 || h > 100 || (!w && !h))) {
        if (!/pixel|track|beacon|ads|analytics|1x1/i.test(src)) {
          try { imgUrls.push(new URL(src, url).href); } catch { /* skip */ }
        }
      }
    }

    // Download & save images
    const savedImgs = [];
    for (const imgUrl of imgUrls.slice(0, 5)) {
      try {
        const imgRes = await fetch(imgUrl, {
          signal: AbortSignal.timeout(10000),
          headers: { "User-Agent": "StudioArona-ArticleBot/1.0" },
        });
        if (!imgRes.ok) continue;
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const ext = imgUrl.split(".").pop()?.split("?")[0] || "jpg";
        const imgName = `${crypto.randomUUID().slice(0, 8)}.${ext}`;
        await writeFile(path.join(siteDir, imgName), buf);
        savedImgs.push(imgName);
      } catch { /* skip */ }
    }

    return {
      title: article.title || "",
      text: article.textContent || "",
      content: article.content || "",
      imageCount: savedImgs.length,
    };
  } catch (e) {
    log.warn(`[article] fetch failed for ${url}: ${e.message}`);
    return null;
  }
}

/**
 * Save a fully-rendered reading page to disk, return relative path.
 */
export async function saveReadingPage(siteDir, article, sourceUrl) {
  const guid = crypto.createHash("md5").update(sourceUrl).digest("hex");
  const htmlPath = `${path.relative(DATA_DIR, siteDir)}/${guid}.html`;
  const readingPage = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${article.title}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:0 auto;padding:24px 16px;line-height:1.8;color:#1a1a1a;background:#fff}
  img{max-width:100%;height:auto;border-radius:8px;margin:16px 0}
  h1{font-size:1.6em;margin-bottom:8px}a{color:#2563eb;text-decoration:none}
  .meta{color:#888;font-size:.85em;margin-bottom:24px}.source{margin-top:32px;padding-top:16px;border-top:1px solid #eee}
  /* Article content inner — inherit colors so the host theme wins */
  p,h1,h2,h3,h4,h5,h6,li,blockquote,div,span,article,section{color:inherit;background:inherit}
  a{color:#2563eb}
  blockquote{border-left:3px solid #ddd;padding-left:1em;color:#555;margin:1em 0}

  /* Dark mode: invert background + text */
  @media (prefers-color-scheme: dark) {
    body{background:#1a1a1a;color:#e6e6e6}
    a{color:#7eb6ff}
    .meta{color:#aaa}
    .source{border-top-color:#333}
    blockquote{border-left-color:#444;color:#bbb}
    img{opacity:.92}
  }
</style></head><body>
<h1>${article.title}</h1>
<div class="meta">来源: ${new URL(sourceUrl).hostname} · ${new Date().toLocaleDateString("zh-CN")}</div>
${article.content}
<div class="source"><a href="${sourceUrl}" target="_blank">查看原文 →</a></div>
</body></html>`;
  const fullPath = path.join(DATA_DIR, htmlPath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, readingPage, "utf-8");
  return { guid, htmlPath };
}
