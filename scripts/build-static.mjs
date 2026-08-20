import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const publicFiles = [
  "index.html",
  "styles.css",
  "script.js",
  "support-chat.js",
  "site-config.json",
  "manifest.webmanifest",
  "robots.txt",
  "sitemap.xml",
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(
  publicFiles.map((file) => cp(path.join(root, file), path.join(output, file)))
);
await cp(path.join(root, "assets"), path.join(output, "assets"), { recursive: true });

console.log(`Prepared ${publicFiles.length} files and assets in dist/`);
