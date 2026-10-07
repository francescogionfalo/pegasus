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
  return { trained, monthTrained, compareMonth, weekCount, monthWeeks, streak, lastWeeks, mix,
    sessions, countSessions, loadsUp, progress, lastSessionId, mondayOf, addDays, daysBetween };
})();
