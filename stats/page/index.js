// A private page that shows the iris-stats counts. It only reads D1, and only for a request
// Cloudflare Access signed (see access.js). Days are UTC, as the counters store them.

import { verifiedEmail } from "./access.js";

const CHART_DAYS = 60;
const MIN_COUNTRY = 5;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const email = await verifiedEmail(request, env);
    if (!email) return new Response("Forbidden\n", { status: 403, headers: { "Cache-Control": "no-store" } });
    if (url.pathname !== "/") return new Response("Not found\n", { status: 404 });

    const nonce = crypto.randomUUID().replace(/-/g, "");
    const html = render(await load(env), email, nonce);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, private",
        "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex",
      },
    });
  },
};

export async function load(env) {
  const today = day(0);
  const since = day(-(CHART_DAYS - 1));
  const [checks, versions, countries, totals, latest, traffic] = await env.DB.batch([
    env.DB.prepare("SELECT day, sum(count) AS n FROM checks WHERE day >= ? GROUP BY day").bind(since),
    env.DB.prepare("SELECT version, sum(count) AS n FROM checks WHERE day >= ? GROUP BY version ORDER BY n DESC").bind(day(-6)),
    env.DB.prepare("SELECT country, sum(count) AS n FROM checks WHERE day >= ? GROUP BY country ORDER BY n DESC").bind(day(-29)),
    env.DB.prepare("SELECT day, sum(total) AS n FROM downloads GROUP BY day ORDER BY day"),
    env.DB.prepare("SELECT tag, sum(total) AS n FROM downloads WHERE day = (SELECT max(day) FROM downloads) GROUP BY tag"),
    env.DB.prepare("SELECT day, repo, kind, count, uniques FROM traffic WHERE day >= ? ORDER BY day DESC").bind(day(-13)),
  ]);

  const checksByDay = new Map(checks.results.map((row) => [row.day, row.n]));
  const checkSeries = days(since, today).map((d) => ({ day: d, value: checksByDay.get(d) ?? 0 }));

  // New downloads per day: the change in the cumulative total from the day before. A day after a missed
  // snapshot is left out, so a gap's downloads are never put on one day.
  const downloadSeries = [];
  for (let i = 1; i < totals.results.length; i++) {
    const row = totals.results[i];
    const previous = totals.results[i - 1];
    if (row.day >= since && previous.day === shift(row.day, -1)) {
      downloadSeries.push({ day: row.day, value: Math.max(0, row.n - previous.n) });
    }
  }

  return {
    today,
    checkSeries,
    yesterday: checksByDay.get(day(-1)) ?? 0,
    weekAverage: days(day(-7), day(-1)).reduce((sum, d) => sum + (checksByDay.get(d) ?? 0), 0) / 7,
    versions: versions.results,
    countries: groupSmall(countries.results),
    downloadSeries,
    downloadsTotal: totals.results.at(-1)?.n ?? 0,
    downloadsWeek: downloadSeries.filter((row) => row.day >= day(-6)).reduce((sum, row) => sum + row.value, 0),
    releases: latest.results.sort((a, b) => compareVersions(b.tag, a.tag)),
    traffic: trafficRows(traffic.results),
  };
}

// Countries with fewer than MIN_COUNTRY checks are folded into Other, so no row describes one person.
function groupSmall(rows) {
  const shown = rows.filter((row) => row.country !== "XX" && row.n >= MIN_COUNTRY);
  const other = rows.filter((row) => !shown.includes(row)).reduce((sum, row) => sum + row.n, 0);
  return other > 0 ? [...shown, { country: "Other", n: other }] : shown;
}

function trafficRows(rows) {
  const byDay = new Map();
  for (const row of rows) {
    const key = `${row.repo.split("/")[1]} ${row.kind}`;
    if (!byDay.has(row.day)) byDay.set(row.day, {});
    byDay.get(row.day)[key] = row;
  }
  return [...byDay.entries()].map(([d, cells]) => ({ day: d, cells }));
}

export function render(data, email, nonce) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Iris usage</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<main>
<header>
  <h1>Iris usage</h1>
  <p class="muted">Counts only: no addresses, no identifiers. Days in UTC; today (${esc(data.today)}) is still counting.</p>
</header>

