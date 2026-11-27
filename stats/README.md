# Iris usage counts

How much Iris is used, counted without tracking anyone.

## What is kept

All of it lives in one Cloudflare D1 database, `iris-stats` (see `schema.sql`):

- **`checks`**: update checks per day, Iris version and country. Iris's menu bar app asks `updates.igdrasil.app/iris/appcast.xml` for updates once a day, sending only `User-Agent: Iris/<version> Sparkle/<version>`. The `feed` Worker returns GitHub's feed unchanged and adds 1 to that day's (version, country) count. A day's checks approximate the copies running that day. A manual *Check for Updates…* counts again. Copies whose Iris still polls GitHub's URL (versions before the switch) are not seen. Weekly or monthly unique users cannot be told apart, by design.
- **`downloads`**: each release asset's total download count, as GitHub reports it, once a day. Downloads include updates and repeat downloads, so they are not a count of people.
- **`traffic`**: GitHub's per-day clone and view counts for `iris` and `homebrew-tap`. GitHub keeps them for only 14 days.
- **`feed`**: the last feed GitHub served, for when GitHub cannot.

What is never kept: IP addresses, install ids, full user agents, or anything else that tells one person from another. The country is Cloudflare's two-letter code, stored only as part of a count. Request logs are off. Anything published combines countries with fewer than 5 copies.

## Deploy (owner only)

From `stats/`, once:

```sh
npm install
npx wrangler login
npx wrangler d1 create iris-stats    # put the printed id in snapshot/ and feed/wrangler.toml
npx wrangler d1 execute iris-stats --remote --file schema.sql
```

The snapshot Worker needs a fine-grained GitHub token. Give it access to `igdrasil-app/iris` and `igdrasil-app/homebrew-tap`, with only *Administration: Read-only*, which GitHub requires for traffic:

```sh
cd snapshot
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```

It runs every day at 23:00 UTC.

The feed Worker takes the hostname `updates.igdrasil.app` (Cloudflare creates its DNS record):

```sh
cd ../feed
npx wrangler deploy
cmp <(curl -s https://updates.igdrasil.app/iris/appcast.xml) \
    <(curl -s https://raw.githubusercontent.com/igdrasil-app/homebrew-tap/main/Appcasts/iris.xml)
# The fallback copy must exist before any Iris points here:
npx wrangler d1 execute iris-stats --remote --command "SELECT length(body) FROM feed"
```

After a schema change, run the `execute --file schema.sql` line again from `stats/`; it only adds what is missing.

## Read

```sh
npx wrangler d1 execute iris-stats --remote --command \
  "SELECT day, version, sum(count) AS checks FROM checks GROUP BY day, version ORDER BY day"
npx wrangler d1 execute iris-stats --remote --command \
  "SELECT day, sum(total) AS downloads FROM downloads GROUP BY day ORDER BY day"
```
