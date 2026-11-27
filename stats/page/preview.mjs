// Renders the page from the local D1 copy to a file, without Access: node page/preview.mjs out.html (from stats/).
// Fill the local copy first: wrangler d1 export iris-stats --remote --output dump.sql, then execute it --local.
import { writeFileSync } from "node:fs";
import { getPlatformProxy } from "wrangler";
import { load, render } from "./index.js";

const proxy = await getPlatformProxy({ configPath: new URL("./wrangler.toml", import.meta.url).pathname, persist: { path: new URL("./.wrangler/state/v3", import.meta.url).pathname } });
writeFileSync(process.argv[2] ?? "preview.html", render(await load(proxy.env), "local preview", "preview"));
await proxy.dispose();
