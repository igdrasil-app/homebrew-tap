# Iris usage counts

How many copies of Iris are in use, counted without tracking anyone.

## What is kept

All of it lives in one Cloudflare D1 database, `iris-stats` (see `schema.sql`):

- **`checks`**: update checks per day, Iris version and country. Iris's menu bar app asks `updates.igdrasil.app/iris/appcast.xml` for updates once a day, sending only `User-Agent: Iris/<version> Sparkle/<version>`. The `feed` Worker returns GitHub's feed unchanged and adds 1 to that day's (version, country) count. So a day's total is that day's running copies. Weekly or monthly unique users cannot be told apart, by design.
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
cd feed
npx wrangler deploy
cmp <(curl -s https://updates.igdrasil.app/iris/appcast.xml) \
    <(curl -s https://raw.githubusercontent.com/igdrasil-app/homebrew-tap/main/Appcasts/iris.xml)
```

After a schema change, run the `execute --file schema.sql` line again; it only adds what is missing.

## Read

```sh
npx wrangler d1 execute iris-stats --remote --command \
  "SELECT day, version, sum(count) AS copies FROM checks GROUP BY day, version ORDER BY day"
npx wrangler d1 execute iris-stats --remote --command \
  "SELECT day, sum(total) AS downloads FROM downloads GROUP BY day ORDER BY day"
```
