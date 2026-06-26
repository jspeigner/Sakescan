import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const CONCURRENCY = Number(process.env.PRERENDER_CONCURRENCY ?? "8");

function routeToFilePath(distDir: string, route: string): string {
  if (route === "/") {
    return path.join(distDir, "index.html");
  }
  return path.join(distDir, route.slice(1), "index.html");
}

function stripPrerenderArtifacts(html: string): string {
  let output = html;
  output = output.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "");
  output = output.replace(/<meta[^>]*data-rh[^>]*\/?>/gi, "");
  output = output.replace(/<link[^>]*data-rh[^>]*\/?>/gi, "");
  output = output.replace(/<script[^>]*data-rh[^>]*>[\s\S]*?<\/script>/gi, "");
  output = output.replace(/<script>window\.__REACT_QUERY_STATE__=[\s\S]*?<\/script>/g, "");
  output = output.replace(/<meta name="description"[^>]*\/?>/gi, "");
  output = output.replace(/<link rel="canonical"[^>]*\/?>/gi, "");
  output = output.replace(/<meta property="og:[^"]+"[^>]*\/?>/gi, "");
  output = output.replace(/<meta name="twitter:[^"]+"[^>]*\/?>/gi, "");
  output = output.replace(/<div id="root">[\s\S]*?<\/div>/, '<div id="root"></div>');
  return output;
}

function injectPrerenderedHtml(
  template: string,
  { html, head, queryState }: { html: string; head: string; queryState: unknown }
): string {
  const queryScript = `<script>window.__REACT_QUERY_STATE__=${JSON.stringify(queryState).replace(/</g, "\\u003c")}</script>`;
  const output = stripPrerenderArtifacts(template);

  const headBlock = head ? `${head}\n${queryScript}` : queryScript;
  const withHead = output.replace("</head>", `${headBlock}\n</head>`);
  return withHead.replace(/<div id="root"><\/div>/, `<div id="root">${html}</div>`);
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let index = 0;

  async function next(): Promise<void> {
    const current = index;
    index += 1;
    if (current >= items.length) return;
    await worker(items[current], current);
    await next();
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
}

async function prerender() {
  const env = loadEnv("production", root, "");
  Object.assign(process.env, env);

  const distDir = path.resolve(root, "dist");
  const templatePath = path.join(distDir, "index.html");

  if (!fs.existsSync(templatePath)) {
    throw new Error("dist/index.html not found. Run vite build first.");
  }

  const template = stripPrerenderArtifacts(fs.readFileSync(templatePath, "utf-8"));

  const vite = await createViteServer({
    root,
    logLevel: "error",
    server: { middlewareMode: true },
    appType: "custom",
  });

  try {
    const { render } = await vite.ssrLoadModule("/src/entry-server.tsx");
    const { getPrerenderRoutes, toSitemapEntries } = await vite.ssrLoadModule("/src/lib/prerender-routes.ts");
    const routes: string[] = await getPrerenderRoutes(distDir);

    console.log(`[prerender] Rendering ${routes.length} routes (${CONCURRENCY} workers)...`);

    let success = 0;
    let failed = 0;

    await runPool(routes, CONCURRENCY, async (route) => {
      try {
        const result = await render(route);
        const filePath = routeToFilePath(distDir, route);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, injectPrerenderedHtml(template, result), "utf-8");
        success += 1;
        if (success % 250 === 0) {
          console.log(`[prerender] ${success}/${routes.length} complete...`);
        }
      } catch (err) {
        failed += 1;
        console.warn(`[prerender] Failed ${route}:`, err instanceof Error ? err.message : err);
      }
    });

    console.log(`[prerender] Done: ${success} succeeded, ${failed} failed`);

    const { writeSitemaps } = await vite.ssrLoadModule("/src/lib/sitemap.ts");
    const sitemapResult = writeSitemaps(distDir, toSitemapEntries(routes));

    if (sitemapResult.usedIndex) {
      console.log(
        `[sitemap] Wrote ${sitemapResult.urlCount} URLs across ${sitemapResult.sitemapFiles.length} files (sitemap.xml index)`
      );
    } else {
      console.log(`[sitemap] Wrote ${sitemapResult.urlCount} URLs to sitemap.xml`);
    }
  } finally {
    await vite.close();
  }
}

prerender().catch((err) => {
  console.error("[prerender] Fatal error:", err);
  process.exit(1);
});
