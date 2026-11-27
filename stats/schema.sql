-- Iris usage counts. Nothing here identifies a person: no IP address, no install id, no user agent.

-- Cumulative download count of each release asset, as GitHub reported it that day (UTC).
CREATE TABLE IF NOT EXISTS downloads (
  day TEXT NOT NULL,
  tag TEXT NOT NULL,
  asset TEXT NOT NULL,
  total INTEGER NOT NULL,
  PRIMARY KEY (day, tag, asset)
);

-- GitHub's own per-day traffic buckets (UTC). GitHub keeps 14 days; each run rewrites them, so a day settles once it is past.
CREATE TABLE IF NOT EXISTS traffic (
  day TEXT NOT NULL,
  repo TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('clones', 'views')),
  count INTEGER NOT NULL,
  uniques INTEGER NOT NULL,
  PRIMARY KEY (day, repo, kind)
);

-- Update checks from Iris's menu bar app, which checks once a day; see feed/index.js for what they do not cover.
CREATE TABLE IF NOT EXISTS checks (
  day TEXT NOT NULL,
  version TEXT NOT NULL,
  country TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (day, version, country)
);

-- The last feed GitHub served, for when GitHub cannot.
CREATE TABLE IF NOT EXISTS feed (
  name TEXT PRIMARY KEY,
  body BLOB NOT NULL
);