<section class="tiles">
  ${tile("Update checks yesterday", format(data.yesterday))}
  ${tile("Daily average, last 7 days", format(data.weekAverage, 1))}
  ${tile("New downloads, last 7 days", format(data.downloadsWeek))}
  ${tile("Downloads, all releases", format(data.downloadsTotal))}
</section>

<section>
  <h2>Update checks per day</h2>
  <p class="muted">Each running Iris 0.1.11 or later checks once a day, so a day's checks approximate the copies in use. A manual Check for Updates… counts again; older versions are not seen.</p>
  ${barChart("checks", data.checkSeries, "update checks")}
</section>

<section class="pair">
  <div>
    <h2>Versions, last 7 days</h2>
    ${table(["Version", "Checks"], data.versions.map((row) => [row.version, format(row.n)]), "No update checks yet.")}
  </div>
  <div>
    <h2>Countries, last 30 days</h2>
    ${table(["Country", "Checks"], data.countries.map((row) => [countryName(row.country), format(row.n)]), "No update checks yet.")}
    <p class="muted small">Countries with fewer than ${MIN_COUNTRY} checks are grouped as Other.</p>
  </div>
</section>

<section>
  <h2>New downloads per day</h2>
  <p class="muted">From GitHub's release counts, read once a day. Includes updates and repeat downloads; a day after a missed reading is left out.</p>
  ${barChart("downloads", data.downloadSeries, "new downloads")}
</section>

<section class="pair">
  <div>
    <h2>Downloads by release</h2>
    ${table(["Release", "Downloads"], data.releases.map((row) => [row.tag, format(row.n)]), "No downloads read yet.")}
  </div>
  <div>
    <h2>GitHub traffic, last 14 days</h2>
    ${table(
      ["Day", "iris clones", "iris views", "tap clones"],
      data.traffic.map((row) => [shortDay(row.day), pair(row.cells["iris clones"]), pair(row.cells["iris views"]), pair(row.cells["homebrew-tap clones"])]),
      "No traffic read yet.",
    )}
    <p class="muted small">Total (unique). iris clones are mostly agent sessions, not people.</p>
  </div>
</section>

<footer class="muted small">Signed in as ${esc(email)}. Source: igdrasil-app/homebrew-tap, stats/.</footer>
</main>
<div id="tip" role="tooltip" hidden></div>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
}

function tile(label, value) {
  return `<div class="tile"><div class="value">${esc(value)}</div><div class="muted small">${esc(label)}</div></div>`;
}

function barChart(id, series, unit) {
  if (series.length === 0 || series.every((point) => point.value === 0)) {
    return `<p class="empty">Nothing counted yet.</p>`;
  }
  const width = 720;
  const height = 180;
  const top = 12;
  const bottom = 24;
  const left = 32;
  const max = niceMax(Math.max(...series.map((point) => point.value)));
  const step = (width - left) / series.length;
  const barWidth = Math.max(2, Math.min(14, step - 2));
  const y = (value) => top + (height - top - bottom) * (1 - value / max);

  const grid = [0, max / 2, max]
    .map((tick) => `<line class="grid" x1="${left}" x2="${width}" y1="${y(tick)}" y2="${y(tick)}"/><text class="axis" x="${left - 6}" y="${y(tick) + 4}" text-anchor="end">${format(tick)}</text>`)
    .join("");
  const bars = series
    .map((point, i) => {
      const x = left + i * step + (step - barWidth) / 2;
      const label = `${shortDay(point.day)}: ${format(point.value)} ${unit}`;
      const bar = point.value > 0 ? `<path class="bar" d="${roundedTop(x, y(point.value), barWidth, y(0) - y(point.value))}"/>` : "";
      return `<g class="hit" data-tip="${esc(label)}"><rect x="${left + i * step}" y="${top}" width="${step}" height="${height - top - bottom}" fill="transparent"/>${bar}</g>`;
    })
    .join("");
  // The first and last dates anchor inward so neither is cut off at the edge.
  const ticks = [
    [0, "start", left],
    [Math.floor(series.length / 2), "middle", null],
    [series.length - 1, "end", width],
  ]
    .map(([i, anchor, x]) => `<text class="axis" x="${x ?? left + i * step + step / 2}" y="${height - 6}" text-anchor="${anchor}">${esc(shortDay(series[i].day))}</text>`)
    .join("");

  return `<figure>
<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bar chart of ${esc(unit)} per day">${grid}${bars}${ticks}</svg>
<details><summary>Show as table</summary>${table(["Day", unit[0].toUpperCase() + unit.slice(1)], series.slice().reverse().map((point) => [point.day, format(point.value)]), "")}</details>
</figure>`;
}

