# Friends Open tennis draw

A shared knockout bracket for a group of friends. Players enter with a self-rated NTRP level, the draw is seeded from those ratings, and recorded scores move winners through to a champion.

- `public/index.html` is the whole front end.
- `netlify/functions/state.mjs` serves `/api/state`, storing the tournament in Netlify Blobs (no database or extra account needed).
- `lib/state.mjs` validates and applies every change. Run `npm test` to check it.

## Deploy

Option A, from GitHub (updates redeploy automatically):
1. Push this folder to a GitHub repo.
2. In Netlify: **Add new site → Import an existing project**, then pick the repo. The settings come from `netlify.toml`, so accept the defaults.

Option B, from your computer:
```
npm install
npx netlify-cli login
npx netlify-cli deploy --prod
```

Netlify Blobs turns on automatically for sites with functions. Opening `public/index.html` directly, without the function, shows a demo with example players.

## Who can edit

Anyone with the site link can enter players and record scores. Share the link only with the group.
