# Deployment (GitHub Pages)

The site is a single SvelteKit static build that works at `/time`, `/time/dev`,
or root (local dev) without a per-build `PUBLIC_BASE` — see
`app/src/lib/base.js` for runtime base detection.

## Branches

- `main` — production. Pushing to `main` deploys to
  `https://adem482p.github.io/time/`.
- `dev` — staging. Pushing to `dev` deploys to
  `https://adem482p.github.io/time/dev/`.

Create the `dev` branch from `main` (one-time):

```sh
git checkout -b dev main
git push -u origin dev
```

## Workflow (`.github/workflows/deploy.yml`)

1. Triggers on push to `main` or `dev`, and on `workflow_dispatch`.
2. `build` job: installs deps, preprocesses data, runs `npm run build` once
   (single build — location-agnostic via `base: ''` + `relative: true`).
3. `deploy` job: downloads the build, assembles it into both `site/` and
   `site/dev/` (same build, two paths), uploads the combined Pages artifact,
   and runs `deploy-pages`.
4. Concurrency: `group: "pages"`, `cancel-in-progress: false` — overlapping
   pushes queue instead of cancelling, so a `dev` push never clobbers an
   in-flight `main` deploy.

## Promote staging to production

When staging (`/time/dev/`) looks right, merge `dev` → `main` and push to
`main`:

```sh
git checkout main
git merge dev
git push origin main
```

## Local verification

Build and serve the real tree (browsers block `fetch` on `file://`):

```sh
cd app && npm run build
cd app/build && python3 -m http.server
```
