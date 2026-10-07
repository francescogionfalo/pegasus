# Pegasus Statistiche Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere la vista Statistiche (riepilogo del mese, Costanza, Mix attività, Progressione carichi) all'app Pegasus.

**Architecture:** Nuovo file `stats.js` con due parti: `StatsCalc`, funzioni di calcolo pure senza DOM (testate in Node con `node:test`), e il disegno della vista (solo nel browser, protetto da `typeof document`). `index.html` aggiunge la terza scheda, la sezione `#stats`, lo stile e chiama `renderStats()`. I grafici sono SVG scritti a mano, colorati con classi CSS che usano le variabili del tema.

**Tech Stack:** HTML, CSS e JavaScript puri, nessun bundler. Test con Node (`node --test`, `node:assert`, `node:vm`). Verifica nel browser con Playwright da `~/.claude/skills/playwright-skill/node_modules/playwright`.

**Spec:** `docs/superpowers/specs/2026-10-07-pegasus-statistiche-design.md`

## Global Constraints

- Nessun build step, nessuna dipendenza esterna nuova. `stats.js` è uno script classico (non modulo) caricato dopo lo script principale.
- Testi dell'app in italiano, **mai il trattino lungo** (em dash): usare virgola, punto, due punti o "·".
- Giorno allenato = attività `done` tra `muay`, `g2`, `g4`, `g7`, `cardio`. Contrasto e riposo esclusi.
- Settimana lunedì-domenica, appartiene al mese della sua domenica.
- Obiettivo settimanale `S.goal`, intero 1-7, predefinito 5, salvato nei dati e nel backup.
- Statistiche dei carichi solo dalle sessioni (`S.days[d].ex[id].kg != null`); `S.log` non si usa.
- Colori SVG solo tramite classi CSS o `style="..."`, mai `fill="var(...)"` (gli attributi di presentazione SVG non accettano `var()`).
- La cartella del progetto **non è un repository git**: niente commit. Al posto del commit, ogni task termina rieseguendo i test.
- Ogni deploy alza `VERSION` in `sw.js`.

---

## File Structure

- Create `stats.js`: `StatsCalc` (calcoli puri) + `renderStats(el)` e i relativi listener (solo browser).
- Create `tests/stats.test.js`: test dei calcoli, eseguibili con `node --test tests/`.
- Modify `index.html`: scheda "Statistiche", `<section id="stats">`, `render()`, animazione d'entrata, import che conserva `goal`, CSS della vista, `<script src="stats.js">`.
- Modify `sw.js`: `stats.js` nei file precaricati, `VERSION` a `v8`.
- Modify `CLAUDE.md`: struttura e modello dati.

---

### Task 1: Calcoli di costanza e mix

**Files:**
- Create: `stats.js`
- Test: `tests/stats.test.js`

**Interfaces:**
- Produces (su `globalThis.StatsCalc`, date sempre stringhe `"AAAA-MM-GG"`, mesi 0-based come `Date`):
  - `trained(rec) -> boolean`
  - `monthTrained(days, y, m, upTo?) -> number` (upTo = ultimo giorno incluso, 0/assente = tutto il mese)
  - `compareMonth(days, y, m, today) -> {cur, prev, diff, sameDate}`
  - `weekCount(days, monday) -> number`
  - `monthWeeks(days, y, m, goal, today) -> {ok, total, current}` (`current` = giorni della settimana in corso se il mese è quello di oggi, altrimenti `null`)
  - `streak(days, goal, today) -> {cur, best}`
  - `lastWeeks(days, goal, today, count=12) -> [{mon, n, ok, current}]`
  - `mix(days, y, m) -> {res, muay, cardio, contrast, g2, g4, g7}`
  - `mondayOf(date) -> string`, `addDays(date, n) -> string`

- [ ] **Step 1: Write the failing test**

