// Cloudflare Access in front of this Worker signs each request it lets through (Cf-Access-Jwt-Assertion).
// The page checks that signature itself, so a missing or misconfigured Access application shows nothing.

let certs = { keys: null, fetchedAt: 0, domain: "" };

// The signed-in email, or null for anything else: no token, a malformed one, or one that fails any check.
export async function verifiedEmail(request, env) {
  try {
    return await verify(request, env);
  } catch {
    return null;
  }
}

async function verify(request, env) {
  const domain = env.ACCESS_TEAM_DOMAIN;
  const audience = env.ACCESS_AUD;
  if (!domain || !audience) return null;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header, claims;
  try {
    header = JSON.parse(text(parts[0]));
    claims = JSON.parse(text(parts[1]));
  } catch {
    return null;
  }
  if (!header || !claims || typeof header !== "object" || typeof claims !== "object") return null;
  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;

  const key = await signingKey(domain, header.kid);
  if (!key) return null;
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, bytes(parts[2]), signed);
  if (!valid) return null;

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(audience)) return null;
  if (claims.iss !== `https://${domain}`) return null;
  if (!Number.isFinite(claims.exp) || claims.exp <= now) return null;
  if (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + 60)) return null;
  return typeof claims.email === "string" ? claims.email : null;
}

// Access rotates its keys; a kid not seen yet fetches them again, at most once a minute.
async function signingKey(domain, kid) {
  const stale = Date.now() - certs.fetchedAt > 3600_000 || certs.domain !== domain;
  const unknown = certs.keys && !certs.keys.some((key) => key.kid === kid);
  if (!certs.keys || stale || (unknown && Date.now() - certs.fetchedAt > 60_000)) {
    try {
      const response = await fetch(`https://${domain}/cdn-cgi/access/certs`);
      if (response.ok) certs = { keys: (await response.json()).keys ?? [], fetchedAt: Date.now(), domain };
    } catch {
      // Keep whatever keys are cached; an unknown kid then fails below.
    }
  }
  const jwk = certs.keys?.find((key) => key.kid === kid);
  if (!jwk) return null;
  return crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
}

function bytes(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function text(base64url) {
  return new TextDecoder().decode(bytes(base64url));
}
