// Once a day: the release download counts and GitHub's traffic, saved before GitHub forgets them.
// It reads GitHub only; nothing about the people downloading is available to it or kept.

const RELEASES_REPO = "igdrasil-app/homebrew-tap";
const TRAFFIC_REPOS = ["igdrasil-app/iris", "igdrasil-app/homebrew-tap"];

export default {
  async scheduled(controller, env) {
    const day = new Date(controller.scheduledTime).toISOString().slice(0, 10);
    // Saved separately, so a traffic failure (an expired token) still keeps the downloads.
    const results = await Promise.allSettled([
      downloads(env, day).then((statements) => save(env, statements)),
      traffic(env).then((statements) => save(env, statements)),
    ]);
    const failures = results.filter((result) => result.status === "rejected").map((result) => result.reason);
    if (failures.length > 0) throw new AggregateError(failures, failures.join("; "));
  },
};

// D1 refuses an empty batch.
async function save(env, statements) {
  if (statements.length > 0) await env.DB.batch(statements);
}

async function downloads(env, day) {
  const statements = [];
  for (let page = 1; ; page++) {
    const releases = await github(env, `repos/${RELEASES_REPO}/releases?per_page=100&page=${page}`);
    for (const release of releases) {
      for (const asset of release.assets) {
        statements.push(
          env.DB.prepare(
            "INSERT INTO downloads (day, tag, asset, total) VALUES (?, ?, ?, ?) " +
              "ON CONFLICT (day, tag, asset) DO UPDATE SET total = excluded.total",
          ).bind(day, release.tag_name, asset.name, asset.download_count),
        );
      }
    }
    if (releases.length < 100) return statements;
  }
}

async function traffic(env) {
  const statements = [];
  for (const repo of TRAFFIC_REPOS) {
    for (const kind of ["clones", "views"]) {
      const report = await github(env, `repos/${repo}/traffic/${kind}`);
      for (const bucket of report[kind]) {
        statements.push(
          env.DB.prepare(
            "INSERT INTO traffic (day, repo, kind, count, uniques) VALUES (?, ?, ?, ?, ?) " +
              "ON CONFLICT (day, repo, kind) DO UPDATE SET count = excluded.count, uniques = excluded.uniques",
          ).bind(bucket.timestamp.slice(0, 10), repo, kind, bucket.count, bucket.uniques),
        );
      }
    }
  }
  return statements;
}

async function github(env, path) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "iris-stats",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  // Only traffic carries the token: GitHub refuses any request with a bad one, and the public releases must not depend on it.
  if (path.includes("/traffic/")) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com/${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub ${path}: ${response.status}`);
  return response.json();
}
