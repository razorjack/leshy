import { mkdirSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

// PWA icons rendered from the watcher mark. Outputs are committed so builds
// need no image tooling; rerun `npm run icons` after changing the mark.

const mark = (bg: string, fg: string, pad: number): string => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${bg}"/>
  <g transform="translate(32 32) scale(${1 - pad}) translate(-32 -32)">
    <path d="M8 32 C20 14, 44 14, 56 32 C44 50, 20 50, 8 32 Z" fill="none" stroke="${fg}" stroke-width="4.5" stroke-linejoin="round"/>
    <circle cx="32" cy="32" r="7.5" fill="${fg}"/>
  </g>
</svg>`;

const render = (svg: string, size: number): Buffer =>
  new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();

const DARK_SURFACE = "#101b15";
const MOSS = "#7fc9a2";

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", render(mark(DARK_SURFACE, MOSS, 0.12), 192));
writeFileSync("public/icons/icon-512.png", render(mark(DARK_SURFACE, MOSS, 0.12), 512));
writeFileSync("public/icons/maskable-512.png", render(mark(DARK_SURFACE, MOSS, 0.34), 512));
console.log("wrote public/icons/{icon-192,icon-512,maskable-512}.png");
