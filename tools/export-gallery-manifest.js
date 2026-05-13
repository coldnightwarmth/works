const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = { window: {} };
const source = fs.readFileSync(path.join(root, "assets/js/page-data.js"), "utf8");

vm.runInNewContext(source, context, { filename: "page-data.js" });

const pages = context.window.PORTFOLIO_PAGES || {};
const galleries = Object.entries(pages)
  .filter(([, page]) => page && page.type === "gallery" && page.gallery)
  .map(([slug, page]) => ({
    slug,
    title: page.title,
    items: (page.gallery.items || []).map((item, index) => ({
      index,
      title: item.title,
      order: item.order,
      src: item.src,
      thumbSrc: item.thumbSrc,
      externalUrl: item.externalUrl
    }))
  }));

process.stdout.write(`${JSON.stringify({ galleries }, null, 2)}\n`);
