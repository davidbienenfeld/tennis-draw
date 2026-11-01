// Bracket logic shared by the page and the server.
//
// Every round, each group of players splits in two: winners play on for the
// top half of the group's places, losers for the bottom half. After the last
// round every player has a place, and in a full draw everyone has played the
// same number of matches (4 in a 16-player draw).

export const NTRP = [
  [2.0, "New to the game"], [2.5, "Learning to rally"], [3.0, "Consistent at medium pace"],
  [3.5, "Directional control, getting comfortable at net"], [4.0, "Dependable strokes, some variety"],
  [4.5, "Power and spin, solid serve"], [5.0, "Builds points, has a weapon"],
  [5.5, "Tournament-level"], [6.0, "Ranked junior or college player"],
];
export const NTRP_LEVELS = NTRP.map(([v]) => v);

export const FORMATS = {
  set1: { label: "One set, tiebreak at 6–6", cols: ["Set"] },
  pro8: { label: "Pro set to 8", cols: ["Pro"] },
  bo3: { label: "Best of 3 sets", cols: ["1", "2", "3"] },
  bo3tb: { label: "Best of 3, match tiebreak for the 3rd", cols: ["1", "2", "TB"] },
};

export function seedOrder(size) {
  let o = [1];
  while (o.length < size) { const n = o.length * 2 + 1; o = o.flatMap((s) => [s, n - s]); }
  return o;
}
export function bracketSize(n) { let s = 2; while (s < n) s *= 2; return s; }

export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Seed order: by rating (then sign-up time), with any hand edits applied. */
export function effectiveOrder(t) {
  const byRating = Object.entries(t.players || {})
    .sort(([, a], [, b]) => b.ntrp - a.ntrp || String(a.joinedAt).localeCompare(String(b.joinedAt)))
    .map(([id]) => id);
  if (!Array.isArray(t.order)) return byRating;
  const list = t.order.filter((id) => t.players[id]);
  for (const id of byRating) {
    if (list.includes(id)) continue;
    // A player who joined after the hand edit goes in by rating.
    const at = list.findIndex((o) => t.players[o].ntrp < t.players[id].ntrp);
    at === -1 ? list.push(id) : list.splice(at, 0, id);
  }
  return list;
}

export function buildDraw(t, format) {
  const order = effectiveOrder(t);
  const N = order.length, size = bracketSize(N), rounds = Math.log2(size);
  const entrants = {};
  order.forEach((id, i) => (entrants[id] = { name: t.players[id].name, ntrp: t.players[id].ntrp, seed: i + 1 }));
  const slots = seedOrder(size).map((seed) => (seed <= N ? order[seed - 1] : null));
  return { format, size, rounds, entrants, slots, results: {}, when: {}, createdAt: new Date().toISOString() };
}

const mainName = (players) => (players === 2 ? "Final" : players === 4 ? "Semifinals" : players === 8 ? "Quarterfinals" : `Round of ${players}`);

/** Label for the group a match belongs to, e.g. "Quarterfinals", "Places 9–16", "5th place". */
export function groupLabel(m, n) {
  const g = m.hi - m.lo + 1;
  if (m.lo === 1) return mainName(g);
  if (g === 2) return `${ordinal(m.lo)} place`;
  return `Places ${m.lo}–${Math.min(m.hi, n)}`;
}

/**
 * Work out every match from the seeded slots and the recorded results.
 * In the returned matches, a player of `undefined` is still to be decided
 * and `null` is a bye.
 */
export function resolve(draw) {
  const { size, rounds } = draw, half = size / 2;
  const matches = {}, rawPlace = {};
  let byePlaces = [];
  let cur = draw.slots.slice();
  for (let r = 1; r <= rounds; r++) {
    const next = new Array(size).fill(undefined);
    const g = size / 2 ** (r - 1), gm = g / 2;
    for (let i = 0; i < half; i++) {
      const id = `r${r}m${i}`, group = Math.floor(i / gm), j = i % gm, lo = group * g + 1;
      const m = {
        id, r, i, lo, hi: lo + g - 1, p1: cur[2 * i], p2: cur[2 * i + 1],
        winner: undefined, loser: undefined, sets: [], result: null, when: draw.when?.[id] || "",
        auto: false, done: false, locked: false, next: [],
      };
      if (m.p1 !== undefined && m.p2 !== undefined) {
        if (m.p1 === null || m.p2 === null) {
          m.winner = m.p1 ?? m.p2; m.loser = null; m.auto = true; m.result = "bye"; m.done = true;
        } else {
          const res = draw.results?.[id];
          if (res && (res.winner === m.p1 || res.winner === m.p2)) {
            m.winner = res.winner; m.loser = res.winner === m.p1 ? m.p2 : m.p1;
            m.sets = res.sets || []; m.result = res.result || "done"; m.done = true;
          }
        }
      }
      if (r < rounds) {
        const ngm = gm / 2, pos = Math.floor(j / 2), side = j % 2;
        const wIdx = group * 2 * ngm + pos, lIdx = (group * 2 + 1) * ngm + pos;
        m.next = [`r${r + 1}m${wIdx}`, `r${r + 1}m${lIdx}`];
        if (m.done) { next[2 * wIdx + side] = m.winner; next[2 * lIdx + side] = m.loser; }
      } else if (m.done) {
        if (m.winner) rawPlace[m.winner] = lo; else byePlaces.push(lo);
        if (m.loser) rawPlace[m.loser] = lo + 1; else byePlaces.push(lo + 1);
      }
      matches[id] = m;
    }
    cur = next;
  }
  // A played result can't change once a match it fed into has been played.
  for (const m of Object.values(matches))
    m.locked = m.done && !m.auto && m.next.some((n) => matches[n].done && !matches[n].auto);
  // Byes take places too; close the gaps so real players are ranked 1..N.
  const places = {};
  for (const [pid, p] of Object.entries(rawPlace)) places[pid] = p - byePlaces.filter((b) => b < p).length;
  const real = Object.values(matches).filter((m) => !m.auto);
  const pending = real.filter((m) => !m.done);
  const currentRound = pending.length ? Math.min(...pending.map((m) => m.r)) : null;
  const final = matches[`r${rounds}m0`];
  return { matches, places, currentRound, champion: final.done ? final.winner : null, complete: !pending.length && final.done };
}

/** Which player won, from set scores; null if the sets don't settle it. */
export function winnerFromSets(sets, p1, p2) {
  let a = 0, b = 0;
  for (const [x, y] of sets) { if (x === y) return null; x > y ? a++ : b++; }
  return a === b ? null : a > b ? p1 : p2;
}
