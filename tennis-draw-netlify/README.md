# Friends Open tennis draw

Tennis tournaments for a group of friends. Each tournament has its own sign-ups, seeding and draw. Players enter with a self-rated NTRP level, which sets the starting seeds; the organizer can reorder them before the draw.

The draw is a full placement draw: every round, winners and losers each split into their own sub-bracket, so nobody is knocked out. In a 16-player draw everyone plays 4 matches and finishes with a place from 1st to 16th. When the field isn't a power of two (say 12), byes fill the gaps and a few players play one match fewer.

- `public/index.html` is the front end; each tournament lives at `#t-<id>`.
- `public/bracket.mjs` holds the draw logic, shared by the page and the server.
- `netlify/functions/state.mjs` serves `/api/state`, storing everything in Netlify Blobs (no database or extra account needed).
- `lib/state.mjs` validates and applies every change, and moves data saved by the earlier single-tournament version into the new shape. Run `npm test` to check it.

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

Netlify Blobs turns on automatically for sites with functions.

## Who can edit

Anyone with the site link can enter players and record scores. Share the link only with the group.
