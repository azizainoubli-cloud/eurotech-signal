# TechCap Intelligence

Public website tracking European startup funding: every disclosed round since 2021 by country, sector, stage and investor, with an interactive map, trends, key signals and a searchable rounds table.

- **Data:** [Tech.eu Funding Explorer](https://funding.tech.eu) API (CC BY 4.0). Israel excluded; country views cover the EU27, UK, Switzerland, Norway and Iceland.
- **Updates:** `.github/workflows/update.yml` runs `scripts/build-data.mjs` at 05:00 and 19:00 UTC, saves the snapshot in `site/data/` and republishes the site on GitHub Pages. Run it by hand from the Actions tab ("Update data and publish" → Run workflow; set *full* to 1 to re-fetch every year).
- **Funds currently investing:** computed in the page from the last 12 months of rounds (refreshed with every run), with investor types from Tech.eu's investor directory (`site/data/investors.json`, also refreshed every run).
- **Latest announcements:** `site/data/announcements.json`, written by the TechCap Intelligence daily news scan.
- **Early-access signup:** the Beehiiv form embedded in the "Join early access" section of `site/index.html` (form ID `e144240e-0ef7-48e0-849a-57f2a25f4973`).

## Website

The site has six pages plus the dashboard, all static files in `site/`:

| Page | File |
| --- | --- |
| Home | `index.html` |
| Intelligence Platform | `platform.html` |
| Research & Insights | `research.html` |
| Ecosystem Engagement | `engagement.html` |
| About | `about.html` |
| Contact | `contact.html` |
| Funding dashboard (live data) | `dashboard.html` |

- **Copy and settings:** `content/site.mjs`. Edit text, the contact email, LinkedIn links and the founder name there.
- **Components:** `scripts/site/components.mjs` (header, footer, cards, charts).
- **Styles and behaviour:** `site/assets/site.css` and `site/assets/site.js`. The dashboard keeps `style.css` and `app.js`.
- **Build:** `node scripts/build-site.mjs` regenerates the six pages, `sitemap.xml` and `robots.txt`. No dependencies. The workflow runs it after every data update, so the figures on the home and platform pages stay current.
- **Before launch:** set `contact.email` (and `emailIsPlaceholder: false`), the LinkedIn URLs and, with a custom domain, `baseUrl`.

To add a platform module, a service or an audience, add an entry to the matching list in `content/site.mjs` and rebuild.

## Setup

1. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. Actions → "Update data and publish" → **Run workflow** with *full* = 1 for the first build (takes about 5 minutes).
3. Optional custom domain: Settings → Pages → Custom domain, plus a CNAME record at your registrar pointing `www` to `<username>.github.io`.
