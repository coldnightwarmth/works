const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const dataPath = path.join(rootDir, "assets/js/site-data.js");
const dataSource = fs.readFileSync(dataPath, "utf8");
const match = dataSource.match(/window\.PORTFOLIO_TREE = ([\s\S]*);\s*$/);
const assetVersion = "20260513-gallery29";

if (!match) {
  throw new Error("Could not read PORTFOLIO_TREE from assets/js/site-data.js");
}

const tree = JSON.parse(match[1]);
const works = [];

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const walk = (nodes) => {
  nodes.forEach((node) => {
    if (node.slug) {
      works.push(node);
    }

    if (node.children) {
      walk(node.children);
    }
  });
};

const pageHtml = (work) => {
  const title = escapeHtml(work.title);
  const slug = escapeHtml(work.slug);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="preconnect" href="https://gateway.irys.xyz">
    <link rel="preconnect" href="https://na-assets.pinit.io">
    <link rel="preconnect" href="https://prod-image-cdn.tensor.trade">
    <link rel="stylesheet" href="../../assets/css/site.css?v=${assetVersion}">
    <script src="../../assets/js/site-data.js?v=${assetVersion}" defer></script>
    <script src="../../assets/js/page-data.js?v=${assetVersion}" defer></script>
    <script src="../../assets/js/gallery-images.js?v=${assetVersion}" defer></script>
    <script src="../../assets/js/site.js?v=${assetVersion}" defer></script>
  </head>
  <body data-base-path="../../" data-page-title="${title}" data-page-slug="${slug}">
    <main class="site-shell">
      <aside class="index-shell" aria-label="portfolio index">
        <h1><a class="site-title" href="../../index.html" data-home-link>works by+with meinong</a></h1>
        <nav class="work-tree" aria-label="works" data-work-tree></nav>
      </aside>

      <section class="work-stage" aria-live="polite" aria-atomic="true" data-work-stage>
        <h2 class="work-title" data-work-title>${title}</h2>
      </section>
    </main>
  </body>
</html>
`;
};

walk(tree);

const currentSlugs = new Set(works.map((work) => work.slug));
const worksDir = path.join(rootDir, "works");

if (fs.existsSync(worksDir)) {
  fs.readdirSync(worksDir, { withFileTypes: true }).forEach((entry) => {
    if (!entry.isDirectory() || currentSlugs.has(entry.name)) {
      return;
    }

    fs.rmSync(path.join(worksDir, entry.name), { recursive: true, force: true });
  });
}

works.forEach((work) => {
  const workDir = path.join(rootDir, "works", work.slug);
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(path.join(workDir, "index.html"), pageHtml(work));
});

console.log(`Generated ${works.length} work pages.`);
