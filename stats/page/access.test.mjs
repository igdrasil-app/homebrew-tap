// The page shows counts only to a request Access signed for this application. Run: node --test page/access.test.mjs (from stats/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifiedEmail } from "./access.js";

const DOMAIN = "example.cloudflareaccess.com";
const AUD = "aud-for-stats";
const pair = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
);
const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1", alg: "RS256" };
const other = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
);

globalThis.fetch = async (url) => {
  assert.equal(String(url), `https://${DOMAIN}/cdn-cgi/access/certs`);
  return new Response(JSON.stringify({ keys: [jwk] }));
};

const encode = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
async function token(claims, { key = pair.privateKey, kid = "k1", alg = "RS256" } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${encode({ alg, kid })}.${encode({ aud: [AUD], iss: `https://${DOMAIN}`, exp: now + 600, email: "owner@example.com", ...claims })}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(body));
  return `${body}.${Buffer.from(signature).toString("base64url")}`;
}
const request = (jwt) => new Request("https://stats.example/", jwt ? { headers: { "Cf-Access-Jwt-Assertion": jwt } } : {});
const env = { ACCESS_TEAM_DOMAIN: DOMAIN, ACCESS_AUD: AUD };

test("a token Access signed for this application is let in", async () => {
  assert.equal(await verifiedEmail(request(await token({})), env), "owner@example.com");
});

test("everything else is refused", async () => {
  const now = Math.floor(Date.now() / 1000);
  const refused = {
    "no token": request(null),
    "not a token": request("garbage"),
    "another application": request(await token({ aud: ["someone-else"] })),
    "another team": request(await token({ iss: "https://other.cloudflareaccess.com" })),
    expired: request(await token({ exp: now - 1 })),
    "not yet valid": request(await token({ nbf: now + 3600 })),
    "signed by another key": request(await token({}, { key: other.privateKey })),
    "unknown key id": request(await token({}, { kid: "k2" })),
    "another algorithm": request(await token({}, { alg: "HS256" })),
  };
  for (const [name, req] of Object.entries(refused)) assert.equal(await verifiedEmail(req, env), null, name);
});

test("nothing is let in while Access is not configured", async () => {
  const jwt = await token({});
  assert.equal(await verifiedEmail(request(jwt), { ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: AUD }), null);
  assert.equal(await verifiedEmail(request(jwt), { ACCESS_TEAM_DOMAIN: DOMAIN, ACCESS_AUD: "" }), null);
});
