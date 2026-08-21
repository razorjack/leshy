import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

// Platform icons rendered from the reviewed application icon. Outputs are
// committed so builds need no image tooling; rerun `npm run icons` after
// changing the source artwork.

const appSource = readFileSync("assets/brand/leshy-app-icon-dark-1024.png").toString("base64");
const lightSource = readFileSync("assets/brand/leshy-mark-light-1024.png").toString("base64");
const darkSource = readFileSync("assets/brand/leshy-mark-dark-1024.png").toString("base64");

const mark = (source: string, scale: number, background?: string): string => {
  const size = 1024 * scale;
  const offset = (1024 - size) / 2;
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  ${background ? `<rect width="1024" height="1024" fill="${background}"/>` : ""}
  <image href="data:image/png;base64,${source}" x="${offset}" y="${offset}" width="${size}" height="${size}"/>
</svg>`;
};

const render = (svg: string, size: number): Buffer =>
  new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/mark-light-128.png", render(mark(lightSource, 0.96), 128));
writeFileSync("public/icons/mark-dark-128.png", render(mark(darkSource, 0.96), 128));
writeFileSync("public/icons/favicon-32.png", render(mark(appSource, 1), 32));
writeFileSync("public/icons/apple-touch-icon-180.png", render(mark(appSource, 1, "#19251f"), 180));
writeFileSync("public/icons/icon-192.png", render(mark(appSource, 1), 192));
writeFileSync("public/icons/icon-512.png", render(mark(appSource, 1), 512));
writeFileSync("public/icons/maskable-512.png", render(mark(darkSource, 0.72, "#19251f"), 512));
console.log(
  "wrote public/icons/{mark-light-128,mark-dark-128,favicon-32,apple-touch-icon-180,icon-192,icon-512,maskable-512}.png",
);
