// All tournaments and the actions the page can apply to them.
// Kept free of Netlify imports so it can be tested with plain Node.

import { NTRP_LEVELS, FORMATS, buildDraw, resolve, effectiveOrder, winnerFromSets } from "../public/bracket.mjs";

const MAX_PLAYERS = 64;
const MAX_TOURNAMENTS = 100;

export const empty = () => ({ tournaments: {} });

class BadRequest extends Error {}
const fail = (msg) => { throw new BadRequest(msg); };
const cleanText = (v, max) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const defaultId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

/** Bring data saved by the single-tournament version into the current shape. */
export function migrate(state) {
  if (!state) return empty();
  if (state.tournaments) return state;
  const joined = Object.values(state.players || {}).map((p) => p.joinedAt).filter(Boolean).sort();
  const t = { name: state.meta?.name || "Friends Open", createdAt: state.draw?.createdAt || joined[0] || "2026-10-27T00:00:00.000Z", players: state.players || {}, order: null, draw: null };
  const old = state.draw;
  if (old?.matches) {
    const slots = [];
    for (let i = 0; i < old.size / 2; i++) slots.push(old.matches[`r1m${i}`].p1, old.matches[`r1m${i}`].p2);
    const results = {}, when = {};
    for (const [id, m] of Object.entries(old.matches)) {
      if (m.winner && m.result !== "bye") results[id] = { winner: m.winner, sets: m.sets || [], result: m.result || "done" };
      if (m.when) when[id] = m.when;
    }
    t.draw = { format: old.format, size: old.size, rounds: old.rounds, entrants: old.entrants, slots, results, when, createdAt: old.createdAt };
  }
  return { tournaments: Object.keys(t.players).length || t.draw ? { main: t } : {} };
}

export function summary(id, t) {
  const players = Object.keys(t.players).length;
  if (!t.draw) return { id, name: t.name, createdAt: t.createdAt, players, status: "signup" };
  const v = resolve(t.draw);
  return {
    id, name: t.name, createdAt: t.createdAt, players: Object.keys(t.draw.entrants).length,
    status: v.complete ? "complete" : "playing", round: v.currentRound, rounds: t.draw.rounds,
    champion: v.champion ? t.draw.entrants[v.champion]?.name : null,
  };
}

function checkSets(sets, cols) {
  if (!Array.isArray(sets) || sets.length > cols) fail(`Scores can have at most ${cols} set${cols > 1 ? "s" : ""}.`);
  for (const s of sets)
    if (!Array.isArray(s) || s.length !== 2 || !s.every((g) => Number.isInteger(g) && g >= 0 && g <= 99)) fail("Each set needs two game counts.");
  return sets;
}

function matchFor(t, matchId) {
  if (!t.draw) fail("There's no draw yet.");
  const view = resolve(t.draw);
  const m = view.matches[matchId];
  if (!m) fail("Unknown match.");
  return m;
}

/** Returns [newState, response]. */
export function applyAction(state, body, newId = defaultId) {
  const s = structuredClone(migrate(state));
  const action = body?.action;

  if (action === "createTournament") {
    const name = cleanText(body.name, 40);
    if (!name) fail("Give the tournament a name.");
    if (Object.keys(s.tournaments).length >= MAX_TOURNAMENTS) fail("There are too many tournaments. Delete an old one first.");
    const id = newId();
    s.tournaments[id] = { name, createdAt: new Date().toISOString(), players: {}, order: null, draw: null };
    return [s, { id, ...s.tournaments[id] }];
  }

  const t = s.tournaments[body?.t];
  if (!t) fail("That tournament no longer exists.");
  const out = () => [s, { id: body.t, ...t }];

  switch (action) {
    case "deleteTournament":
      delete s.tournaments[body.t];
      return [s, { deleted: body.t }];
    case "rename": {
      const name = cleanText(body.name, 40);
      if (!name) fail("Enter a tournament name.");
      t.name = name;
      return out();
    }
    case "addPlayer": {
      const name = cleanText(body.name, 32), ntrp = Number(body.ntrp);
      if (!name) fail("Enter a name.");
      if (!NTRP_LEVELS.includes(ntrp)) fail("Pick a rating between 2.0 and 6.0.");
      if (Object.keys(t.players).length >= MAX_PLAYERS) fail(`A tournament is capped at ${MAX_PLAYERS} players.`);
      if (Object.values(t.players).some((p) => p.name.toLowerCase() === name.toLowerCase())) fail(`${name} is already entered.`);
      t.players[newId()] = { name, ntrp, joinedAt: new Date().toISOString() };
      return out();
    }
    case "removePlayer":
      if (t.draw?.entrants?.[body.id]) fail("That player is in the current bracket. Scrap the draw first.");
      delete t.players[body.id];
      if (Array.isArray(t.order)) t.order = t.order.filter((id) => id !== body.id);
      return out();
    case "setOrder": {
      if (t.draw) fail("The draw is already made. Scrap it to change the seeding.");
      if (body.order === null) { t.order = null; return out(); }
      const ids = Object.keys(t.players);
      const order = body.order;
      if (!Array.isArray(order) || order.length !== ids.length || new Set(order).size !== ids.length || !order.every((id) => t.players[id]))
        fail("The seed list changed while you were editing. Try again.");
      t.order = order;
      return out();
    }
    case "makeDraw":
      if (t.draw) fail("The draw is already made.");
      if (!FORMATS[body.format]) fail("Pick a match format.");
      if (Object.keys(t.players).length < 2) fail("You need at least 2 players.");
      t.order = effectiveOrder(t);
      t.draw = buildDraw(t, body.format);
      return out();
    case "clearDraw":
      t.draw = null;
      return out();
    case "setWhen": {
      matchFor(t, body.match);
      const when = cleanText(body.when, 60);
      if (when) t.draw.when[body.match] = when; else delete t.draw.when[body.match];
      return out();
    }
    case "recordResult": {
      const m = matchFor(t, body.match);
      if (!m.p1 || !m.p2) fail("Both players need to be known before a score goes in.");
      if (m.locked) fail("This result is locked because a match it led to has been played.");
      const result = body.result;
      if (!["done", "ret", "wo"].includes(result)) fail("Unknown result.");
      const sets = result === "wo" ? [] : checkSets(body.sets ?? [], FORMATS[t.draw.format].cols.length);
      let winner = body.winner;
      if (result === "done") {
        winner = winnerFromSets(sets, m.p1, m.p2);
        if (!winner) fail("The set scores don't settle a winner.");
      } else if (winner !== m.p1 && winner !== m.p2) fail("Pick who advances.");
      t.draw.results[body.match] = { winner, sets, result };
      if (typeof body.when === "string") {
        const when = cleanText(body.when, 60);
        if (when) t.draw.when[body.match] = when; else delete t.draw.when[body.match];
      }
      return out();
    }
    case "clearResult": {
      const m = matchFor(t, body.match);
      if (m.locked) fail("This result is locked because a match it led to has been played.");
      delete t.draw.results[body.match];
      return out();
    }
    default:
      fail("Unknown action.");
  }
}

export { BadRequest };
