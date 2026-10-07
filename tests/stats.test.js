// Test dei calcoli delle statistiche. Esegui: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "stats.js"), "utf8"), ctx);
const C = ctx.StatsCalc;
// Values created inside the vm context have foreign prototypes: compare plain copies.
const P = v => JSON.parse(JSON.stringify(v));

const D = (acts, ex) => ({ acts: acts.map(([k, done]) => ({ k, done })), ex: ex || {} });
// today = mercoledì 7 ottobre 2026
const TODAY = "2026-10-07";
const days = {
  "2026-09-01": D([["muay", true]]),
  "2026-09-03": D([["g2", true]]),
  "2026-09-05": D([["contrast", true]]),     // non conta come allenamento
  "2026-09-06": D([["cardio", false]]),      // non realizzato
  "2026-09-10": D([["muay", true]]),
  "2026-10-02": D([["g4", true], ["cardio", true]]), // un giorno solo
  "2026-10-05": D([["muay", true]]),
  "2026-10-06": D([["rest", true]]),
};

test("trained: solo attività realizzate di allenamento", () => {
  assert.equal(C.trained(days["2026-09-01"]), true);
  assert.equal(C.trained(days["2026-09-05"]), false);
  assert.equal(C.trained(days["2026-09-06"]), false);
  assert.equal(C.trained(days["2026-10-06"]), false);
  assert.equal(C.trained(undefined), false);
});

test("monthTrained conta i giorni, non le attività", () => {
  assert.equal(C.monthTrained(days, 2026, 9), 2);
  assert.equal(C.monthTrained(days, 2026, 8), 3);
  assert.equal(C.monthTrained(days, 2026, 8, 3), 2);
});

test("compareMonth: mese corrente confrontato alla stessa data", () => {
  assert.deepEqual(P(C.compareMonth(days, 2026, 9, TODAY)), { cur: 2, prev: 2, diff: 0, sameDate: true });
  assert.deepEqual(P(C.compareMonth(days, 2026, 8, TODAY)), { cur: 3, prev: 0, diff: 3, sameDate: false });
});

test("compareMonth: 31 del mese contro un mese di 30 giorni", () => {
  const d2 = { "2026-11-30": D([["muay", true]]) };
  assert.equal(C.compareMonth(d2, 2026, 11, "2026-12-31").prev, 1);
});

test("mondayOf / addDays", () => {
  assert.equal(C.mondayOf("2026-10-07"), "2026-10-05");
  assert.equal(C.mondayOf("2026-10-04"), "2026-09-28");
  assert.equal(C.addDays("2026-09-28", 7), "2026-10-05");
});

test("monthWeeks: settimana del mese della sua domenica, in corso non è fallita", () => {
  assert.deepEqual(P(C.monthWeeks(days, 2026, 9, 1, TODAY)), { ok: 2, total: 2, current: 1 });
  assert.deepEqual(P(C.monthWeeks(days, 2026, 9, 2, TODAY)), { ok: 0, total: 1, current: 1 });
  assert.deepEqual(P(C.monthWeeks(days, 2026, 8, 1, TODAY)), { ok: 2, total: 4, current: null });
});

test("streak: serie attuale e record", () => {
  assert.deepEqual(P(C.streak(days, 1, TODAY)), { cur: 2, best: 2 });
  assert.deepEqual(P(C.streak(days, 2, TODAY)), { cur: 0, best: 1 });
  assert.deepEqual(P(C.streak({}, 5, TODAY)), { cur: 0, best: 0 });
});

test("lastWeeks: ultime settimane, l'ultima è quella in corso", () => {
  const w = C.lastWeeks(days, 1, TODAY, 3);
  assert.deepEqual(P(w.map(x => [x.mon, x.n, x.ok, x.current])), [
    ["2026-09-21", 0, false, false],
    ["2026-09-28", 1, true, false],
    ["2026-10-05", 1, true, true],
  ]);
});

test("mix: solo attività realizzate, resistance suddiviso", () => {
  assert.deepEqual(P(C.mix(days, 2026, 8)), { res: 1, muay: 2, cardio: 0, contrast: 1, g2: 1, g4: 0, g7: 0 });
  assert.deepEqual(P(C.mix(days, 2026, 9)), { res: 1, muay: 1, cardio: 1, contrast: 0, g2: 0, g4: 1, g7: 0 });
});