// A bar with 4px rounded top corners, flat on the baseline.
function roundedTop(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function table(headings, rows, empty) {
  if (rows.length === 0) return empty ? `<p class="empty">${esc(empty)}</p>` : "";
  const head = headings.map((h, i) => `<th${i > 0 ? ' class="num"' : ""}>${esc(h)}</th>`).join("");
  const body = rows.map((row) => `<tr>${row.map((cell, i) => `<td${i > 0 ? ' class="num"' : ""}>${esc(cell)}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function pair(cell) {
  return cell ? `${format(cell.count)} (${format(cell.uniques)})` : "–";
}

// A round top for the scale whose half is a whole number, since every count is.
function niceMax(value) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const factor of [1, 2, 4, 6, 8, 10]) if (factor * magnitude >= value) return factor * magnitude;
  return value;
}

function compareVersions(a, b) {
  const numbers = (tag) => tag.replace(/^v/, "").split(".").map((part) => parseInt(part, 10) || 0);
  const [x, y] = [numbers(a), numbers(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

function countryName(code) {
  if (code === "Other") return "Other";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function day(offset) {
  return new Date(Date.now() + offset * 86400_000).toISOString().slice(0, 10);
}

function shift(iso, offset) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + offset * 86400_000).toISOString().slice(0, 10);
}

function days(from, to) {
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d = new Date(d.getTime() + 86400_000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function shortDay(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function format(value, digits = 0) {
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const STYLE = `
:root {
  color-scheme: light;
  --surface: #ffffff; --raised: #f6f6f6; --text: #191919; --muted: #666666;
  --line: #e4e4e4; --series: #257de0;
}
@media (prefers-color-scheme: dark) {
  :root { color-scheme: dark; --surface: #191919; --raised: #222222; --text: #efefef; --muted: #9c9c9c; --line: #333333; --series: #338ced; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--surface); color: var(--text); font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
main { max-width: 880px; margin: 0 auto; padding: 32px 16px 48px; }
h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.01em; }
h2 { font-size: 16px; margin: 0 0 4px; }
section { margin-top: 36px; }
.muted { color: var(--muted); margin: 0 0 12px; }
.small { font-size: 13px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-top: 24px; }
.tile { background: var(--raised); border-radius: 10px; padding: 14px 16px; }
.tile .value { font-size: 28px; font-weight: 600; font-variant-numeric: tabular-nums; }
.tile .muted { margin: 2px 0 0; }
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 28px; }
figure { margin: 0; }
svg { width: 100%; height: auto; display: block; }
.grid { stroke: var(--line); stroke-width: 1; }
.axis { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
/* The chart scales down with the screen; larger units keep its labels readable on a phone. */
@media (max-width: 600px) { .axis { font-size: 20px; } }
.bar { fill: var(--series); }
.hit:hover .bar { opacity: 0.75; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid var(--line); }
th { font-weight: 500; color: var(--muted); font-size: 13px; }
.num { text-align: right; }
details { margin-top: 8px; }
summary { cursor: pointer; color: var(--muted); font-size: 13px; }
.empty { color: var(--muted); background: var(--raised); border-radius: 10px; padding: 18px 16px; margin: 0; }
footer { margin-top: 48px; }
#tip { position: fixed; pointer-events: none; background: var(--text); color: var(--surface); font-size: 12px; padding: 4px 8px; border-radius: 6px; white-space: nowrap; }
`;

const SCRIPT = `
const tip = document.getElementById("tip");
document.querySelectorAll(".hit").forEach((hit) => {
  hit.addEventListener("pointermove", (event) => {
    tip.textContent = hit.dataset.tip;
    tip.hidden = false;
    tip.style.left = Math.min(event.clientX + 12, window.innerWidth - tip.offsetWidth - 8) + "px";
    tip.style.top = event.clientY - 34 + "px";
  });
  hit.addEventListener("pointerleave", () => { tip.hidden = true; });
});
`;
