import fs from "node:fs";
import path from "node:path";

export const SITEMAP_BASE_URL = "https://www.sakescan.com";
export const MAX_URLS_PER_SITEMAP = 50_000;
export const MAX_SITEMAP_BYTES = 50 * 1024 * 1024;

export interface SitemapEntry {
  path: string;
  lastmod?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizePath(routePath: string): string {
  if (routePath === "/") {
    return "/";
  }
  return routePath.replace(/\/+$/, "");
}

function toLoc(routePath: string): string {
  const normalized = normalizePath(routePath);
  return normalized === "/" ? `${SITEMAP_BASE_URL}/` : `${SITEMAP_BASE_URL}${normalized}`;
}

export function renderUrlsetXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const lastmod = entry.lastmod ? `\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>` : "";
      return `  <url>\n    <loc>${escapeXml(toLoc(entry.path))}</loc>${lastmod}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderSitemapIndexXml(
  sitemapFiles: string[],
  lastmod: string
): string {
  const items = sitemapFiles
    .map(
      (file) =>
        `  <sitemap>\n    <loc>${escapeXml(`${SITEMAP_BASE_URL}/${file}`)}</loc>\n    <lastmod>${escapeXml(lastmod)}</lastmod>\n  </sitemap>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`;
}

function chunkEntries(entries: SitemapEntry[]): SitemapEntry[][] {
  const chunks: SitemapEntry[][] = [];
  let current: SitemapEntry[] = [];

  for (const entry of entries) {
    current.push(entry);

    const xml = renderUrlsetXml(current);
    const overUrlLimit = current.length > MAX_URLS_PER_SITEMAP;
    const overSizeLimit = Buffer.byteLength(xml, "utf-8") > MAX_SITEMAP_BYTES;

    if (overUrlLimit || overSizeLimit) {
      current.pop();
      if (current.length > 0) {
        chunks.push(current);
      }
      current = [entry];
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

export interface WriteSitemapsResult {
  urlCount: number;
  fileCount: number;
  sitemapFiles: string[];
  usedIndex: boolean;
}

export function writeSitemaps(distDir: string, entries: SitemapEntry[]): WriteSitemapsResult {
  const chunks = chunkEntries(entries);
  const buildDate = new Date().toISOString().slice(0, 10);
  const sitemapFiles: string[] = [];

  if (chunks.length === 1) {
    const fileName = "sitemap.xml";
    fs.writeFileSync(path.join(distDir, fileName), renderUrlsetXml(chunks[0]), "utf-8");
    sitemapFiles.push(fileName);
    return {
      urlCount: entries.length,
      fileCount: 1,
      sitemapFiles,
      usedIndex: false,
    };
  }

  const chunkFiles: string[] = [];
  chunks.forEach((chunk, index) => {
    const fileName = `sitemap-${index + 1}.xml`;
    fs.writeFileSync(path.join(distDir, fileName), renderUrlsetXml(chunk), "utf-8");
    chunkFiles.push(fileName);
  });

  fs.writeFileSync(
    path.join(distDir, "sitemap.xml"),
    renderSitemapIndexXml(chunkFiles, buildDate),
    "utf-8"
  );
  sitemapFiles.push("sitemap.xml", ...chunkFiles);

  return {
    urlCount: entries.length,
    fileCount: chunks.length + 1,
    sitemapFiles,
    usedIndex: true,
  };
}
