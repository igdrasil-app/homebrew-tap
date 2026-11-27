// The Iris update feed, passed through from GitHub byte for byte, and one count per update check.
// A running copy checks once a day, so a day's checks approximate the copies running that day;
// a manual "Check for Updates…" counts again, and copies still polling GitHub's URL are not seen.
// A check adds 1 to (day, version, country). Nothing else about the request is read or kept:
// no IP address, no user agent beyond Iris's version, no install id (Sparkle sends none).

const FEED_PATH = "/iris/appcast.xml";
const SPARKLE_AGENT = /^Iris\/([0-9][0-9A-Za-z.\-]{0,31}) Sparkle\//;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== FEED_PATH) return new Response("Not found\n", { status: 404 });
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed\n", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const fresh = await upstream(env);
    const body = fresh ?? (await lastGoodCopy(env));
    if (body === null) return new Response("Feed unavailable\n", { status: 502 });

    // After the response: counting and saving must never delay or break an update check.
    ctx.waitUntil(record(env, request, fresh).catch((error) => console.error(`record: ${error}`)));

    return new Response(request.method === "HEAD" ? null : body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        // Every check reaches this Worker, so every check is counted once.
        "Cache-Control": "no-store",
      },
    });
  },
};

// The feed's bytes from GitHub, or null when GitHub fails or answers with something that is not a feed.
async function upstream(env) {
  try {
    const response = await fetch(env.UPSTREAM_URL, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return looksLikeFeed(new TextDecoder().decode(bytes)) ? bytes : null;
  } catch {
    return null;
  }
}

// The shape release.sh writes: an XML declaration, one RSS channel, closed at the end.
function looksLikeFeed(text) {
  const trimmed = text.trim();
  return trimmed.startsWith("<?xml") && trimmed.endsWith("</rss>") && /<rss[\s>]/.test(trimmed) && trimmed.includes("<channel>");
}

async function lastGoodCopy(env) {
  try {
    const saved = await env.DB.prepare("SELECT body FROM feed WHERE name = 'iris'").first("body");
    return saved === null ? null : new Uint8Array(saved);
  } catch {
    return null;
  }
}

async function record(env, request, fresh) {
  const statements = [];
  const match = request.method === "GET" ? SPARKLE_AGENT.exec(request.headers.get("User-Agent") ?? "") : null;
  if (match) {
    const day = new Date().toISOString().slice(0, 10);
    // Cloudflare's two-letter code; "XX" when it has none.
    const country = /^[A-Z0-9]{2}$/.test(request.cf?.country ?? "") ? request.cf.country : "XX";
    statements.push(
      env.DB.prepare(
        "INSERT INTO checks (day, version, country, count) VALUES (?, ?, ?, 1) " +
          "ON CONFLICT (day, version, country) DO UPDATE SET count = count + 1",
      ).bind(day, match[1], country),
    );
  }
  if (fresh !== null) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO feed (name, body) VALUES ('iris', ?) " +
          "ON CONFLICT (name) DO UPDATE SET body = excluded.body WHERE body != excluded.body",
      ).bind(fresh.buffer),
    );
  }
  if (statements.length > 0) await env.DB.batch(statements);
}
