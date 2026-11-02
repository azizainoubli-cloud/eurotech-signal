# EuroTech Signal

Public website tracking European startup funding: every disclosed round since 2021 by country, sector, stage and investor, with an interactive map, trends, key signals and a searchable rounds table.

- **Data:** [Tech.eu Funding Explorer](https://funding.tech.eu) API (CC BY 4.0). Israel excluded; country views cover the EU27, UK, Switzerland, Norway and Iceland.
- **Updates:** `.github/workflows/update.yml` runs `scripts/build-data.mjs` at 05:00 and 19:00 UTC, saves the snapshot in `site/data/` and republishes the site on GitHub Pages. Run it by hand from the Actions tab ("Update data and publish" → Run workflow; set *full* to 1 to re-fetch every year).
- **Latest announcements:** `site/data/announcements.json`, written by the EuroTech Signal daily news scan.
- **Subscribe button:** set `SUBSCRIBE_URL` at the top of `site/assets/app.js`.

## Setup

1. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. Actions → "Update data and publish" → **Run workflow** with *full* = 1 for the first build (takes about 5 minutes).
3. Optional custom domain: Settings → Pages → Custom domain, plus a CNAME record at your registrar pointing `www` to `<username>.github.io`.
