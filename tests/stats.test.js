// Test dei calcoli delle statistiche. Esegui: node --test
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
  "2026-09-06": D([["run", false]]),         // non realizzato
  "2026-09-10": D([["muay", true]]),
  "2026-10-02": D([["g4", true], ["run", true]]),    // un giorno solo
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
  assert.deepEqual(P(C.mix(days, 2026, 8)), { res: 1, muay: 2, cardio: 0, contrast: 1, massage: 0, g2: 1, g4: 0, g7: 0, run: 0, swim: 0 });
  assert.deepEqual(P(C.mix(days, 2026, 9)), { res: 1, muay: 1, cardio: 1, contrast: 0, massage: 0, g2: 0, g4: 1, g7: 0, run: 1, swim: 0 });
});

const X = (kg, done = true) => ({ done, kg, sets: [] });
const L = {
  "2026-08-03": { acts: [], ex: { legpress: X(160) } },
  "2026-09-01": { acts: [], ex: { legpress: X(170) } },
  "2026-09-15": { acts: [], ex: { legpress: X(170), rdl: { done: false, kg: null, sets: [true] } } },
  "2026-10-02": { acts: [], ex: { legpress: X(175), chestpress: X(50) } },
  "2026-10-06": { acts: [], ex: { legpress: X(180), chestpress: X(50) } },
};

test("sessions: solo giorni con peso, in ordine", () => {
  assert.deepEqual(P(C.sessions(L, "legpress").map(s => s.kg)), [160, 170, 170, 175, 180]);
  assert.deepEqual(P(C.sessions(L, "rdl")), []);
  assert.equal(C.countSessions(L, "rdl"), 1);
  assert.equal(C.countSessions(L, "legpress"), 5);
});

test("loadsUp: ultima sessione del mese contro l'ultima prima del mese", () => {
  const ids = ["legpress", "chestpress", "rdl"];
  assert.equal(C.loadsUp(L, 2026, 9, ids), 1); // legpress 170 -> 180, chestpress 50 -> 50
  assert.equal(C.loadsUp(L, 2026, 8, ids), 1); // legpress 160 -> 170
  assert.equal(C.loadsUp(L, 2026, 7, ids), 0); // una sola sessione, riferimento = se stessa
});

test("progress: variazione, settimane, fermo", () => {
  const p = C.progress(C.sessions(L, "legpress"), TODAY);
  assert.equal(p.first, 160); assert.equal(p.last, 180); assert.equal(p.diff, 20);
  assert.equal(p.pct, 12.5); assert.equal(p.weeks, 9); assert.equal(p.lastDate, "2026-10-06");
  assert.equal(p.count, 5); assert.equal(p.stuck, null);
  const s2 = [{ d: "2026-08-01", kg: 100 }, { d: "2026-09-01", kg: 110 }, { d: "2026-09-08", kg: 110 }];
  assert.equal(C.progress(s2, "2026-10-07").stuck, 5);
  assert.equal(C.progress(s2, "2026-09-20").stuck, null);
  assert.equal(C.progress([], TODAY), null);
});

test("lastSessionId: esercizio con la sessione più recente", () => {
  assert.equal(C.lastSessionId(L, ["legpress", "chestpress", "rdl"]), "legpress");
  assert.equal(C.lastSessionId({}, ["legpress"]), null);
});

test("corsa e nuoto contano come cardio e come allenamento, il massaggio no", () => {
  const d3 = {
    "2026-11-02": D([["swim", true]]),
    "2026-11-03": D([["run", true], ["swim", true]]),
    "2026-11-04": D([["massage", true]]),
    "2026-11-05": D([["massage", true], ["contrast", true]]),
  };
  assert.equal(C.trained(d3["2026-11-02"]), true);
  assert.equal(C.trained(d3["2026-11-04"]), false);
  assert.equal(C.monthTrained(d3, 2026, 10), 2);
  assert.deepEqual(P(C.mix(d3, 2026, 10)), { res: 0, muay: 0, cardio: 3, contrast: 1, massage: 2, g2: 0, g4: 0, g7: 0, run: 1, swim: 2 });
});
