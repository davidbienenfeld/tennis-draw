import assert from "node:assert/strict";
import { applyAction, empty } from "../lib/state.mjs";

let n = 0;
const id = () => "p" + n++;
let s = empty();
for (const [name, ntrp] of [["Ana", 4], ["Ben", 3.5], ["Cy", 3]]) s = applyAction(s, { action: "addPlayer", name, ntrp }, id);
assert.equal(Object.keys(s.players).length, 3);
assert.throws(() => applyAction(s, { action: "addPlayer", name: "ana", ntrp: 3 }, id), /already/);
assert.throws(() => applyAction(s, { action: "addPlayer", name: "Dee", ntrp: 9 }, id), /rating/);

const draw = {
  format: "bo3tb", size: 4, rounds: 2,
  entrants: { p0: { name: "Ana", ntrp: 4, seed: 1 }, p1: { name: "Ben", ntrp: 3.5, seed: 2 }, p2: { name: "Cy", ntrp: 3, seed: 3 } },
  matches: {
    r1m0: { p1: "p0", p2: null, winner: "p0", sets: [], result: "bye", when: "" },
    r1m1: { p1: "p2", p2: "p1", winner: null, sets: [], result: null, when: "" },
    r2m0: { p1: "p0", p2: null, winner: null, sets: [], result: null, when: "" },
  },
};
s = applyAction(s, { action: "setDraw", draw });
assert.throws(() => applyAction(s, { action: "setDraw", draw }), /already exists/);
assert.throws(() => applyAction(s, { action: "removePlayer", id: "p0" }), /bracket/);
s = applyAction(s, { action: "patchMatches", patch: { r1m1: { winner: "p1", sets: [[3, 6], [4, 6]], result: "done" }, r2m0: { p2: "p1" } } });
assert.equal(s.draw.matches.r2m0.p1, "p0");
assert.equal(s.draw.matches.r2m0.p2, "p1");
assert.equal(s.draw.matches.r1m1.when, "");
assert.throws(() => applyAction(s, { action: "patchMatches", patch: { r9m0: {} } }), /Unknown match/);
assert.throws(() => applyAction(s, { action: "patchMatches", patch: { r1m1: { sets: [[1]] } } }), /two game/);
s = applyAction(s, { action: "clearDraw" });
assert.equal(s.draw, null);
console.log("state tests passed");