Create `tests/stats.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL, `ENOENT ... stats.js` (il file non esiste).

- [ ] **Step 3: Write minimal implementation**

Create `stats.js`:

```js
// Statistiche di Pegasus.
// StatsCalc: calcoli puri sui dati (nessun DOM), testati in tests/stats.test.js.
// Sotto, protetta da `typeof document`, la vista che usa le globali di index.html.
var StatsCalc = (() => {
  const TRAIN = new Set(["muay", "g2", "g4", "g7", "cardio"]);
  const ymd = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  const parse = s => { const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); };
  const addDays = (s,n) => { const d=parse(s); d.setDate(d.getDate()+n); return ymd(d); };
  const mondayOf = s => addDays(s, -((parse(s).getDay()+6)%7));
  const daysIn = (y,m) => new Date(y,m+1,0).getDate();
  const daysBetween = (a,b) => Math.round((parse(b)-parse(a))/86400000);

  // A trained day has at least one done activity that is real training (no contrast, no rest).
  const trained = r => !!(r && r.acts && r.acts.some(a => a.done && TRAIN.has(a.k)));

  function monthTrained(days, y, m, upTo){
    const last = Math.min(upTo || daysIn(y,m), daysIn(y,m)); let n = 0;
    for(let d=1; d<=last; d++) if(trained(days[ymd(new Date(y,m,d))])) n++;
    return n;
  }
  // Current month is compared at the same date, otherwise early in the month it always looks worse.
  function compareMonth(days, y, m, today){
    const t = parse(today), sameDate = t.getFullYear()===y && t.getMonth()===m;
    const py = m===0 ? y-1 : y, pm = m===0 ? 11 : m-1, upTo = sameDate ? t.getDate() : 0;
    const cur = monthTrained(days, y, m, upTo), prev = monthTrained(days, py, pm, upTo);
    return { cur, prev, diff: cur-prev, sameDate };
  }
  function weekCount(days, monday){ let n = 0; for(let i=0; i<7; i++) if(trained(days[addDays(monday,i)])) n++; return n; }
  // Weeks belong to the month of their Sunday. The week in progress counts only once it succeeded.
  function monthWeeks(days, y, m, goal, today){
    const curMon = mondayOf(today); let ok = 0, total = 0;
    let sun = ymd(new Date(y,m,1)); sun = addDays(sun, (7-parse(sun).getDay())%7);
    for(; parse(sun).getMonth()===m; sun=addDays(sun,7)){
      const mon = addDays(sun,-6); if(mon > curMon) break;
      const good = weekCount(days,mon) >= goal;
      if(mon===curMon){ if(good){ ok++; total++; } }
      else { total++; if(good) ok++; }
    }
    const t = parse(today), isCur = t.getFullYear()===y && t.getMonth()===m;
    return { ok, total, current: isCur ? weekCount(days,curMon) : null };
  }
  function streak(days, goal, today){
    const curMon = mondayOf(today), dates = Object.keys(days).sort();
    if(!dates.length) return { cur: 0, best: 0 };
    const weeks = [];
    for(let mon=mondayOf(dates[0]); mon<=curMon; mon=addDays(mon,7)) weeks.push({ mon, ok: weekCount(days,mon) >= goal });
    const lastW = weeks[weeks.length-1];
    if(lastW && lastW.mon===curMon && !lastW.ok) weeks.pop();
    let run = 0, best = 0;
    for(const w of weeks){ run = w.ok ? run+1 : 0; best = Math.max(best, run); }
    return { cur: run, best };
  }
  function lastWeeks(days, goal, today, count=12){
    const curMon = mondayOf(today), out = [];
    for(let i=count-1; i>=0; i--){ const mon = addDays(curMon,-7*i), n = weekCount(days,mon); out.push({ mon, n, ok: n>=goal, current: i===0 }); }
    return out;
  }
  function mix(days, y, m){
    const c = { res:0, muay:0, cardio:0, contrast:0, g2:0, g4:0, g7:0 };
    for(let d=1; d<=daysIn(y,m); d++){
      const r = days[ymd(new Date(y,m,d))]; if(!r || !r.acts) continue;
      r.acts.forEach(a => { if(!a.done) return;
        if(a.k==="g2"||a.k==="g4"||a.k==="g7"){ c.res++; c[a.k]++; }
        else if(a.k in c) c[a.k]++; });
    }
    return c;
  }
  return { trained, monthTrained, compareMonth, weekCount, monthWeeks, streak, lastWeeks, mix, mondayOf, addDays, daysBetween };
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/`
Expected: PASS, 9 test.

---

### Task 2: Calcoli dei carichi

**Files:**
- Modify: `stats.js` (dentro `StatsCalc`, prima del `return`)
- Test: `tests/stats.test.js` (aggiunta in fondo)

**Interfaces:**
- Consumes: `daysBetween` da Task 1.
- Produces su `StatsCalc`:
  - `sessions(days, id) -> [{d, kg}]` ordinate per data, solo `kg != null`
  - `countSessions(days, id) -> number` (giorni con `ex[id]`, anche senza peso)
  - `loadsUp(days, y, m, ids) -> number`
  - `progress(sessions, today) -> null | {first, last, diff, pct, weeks, lastDate, count, stuck}` (`stuck` = settimane o `null`)
  - `lastSessionId(days, ids) -> string | null`

- [ ] **Step 1: Write the failing test**

Append to `tests/stats.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL, `C.sessions is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `stats.js`, insert before `return { trained, ...`:

```js
  // A session of an exercise = a day where it was ticked (Fatto or a set) with a logged weight.
  function sessions(days, id){
    return Object.keys(days).sort()
      .filter(d => { const x = days[d].ex && days[d].ex[id]; return x && x.kg != null; })
      .map(d => ({ d, kg: days[d].ex[id].kg }));
  }
  const countSessions = (days, id) => Object.keys(days).filter(d => days[d].ex && days[d].ex[id]).length;
  // Exercises whose last session of the month is heavier than the last session before the month
  // (or than the first session of the month when there is nothing before).
  function loadsUp(days, y, m, ids){
    const from = ymd(new Date(y,m,1)), to = ymd(new Date(y,m,daysIn(y,m))); let n = 0;
    ids.forEach(id => {
      const s = sessions(days,id), inM = s.filter(x => x.d>=from && x.d<=to); if(!inM.length) return;
      const before = s.filter(x => x.d<from), ref = before.length ? before[before.length-1].kg : inM[0].kg;
      if(inM[inM.length-1].kg > ref) n++;
    });
    return n;
  }
  // "Stuck" = at least 2 sessions at the current weight, the first of them 4+ weeks ago.
  function progress(s, today){
    if(!s.length) return null;
    const first = s[0], last = s[s.length-1];
    let i = s.length-1; while(i>0 && s[i-1].kg===last.kg) i--;
    const since = daysBetween(s[i].d, today);
    return { first: first.kg, last: last.kg, diff: last.kg-first.kg,
      pct: first.kg ? (last.kg-first.kg)/first.kg*100 : 0,
      weeks: Math.floor(daysBetween(first.d,last.d)/7), lastDate: last.d, count: s.length,
      stuck: s.length-i >= 2 && since >= 28 ? Math.floor(since/7) : null };
  }
  function lastSessionId(days, ids){
    let best = null, bestD = "";
    ids.forEach(id => { const s = sessions(days,id); if(s.length && s[s.length-1].d > bestD){ bestD = s[s.length-1].d; best = id; } });
    return best;
  }
```

and change the `return` to:

```js
  return { trained, monthTrained, compareMonth, weekCount, monthWeeks, streak, lastWeeks, mix,
    sessions, countSessions, loadsUp, progress, lastSessionId, mondayOf, addDays, daysBetween };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/`
Expected: PASS, 13 test.

---

### Task 3: Vista Statistiche con il riepilogo

**Files:**
- Modify: `stats.js` (in fondo)
- Modify: `index.html` (nav viste, sezione, `render()`, `playAnim`, click viste, import, CSS, script tag)
- Modify: `sw.js`

**Interfaces:**
- Consumes: `StatsCalc` (Task 1-2); globali di `index.html`: `S`, `DAYS`, `ALL`, `fmt`, `fmtDate`, `today`, `render`, `persist`, `OPEN`.
- Produces: `window.renderStats(el)`; stato `stMonth` (Date, primo del mese), `stEx` (id esercizio); attributi `data-sm` (mese ±1) e `data-goal` (obiettivo ±1); select `#st-ex`. Le funzioni `costanza()`, `mixBlock()`, `loadBlock()` vengono riempite nei Task 4-5 e qui restituiscono `""`.

- [ ] **Step 1: Append the browser part to `stats.js`**

```js
if(typeof document !== "undefined"){
  const C = StatsCalc;
  let stMonth = (()=>{ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
  let stEx = null;
  const goal = () => S.goal || 5;
  const sign = n => n>0 ? "+"+fmt(n) : fmt(n);

  function kpis(){
    const y=stMonth.getFullYear(), m=stMonth.getMonth(), t=today();
    const cm=C.compareMonth(S.days,y,m,t), mw=C.monthWeeks(S.days,y,m,goal(),t), st=C.streak(S.days,goal(),t);
    const up=C.loadsUp(S.days,y,m,Object.keys(ALL).filter(id=>ALL[id].kg!=null));
    const prevName=new Date(y,m-1,1).toLocaleDateString("it-IT",{month:"long"});
    return `<div class="kpis">
      <div class="kpi"><b class="num">${cm.cur}</b><small>Giorni allenati</small><em class="${cm.diff>0?"up":cm.diff<0?"down":""}">${sign(cm.diff)} vs ${prevName}${cm.sameDate?" alla stessa data":""}</em></div>
      <div class="kpi"><b class="num">${mw.ok}<span> su ${mw.total}</span></b><small>Settimane riuscite</small>${mw.current!=null?`<em>in corso: ${mw.current}/${goal()}</em>`:""}</div>
      <div class="kpi"><b class="num">${st.cur}</b><small>Settimane di fila</small><em>record: ${st.best}</em></div>
      <div class="kpi"><b class="num">${up}</b><small>Carichi aumentati</small></div>
    </div>`;
  }
  function costanza(){ return ""; }
  function mixBlock(){ return ""; }
  function loadBlock(){ return ""; }

  window.renderStats = function(el){
    const mName=stMonth.toLocaleDateString("it-IT",{month:"long",year:"numeric"});
    const monShort=stMonth.toLocaleDateString("it-IT",{month:"long"});
    const panel=(k,title,sub,body)=>`<details class="panel" data-k="${k}"${OPEN.has(k)?" open":""}><summary><h3>${title}</h3><span>${sub}</span></summary><div class="panel-body">${body}</div></details>`;
    el.innerHTML = `
      <div class="weeknav"><button class="navb" data-sm="-1" aria-label="Mese precedente">‹</button><span>${mName}</span><button class="navb" data-sm="1" aria-label="Mese successivo">›</button></div>
      ${kpis()}
      <div class="stack">
        ${panel("st-cost","Costanza","ultime 12 settimane",costanza())}
        ${panel("st-mix","Mix attività",monShort,mixBlock())}
        ${panel("st-load","Progressione carichi",Object.keys(ALL).length+" esercizi",loadBlock())}
      </div>`;
  };

  document.addEventListener("click", ev=>{
    const sm=ev.target.closest("[data-sm]"); if(sm){ stMonth=new Date(stMonth.getFullYear(), stMonth.getMonth()+ +sm.dataset.sm, 1); render(); return; }
    const g=ev.target.closest("[data-goal]"); if(g){ S.goal=Math.min(7,Math.max(1,goal()+ +g.dataset.goal)); persist(); render(); }
  });
  document.addEventListener("change", ev=>{ if(ev.target.id==="st-ex"){ stEx=ev.target.value; render(); } });
}
```

- [ ] **Step 2: Wire it into `index.html`**

Nav viste, dopo il bottone Storico:

```html
    <button role="tab" data-view="stats" aria-selected="false">Statistiche</button>
```

CSS: in `.views{...}` sostituire `grid-template-columns:1fr 1fr` con `grid-template-columns:repeat(3,1fr)`; in `.views button{...}` sostituire `font-size:18px` con `font-size:17px`.

Dopo `<section id="hist" hidden></section>`:

```html
  <section id="stats" hidden></section>
```

In `render(focusId)`, sostituire la riga `view==="plan" ? renderPlan(focusId) : renderHist();` con:

```js
  document.getElementById("stats").hidden = view!=="stats";
  view==="plan" ? renderPlan(focusId) : view==="hist" ? renderHist() : renderStats(document.getElementById("stats"));
```

In `playAnim(a)`, aggiungere prima della chiusura:

```js
  else if(a==="stats") stagger(document.querySelectorAll("#stats .weeknav, #stats .kpi, #stats .panel"));
```

Nel click delle viste, sostituire `anim=view==="hist"?"hist":"day";` con:

```js
anim=view==="hist"?"hist":view==="stats"?"stats":"day";
```

Nell'import, sostituire `S={w:d.w,log:d.log,days:migrateDays(...)}` aggiungendo `goal:d.goal`:

```js
    S={w:d.w,log:d.log,days:migrateDays((d.days&&typeof d.days==="object")?d.days:{}),goal:d.goal};
```

Subito dopo la chiusura `</script>` dello script principale:

```html
<script src="stats.js"></script>
```

CSS (prima di `.endnote{`):

```css
/* stats: monthly summary tiles, then collapsible blocks with hand-drawn SVG charts */
.kpis{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:4px 0 14px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:10px 12px;min-width:0}
.kpi b{display:block;font-family:var(--f-display);font-size:34px;font-weight:800;line-height:1}
.kpi b span{font-size:18px;color:var(--muted);font-weight:700}
.kpi small{display:block;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-top:3px}
.kpi em{display:block;font-style:normal;font-size:12px;color:var(--muted);margin-top:2px}
.kpi em.up{color:var(--green)} .kpi em.down{color:var(--red)}
```

- [ ] **Step 3: Update `sw.js`**

Nella costante `CORE` aggiungere `"stats.js"` dopo `"manifest.webmanifest"` e portare `VERSION` a `"v8"`.

- [ ] **Step 4: Verify in the browser**

Avviare `python3 -m http.server 8765` nella cartella del progetto, poi con Playwright (viewport iPhone 13): caricare dati di prova in `localStorage["scheda-huberman-v1"]`, cliccare `[data-view="stats"]`, verificare che `#stats` sia visibile, che ci siano 4 `.kpi` con valori coerenti con i dati di prova, che `[data-sm="-1"]` cambi il mese nel titolo, e che la console non abbia errori. Poi `node --test tests/` deve restare PASS.

---

### Task 4: Blocchi Costanza e Mix attività

**Files:**
- Modify: `stats.js` (sostituire `costanza()` e `mixBlock()`)
- Modify: `index.html` (CSS)

**Interfaces:**
- Consumes: `C.lastWeeks`, `C.mix`, `goal()`, `stMonth`, `fmtDate`.
- Produces: bottoni `data-goal="-1"` / `data-goal="1"` (già gestiti in Task 3).

- [ ] **Step 1: Replace `costanza()`**

```js
  function costanza(){
    const W=300, H=120, B=16, T=14, weeks=C.lastWeeks(S.days,goal(),today()), bw=W/weeks.length;
    const y=n=>T+(1-n/7)*(H-T-B);
    const bars=weeks.map((w,i)=>{ const x=i*bw+3, top=y(w.n), cls=w.ok?"ok":w.current?"now":"miss";
      return `<rect class="st-bar ${cls}" x="${x}" y="${top}" width="${bw-6}" height="${Math.max(H-B-top,0)}" rx="3"></rect>`
        +(w.n?`<text class="st-t" x="${x+(bw-6)/2}" y="${top-3}" text-anchor="middle">${w.n}</text>`:"");
    }).join("");
    const gy=y(goal());
    return `<svg class="st-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Giorni allenati nelle ultime 12 settimane, obiettivo ${goal()}">
        <defs><pattern id="st-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" style="fill:var(--green);opacity:.35"></rect><rect width="3" height="6" style="fill:var(--green)"></rect></pattern></defs>
        <line class="st-axis" x1="0" x2="${W}" y1="${H-B}" y2="${H-B}"></line>
        ${bars}
        <line class="st-goal" x1="0" x2="${W}" y1="${gy}" y2="${gy}"></line>
        <text class="st-t goal" x="${W}" y="${gy-3}" text-anchor="end">obiettivo ${goal()}</text>
        <text class="st-t" x="0" y="${H-3}">${fmtDate(weeks[0].mon)}</text>
        <text class="st-t" x="${W}" y="${H-3}" text-anchor="end">settimana in corso</text>
      </svg>
      <div class="stp"><span>Obiettivo settimanale</span><span class="stp-c"><button class="navb" data-goal="-1" aria-label="Riduci obiettivo">−</button><b class="num">${goal()}</b> giorni<button class="navb" data-goal="1" aria-label="Aumenta obiettivo">+</button></span></div>`;
  }
```

- [ ] **Step 2: Replace `mixBlock()`**

```js
  const KINDS=[["res","Resistance"],["muay","Muay Thai"],["cardio","Cardio"],["contrast","Contrasto"]];
  function mixBlock(){
    const y=stMonth.getFullYear(), m=stMonth.getMonth(), c=C.mix(S.days,y,m), tot=KINDS.reduce((s,[k])=>s+c[k],0);
    const now = tot
      ? `<div class="st-stack">${KINDS.filter(([k])=>c[k]).map(([k])=>`<span class="c-${k}" style="flex:${c[k]}"></span>`).join("")}</div>
         <div class="st-leg">${KINDS.map(([k,l])=>`<span><i class="c-${k}"></i>${l} ${c[k]}</span>`).join("")}</div>
         <p class="st-note">Resistance: Gambe ${c.g2} · Torso ${c.g4} · Braccia ${c.g7}</p>`
      : `<p class="st-note">Nessuna attività in questo mese.</p>`;
    const months=[5,4,3,2,1,0].map(i=>{ const d=new Date(y,m-i,1); return { d, c:C.mix(S.days,d.getFullYear(),d.getMonth()) }; });
    const max=Math.max(1,...months.map(o=>KINDS.reduce((s,[k])=>s+o.c[k],0)));
    const cols=months.map(o=>{ const t=KINDS.reduce((s,[k])=>s+o.c[k],0);
      return `<div class="st-col"><div class="st-colbar" style="height:${t/max*100}%">${KINDS.filter(([k])=>o.c[k]).map(([k])=>`<span class="c-${k}" style="flex:${o.c[k]}"></span>`).join("")}</div><small>${o.d.toLocaleDateString("it-IT",{month:"short"}).replace(".","")}</small></div>`; }).join("");
    return `${now}<p class="st-note">Ultimi 6 mesi</p><div class="st-cols">${cols}</div>`;
  }
```

- [ ] **Step 3: Add CSS to `index.html`** (dopo il blocco CSS del Task 3)

```css
.st-svg{width:100%;height:auto;display:block;overflow:visible;margin-top:6px}
.st-bar.ok{fill:var(--green)} .st-bar.miss{fill:var(--line)} .st-bar.now{fill:url(#st-hatch)}
.st-axis{stroke:var(--line)} .st-goal{stroke:var(--red);stroke-width:1.5;stroke-dasharray:4 3}
.st-t{font-family:var(--f-body);font-size:10px;fill:var(--muted)} .st-t.goal{fill:var(--red);font-weight:600}
.stp{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:8px 10px;margin-top:12px;font-size:14px}
.stp-c{display:flex;align-items:center;gap:8px}
.stp-c b{font-family:var(--f-display);font-size:24px;font-weight:800}
.c-res{background:var(--red)} .c-muay{background:var(--blue)} .c-cardio{background:var(--yellow)} .c-contrast{background:var(--muted)}
.st-stack{display:flex;height:18px;border-radius:9px;overflow:hidden;gap:2px;margin-top:4px}
.st-leg{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:13px;color:var(--muted);margin-top:8px}
.st-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.st-note{font-size:13px;color:var(--muted);margin:10px 0 0}
.st-cols{display:flex;gap:8px;height:90px;margin-top:6px}
.st-col{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:stretch;gap:3px;min-width:0}
.st-colbar{display:flex;flex-direction:column-reverse;gap:1px;border-radius:4px;overflow:hidden;min-height:2px;background:var(--line)}
.st-col small{text-align:center;font-size:11px;color:var(--muted);text-transform:uppercase}
```

- [ ] **Step 4: Verify in the browser**

Con dati di prova su almeno 6 mesi: aprire Statistiche, aprire "Costanza" (12 `rect.st-bar`, linea obiettivo presente), toccare `[data-goal="1"]` e verificare che `S.goal` in `localStorage` diventi 6 e la linea si sposti; aprire "Mix attività" (barra, legenda con i numeri attesi, 6 colonne). Tema scuro: screenshot leggibile. `node --test tests/` PASS.

---

### Task 5: Blocco Progressione carichi

**Files:**
- Modify: `stats.js` (sostituire `loadBlock()`)
- Modify: `index.html` (CSS)

**Interfaces:**
- Consumes: `C.sessions`, `C.countSessions`, `C.progress`, `C.lastSessionId`, `stEx`, `DAYS`, `ALL`, `fmt`, `fmtDate`.
- Produces: `<select id="st-ex">` (gestito dal listener `change` del Task 3).

- [ ] **Step 1: Replace `loadBlock()`**

```js
  function lineSvg(s){
    const W=300, H=150, L=36, R=8, T=12, B=22, t0=+new Date(s[0].d), t1=+new Date(s[s.length-1].d), span=(t1-t0)||1;
    const kgs=s.map(x=>x.kg), lo0=Math.min(...kgs), hi0=Math.max(...kgs), pad=(hi0-lo0||hi0*0.1||1)*0.15, lo=lo0-pad, hi=hi0+pad;
    const X=x=>s.length===1 ? (L+W-R)/2 : L+(+new Date(x.d)-t0)/span*(W-L-R);
    const Y=kg=>T+(hi-kg)/(hi-lo)*(H-T-B);
    const pts=s.map(x=>`${X(x).toFixed(1)},${Y(x.kg).toFixed(1)}`).join(" ");
    return `<svg class="st-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Peso per sessione">
      <line class="st-axis" x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}"></line>
      <line class="st-grid" x1="${L}" x2="${W-R}" y1="${Y(hi0)}" y2="${Y(hi0)}"></line>
      ${lo0!==hi0?`<line class="st-grid" x1="${L}" x2="${W-R}" y1="${Y(lo0)}" y2="${Y(lo0)}"></line><text class="st-t" x="${L-6}" y="${Y(lo0)+3}" text-anchor="end">${fmt(lo0)}</text>`:""}
      <text class="st-t" x="${L-6}" y="${Y(hi0)+3}" text-anchor="end">${fmt(hi0)}</text>
      ${s.length>1?`<polyline class="st-line" points="${pts}"></polyline>`:""}
      ${s.map(x=>`<circle class="st-dot" cx="${X(x).toFixed(1)}" cy="${Y(x.kg).toFixed(1)}" r="3.5"><title>${fmtDate(x.d)}: ${fmt(x.kg)} kg</title></circle>`).join("")}
      <text class="st-t" x="${L}" y="${H-5}">${fmtDate(s[0].d)}</text>
      ${s.length>1?`<text class="st-t" x="${W-R}" y="${H-5}" text-anchor="end">${fmtDate(s[s.length-1].d)}</text>`:""}
    </svg>`;
  }
  function loadBlock(){
    const ids=Object.keys(ALL);
    if(!stEx || !ALL[stEx]) stEx = C.lastSessionId(S.days, ids) || DAYS[0].ex[0].id;
    const count=e=>e.kg==null ? C.countSessions(S.days,e.id) : C.sessions(S.days,e.id).length;
    const sel=`<select id="st-ex" class="st-sel" aria-label="Esercizio">${DAYS.map(d=>`<optgroup label="${d.tab}">${d.ex.map(e=>`<option value="${e.id}"${e.id===stEx?" selected":""}>${e.name}${count(e)?"":" (nessuna sessione)"}</option>`).join("")}</optgroup>`).join("")}</select>`;
    const e=ALL[stEx], unit=/^(per |totale)/.test(e.unit)?" "+e.unit:"";
    if(e.kg==null){ const n=C.countSessions(S.days,e.id);
      return sel+`<p class="st-note">${n?`${n} session${n===1?"e":"i"}. Esercizio a corpo libero: nessun peso da mostrare.`:"Nessuna sessione registrata."}</p>`; }
    const s=C.sessions(S.days,e.id);
    if(!s.length) return sel+`<p class="st-note">Nessuna sessione registrata.</p>`;
    const p=C.progress(s,today());
    const sum = p.count===1
      ? `Una sola sessione: ${fmt(p.last)} kg${unit}, ${fmtDate(p.lastDate)}. Servono almeno 2 sessioni per vedere l'andamento.`
      : `${p.diff===0?"Peso invariato":`${sign(p.diff)} kg${unit} (${p.diff>0?"+":""}${Math.round(p.pct)}%)`} ${p.weeks===0?"nella stessa settimana":`in ${p.weeks} settiman${p.weeks===1?"a":"e"}`} · ${p.count} sessioni · ultima ${fmtDate(p.lastDate)}`;
    return sel+lineSvg(s)+`<p class="st-note">${sum}</p>`
      +(p.stuck?`<p class="st-warn">Fermo a ${fmt(p.last)} kg da ${p.stuck} settimane: valuta di alzare il peso.</p>`:"");
  }
