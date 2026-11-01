import assert from "node:assert/strict";
import { applyAction, migrate, summary } from "../lib/state.mjs";
import { resolve, effectiveOrder } from "../public/bracket.mjs";

let n = 0;
const newId = () => "p" + n++;
const act = (s, body) => applyAction(s, body, newId);

// Play every match, higher seed winning, and check matches played and places.
function playOut(N) {
  let [s, t] = act(undefined, { action: "createTournament", name: `Test ${N}` });
  const tid = t.id;
  const levels = [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];
  for (let i = 0; i < N; i++) [s] = act(s, { action: "addPlayer", t: tid, name: `P${i}`, ntrp: levels[i % 9] });
  [s] = act(s, { action: "makeDraw", t: tid, format: "set1" });
  const draw = () => s.tournaments[tid].draw;
  for (let guard = 0; guard < 200; guard++) {
    const v = resolve(draw());
    const ready = Object.values(v.matches).find((m) => m.p1 && m.p2 && !m.done);
    if (!ready) break;
    const e = draw().entrants, p1First = e[ready.p1].seed < e[ready.p2].seed;
    [s] = act(s, { action: "recordResult", t: tid, match: ready.id, result: "done", sets: [p1First ? [6, 3] : [3, 6]] });
  }
  const v = resolve(draw());
  assert.ok(v.complete, `${N}: tournament should finish`);
  const played = {};
  for (const m of Object.values(v.matches)) if (!m.auto && m.done) for (const p of [m.p1, m.p2]) played[p] = (played[p] || 0) + 1;
  const places = Object.values(v.places).sort((a, b) => a - b);
  assert.deepEqual(places, Array.from({ length: N }, (_, i) => i + 1), `${N}: places 1..N`);
  // With higher seeds always winning, places should equal seeds.
  for (const [pid, p] of Object.entries(v.places)) assert.equal(p, draw().entrants[pid].seed, `${N}: seed ${draw().entrants[pid].seed} placed ${p}`);
  return { s, tid, played, v };
}

const full = playOut(16);
assert.ok(Object.values(full.played).every((c) => c === 4), "16 players: everyone plays 4");
assert.equal(Object.keys(full.played).length, 16);
const eight = playOut(8);
assert.ok(Object.values(eight.played).every((c) => c === 3), "8 players: everyone plays 3");
for (const N of [2, 3, 5, 6, 7, 12, 13]) playOut(N);
assert.equal(summary(full.tid, full.s.tournaments[full.tid]).status, "complete");

// Seeding edits.
let [s, t] = act(undefined, { action: "createTournament", name: "Seeds" });
for (const [name, ntrp] of [["A", 4], ["B", 3.5], ["C", 3]]) [s] = act(s, { action: "addPlayer", t: t.id, name, ntrp });
const ids = effectiveOrder(s.tournaments[t.id]);
[s] = act(s, { action: "setOrder", t: t.id, order: [ids[2], ids[0], ids[1]] });
[s] = act(s, { action: "addPlayer", t: t.id, name: "D", ntrp: 5 });
const order = effectiveOrder(s.tournaments[t.id]).map((id) => s.tournaments[t.id].players[id].name);
assert.deepEqual(order, ["D", "C", "A", "B"], "late entrant goes in by rating");
assert.throws(() => act(s, { action: "setOrder", t: t.id, order: [ids[0]] }), /seed list changed/);
[s] = act(s, { action: "makeDraw", t: t.id, format: "bo3tb" });
assert.equal(s.tournaments[t.id].draw.entrants[ids[2]].seed, 2);

// Locking and validation.
const fs = full.s.tournaments[full.tid];
assert.throws(() => act(full.s, { action: "clearResult", t: full.tid, match: "r1m0" }), /locked/);
assert.throws(() => act(full.s, { action: "recordResult", t: full.tid, match: "r9m0", result: "done", sets: [] }), /Unknown match/);
assert.ok(fs.draw);

// Migration from the single-tournament version.
const old = {
  meta: { name: "Old Open" },
  players: { a: { name: "A", ntrp: 4 }, b: { name: "B", ntrp: 3 }, c: { name: "C", ntrp: 2 } },
  draw: {
    format: "set1", size: 4, rounds: 2,
    entrants: { a: { name: "A", ntrp: 4, seed: 1 }, b: { name: "B", ntrp: 3, seed: 2 }, c: { name: "C", ntrp: 2, seed: 3 } },
    matches: {
      r1m0: { p1: "a", p2: null, winner: "a", sets: [], result: "bye", when: "" },
      r1m1: { p1: "c", p2: "b", winner: "b", sets: [[2, 6]], result: "done", when: "" },
      r2m0: { p1: "a", p2: "b", winner: null, sets: [], result: null, when: "Sat 9am" },
    },
  },
};
const m = migrate(old);
const mv = resolve(m.tournaments.main.draw);
assert.equal(m.tournaments.main.name, "Old Open");
assert.equal(mv.matches.r2m0.p1, "a");
assert.equal(mv.matches.r2m0.p2, "b");
assert.equal(mv.matches.r2m0.when, "Sat 9am");
assert.equal(mv.places.c, 3, "C is placed 3rd of 3 (the bye fills the 4th spot)");

// Deleting.
[s] = act(s, { action: "deleteTournament", t: t.id });
assert.equal(s.tournaments[t.id], undefined);
assert.throws(() => act(s, { action: "rename", t: t.id, name: "x" }), /no longer exists/);

console.log("state tests passed");
