// Tournament state and the actions the page can apply to it.
// Kept free of Netlify imports so it can be tested with plain Node.

export const NTRP_LEVELS = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0];
export const FORMATS = ["set1", "pro8", "bo3", "bo3tb"];
const MAX_PLAYERS = 64;
const MATCH_FIELDS = ["p1", "p2", "winner", "sets", "result", "when"];
const RESULTS = [null, "bye", "done", "ret", "wo"];

export const empty = () => ({ players: {}, meta: { name: "Friends Open" }, draw: null });

class BadRequest extends Error {}
const fail = (msg) => { throw new BadRequest(msg); };
const cleanText = (v, max) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const isId = (v) => v === null || (typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v));

function checkSets(sets) {
  if (!Array.isArray(sets) || sets.length > 3) fail("Scores must be up to 3 sets.");
  for (const s of sets)
    if (!Array.isArray(s) || s.length !== 2 || !s.every((g) => Number.isInteger(g) && g >= 0 && g <= 99)) fail("Each set needs two game counts.");
  return sets;
}

function checkDraw(d) {
  if (!d || typeof d !== "object") fail("Missing draw.");
  if (!FORMATS.includes(d.format)) fail("Unknown match format.");
  if (![2, 4, 8, 16, 32, 64].includes(d.size) || 2 ** d.rounds !== d.size) fail("Bracket size is invalid.");
  if (!d.entrants || typeof d.entrants !== "object" || !d.matches || typeof d.matches !== "object") fail("Draw is incomplete.");
  const entrants = {};
  for (const [id, e] of Object.entries(d.entrants)) {
    if (!isId(id)) fail("Bad player id.");
    entrants[id] = { name: cleanText(e.name, 32), ntrp: Number(e.ntrp), seed: Number(e.seed) };
  }
  const matches = {};
  for (let r = 1; r <= d.rounds; r++)
    for (let i = 0; i < d.size / 2 ** r; i++) {
      const m = d.matches[`r${r}m${i}`];
      if (!m) fail("Draw is missing a match.");
      matches[`r${r}m${i}`] = cleanMatch(m);
    }
  return { format: d.format, size: d.size, rounds: d.rounds, entrants, matches, createdAt: new Date().toISOString() };
}

function cleanMatch(m, base = { p1: null, p2: null, winner: null, sets: [], result: null, when: "" }) {
  const out = { ...base };
  for (const k of MATCH_FIELDS) {
    if (!(k in m)) continue;
    const v = m[k];
    if (k === "sets") out.sets = checkSets(v);
    else if (k === "when") out.when = cleanText(v, 60);
    else if (k === "result") { if (!RESULTS.includes(v)) fail("Unknown result."); out.result = v; }
    else { if (!isId(v)) fail("Bad player id."); out[k] = v; }
  }
  return out;
}

export function applyAction(state, body, newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20)) {
  const s = structuredClone(state);
  switch (body?.action) {
    case "addPlayer": {
      const name = cleanText(body.name, 32);
      const ntrp = Number(body.ntrp);
      if (!name) fail("Enter a name.");
      if (!NTRP_LEVELS.includes(ntrp)) fail("Pick a rating between 2.0 and 6.0.");
      if (Object.keys(s.players).length >= MAX_PLAYERS) fail(`The draw is capped at ${MAX_PLAYERS} players.`);
      if (Object.values(s.players).some((p) => p.name.toLowerCase() === name.toLowerCase())) fail(`${name} is already in the draw.`);
      s.players[newId()] = { name, ntrp, joinedAt: new Date().toISOString() };
      return s;
    }
    case "removePlayer":
      if (s.draw?.entrants?.[body.id]) fail("That player is in the current bracket. Scrap the draw first.");
      delete s.players[body.id];
      return s;
    case "setMeta": {
      const name = cleanText(body.name, 40);
      if (!name) fail("Enter a tournament name.");
      s.meta = { ...s.meta, name };
      return s;
    }
    case "setDraw":
      if (s.draw) fail("A draw already exists. Scrap it before making a new one.");
      s.draw = checkDraw(body.draw);
      return s;
    case "clearDraw":
      s.draw = null;
      return s;
    case "patchMatches": {
      if (!s.draw) fail("There's no draw yet.");
      const patch = body.patch;
      if (!patch || typeof patch !== "object") fail("Missing changes.");
      for (const [id, m] of Object.entries(patch)) {
        if (!s.draw.matches[id]) fail("Unknown match.");
        s.draw.matches[id] = cleanMatch(m, s.draw.matches[id]);
      }
      return s;
    }
    default:
      fail("Unknown action.");
  }
}

export { BadRequest };