```

- [ ] **Step 2: Add CSS to `index.html`** (dopo il CSS del Task 4)

```css
.st-sel{width:100%;height:48px;border:1.5px solid var(--ink);border-radius:12px;background:var(--surface);color:var(--ink);font-family:var(--f-display);font-size:19px;font-weight:700;padding:0 12px}
.st-line{fill:none;stroke:var(--green);stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}
.st-dot{fill:var(--green);stroke:var(--surface);stroke-width:1.5}
.st-grid{stroke:var(--line);stroke-dasharray:2 3}
.st-warn{font-size:13px;font-weight:600;color:var(--yellow);margin:6px 0 0}
```

- [ ] **Step 3: Verify in the browser**

Con dati di prova (leg press con 5 sessioni, calf raise con 1, lat pulldown fermo da 5 settimane, leg raise a corpo libero con 2): aprire "Progressione carichi"; il select parte sull'esercizio con la sessione più recente; per leg press 5 `circle.st-dot` e una `polyline`; selezionare `calf` (via `page.selectOption('#st-ex','calf')`): un punto e la scritta "Servono almeno 2 sessioni"; `latpd`: `.st-warn` presente; `hlr`: "2 sessioni. Esercizio a corpo libero"; un esercizio senza dati compare con "(nessuna sessione)". Il blocco resta aperto dopo il cambio esercizio. Tema scuro leggibile, nessun errore in console. `node --test tests/` PASS.

---

### Task 6: Verifica finale e documentazione

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

Nella sezione "Struttura attuale" aggiungere le righe:

```
stats.js                 vista Statistiche: StatsCalc (calcoli puri) + disegno SVG. Caricato dopo lo script principale
tests/stats.test.js      test dei calcoli: node --test tests/
```

Nella sezione "Modello dati" aggiungere:

```
- `S.goal`: obiettivo di giorni allenati a settimana (1-7, predefinito 5), usato dalle Statistiche. Giorno allenato = attività realizzata tra muay, g2, g4, g7, cardio. Le statistiche dei carichi usano solo le sessioni (`days[d].ex[id].kg`), non `S.log`.
- Progetto e piano delle Statistiche: `docs/superpowers/specs/2026-10-07-pegasus-statistiche-design.md`, `docs/superpowers/plans/2026-10-07-pegasus-statistiche.md`.
```

- [ ] **Step 2: Full regression in the browser**

Playwright iPhone 13 su `http://localhost:8765/`: le tre viste si aprono; nella Scheda aggiungere un'attività, segnarla realizzata, spuntare una serie (nessuna regressione); Storico mostra il giorno; Statistiche si aggiorna (giorni allenati +1). Import di un backup v2 senza `goal`: le Statistiche usano 5. Nessun errore in console, nessuno scroll orizzontale su viewport 375 px.

- [ ] **Step 3: Run tests**

Run: `node --test tests/`
Expected: PASS, 13 test.
