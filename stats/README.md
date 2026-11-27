# Iris usage counts

How many people use Iris, counted without tracking anyone.

## What is kept

All of it lives in one Cloudflare D1 database, `iris-stats` (see `schema.sql`):

- **`downloads`**: each release asset's total download count, as GitHub reports it, once a day.
- **`traffic`**: GitHub's per-day clone and view counts for `iris` and `homebrew-tap`. GitHub keeps them for only 14 days.

What is never kept: IP addresses, install ids, user agents, or anything else that tells one person from another. GitHub gives this Worker nothing of the kind.

## Deploy (owner only)

From `stats/`, once:

```sh
npm install
npx wrangler login
npx wrangler d1 create iris-stats    # put the printed id in snapshot/wrangler.toml
npx wrangler d1 execute iris-stats --remote --file schema.sql
```

The snapshot Worker needs a fine-grained GitHub token. Give it access to `igdrasil-app/iris` and `igdrasil-app/homebrew-tap`, with only *Administration: Read-only*, which GitHub requires for traffic:

```sh
cd snapshot
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```

It runs every day at 23:00 UTC.

## Read

```sh
npx wrangler d1 execute iris-stats --remote --command \
  "SELECT day, sum(total) AS downloads FROM downloads GROUP BY day ORDER BY day"
```
