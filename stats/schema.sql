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
