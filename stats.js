// Statistiche di Pegasus.
// StatsCalc: calcoli puri sui dati (nessun DOM), testati in tests/stats.test.js.
// Sotto, protetta da `typeof document`, la vista che usa le globali di index.html.
var StatsCalc = (() => {
  const TRAIN = new Set(["muay", "g2", "g4", "g7", "run", "swim", "frl"]);   // contrast, massage, rest are recovery
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
    // families (res, cardio) plus their parts (g2/g4/g7, run/swim)
    const c = { res:0, muay:0, cardio:0, contrast:0, massage:0, frl:0, g2:0, g4:0, g7:0, run:0, swim:0 };
    for(let d=1; d<=daysIn(y,m); d++){
      const r = days[ymd(new Date(y,m,d))]; if(!r || !r.acts) continue;
      r.acts.forEach(a => { if(!a.done) return;
        if(a.k==="g2"||a.k==="g4"||a.k==="g7"){ c.res++; c[a.k]++; }
        else if(a.k==="run"||a.k==="swim"){ c.cardio++; c[a.k]++; }
        else if(a.k==="muay"||a.k==="frl"||a.k==="contrast"||a.k==="massage") c[a.k]++; });
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

if(typeof document !== "undefined"){
  const C = StatsCalc;
  const firstOfMonth = () => { const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };
  let stMonth = firstOfMonth();
  window.resetStatsMonth = () => { stMonth = firstOfMonth(); };
  let stEx = null;
  const goal = () => S.goal || 5;
  const ymdLocal = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
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
  const monShort = d => d.toLocaleDateString("it-IT",{month:"short"}).replace(".","");
  // "20-26 lug" or "27 lug - 2 ago" when the week crosses a month
  function weekRange(mon){
    const a=parse(mon), b=parse(C.addDays(mon,6));
    return a.getMonth()===b.getMonth() ? `${a.getDate()}-${b.getDate()} ${monShort(b)}` : `${a.getDate()} ${monShort(a)} - ${b.getDate()} ${monShort(b)}`;
  }
  function costanza(){
    const W=300, H=136, B=30, T=14, weeks=C.lastWeeks(S.days,goal(),today()), bw=W/weeks.length, base=H-B;
    const y=n=>T+(1-n/7)*(base-T), gy=y(goal()), LW=62; // LW: width reserved to the goal label at the left edge
    const bars=weeks.map((w,i)=>{ const x=i*bw+3, top=y(w.n), cls=w.current?"now":w.ok?"ok":"miss";
      return `<rect class="st-bar ${cls}" x="${x}" y="${top}" width="${bw-6}" height="${Math.max(base-top,0)}" rx="3"></rect>`
        +(w.n && !(x+(bw-6)/2-5<LW && Math.abs(top-gy)<12)?`<text class="st-t" x="${x+(bw-6)/2}" y="${top-3}" text-anchor="middle">${w.n}</text>`:"");
    }).join("");
    // x axis: day of each week's Monday, month name under the first week of each month
    const axis=weeks.map((w,i)=>{ const d=parse(w.mon), cx=i*bw+bw/2, prev=i?parse(weeks[i-1].mon):null;
      return `<text class="st-t" x="${cx}" y="${base+12}" text-anchor="middle">${d.getDate()}</text>`
        +(!prev||prev.getMonth()!==d.getMonth()?`<text class="st-t mon" x="${cx}" y="${base+25}" text-anchor="middle">${monShort(d)}</text>`:""); }).join("");
    // full-height transparent columns on top: easy to hover or tap even when a bar is short
    const hits=weeks.map((w,i)=>`<rect class="st-hit" x="${i*bw}" y="0" width="${bw}" height="${base}" data-tip="${w.current?`Settimana in corso (${weekRange(w.mon)}) · ${w.n} su ${goal()} finora`:`Settimana ${weekRange(w.mon)} · ${w.n} giorn${w.n===1?"o":"i"} allenat${w.n===1?"o":"i"} su ${goal()}`}"></rect>`).join("");
    return `<svg class="st-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Giorni allenati nelle ultime 12 settimane, obiettivo ${goal()}">
        <defs><pattern id="st-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" style="fill:var(--green);opacity:.35"></rect><rect width="3" height="6" style="fill:var(--green)"></rect></pattern></defs>
        <line class="st-axis" x1="0" x2="${W}" y1="${base}" y2="${base}"></line>
        ${bars}
        <line class="st-goal" x1="0" x2="${W}" y1="${gy}" y2="${gy}"></line>
        <text class="st-t goal" x="0" y="${gy-3}" text-anchor="start">obiettivo ${goal()}</text>
        ${axis}
        ${hits}
      </svg>
      <div class="stp"><span>Obiettivo settimanale</span><span class="stp-c"><button class="navb" data-goal="-1" aria-label="Riduci obiettivo">−</button><b class="num">${goal()}</b> giorni<button class="navb" data-goal="1" aria-label="Aumenta obiettivo">+</button></span></div>`;
  }
  const monLong = d => d.toLocaleDateString("it-IT",{month:"long"});
  const cap = t => t.charAt(0).toUpperCase()+t.slice(1);
  const KINDS=[["res","Resistance"],["muay","Muay Thai"],["cardio","Cardio"],["frl","Freeletics"],["contrast","Contrasto"],["massage","Massaggio"]];
  function mixBlock(){
    const y=stMonth.getFullYear(), m=stMonth.getMonth(), c=C.mix(S.days,y,m), tot=KINDS.reduce((s,[k])=>s+c[k],0);
    const now = tot
      ? `<div class="st-stack">${KINDS.filter(([k])=>c[k]).map(([k,l])=>`<span class="c-${k}" style="flex:${c[k]}" data-tip="${cap(monLong(stMonth))} · ${l} ${c[k]}"></span>`).join("")}</div>
         <div class="st-leg">${KINDS.map(([k,l])=>`<span><i class="c-${k}"></i>${l} ${c[k]}</span>`).join("")}</div>
         <p class="st-note">Resistance: Gambe ${c.g2} · Torso ${c.g4} · Braccia ${c.g7}<br>Cardio: Corsa ${c.run} · Nuoto ${c.swim}</p>`
      : `<p class="st-note">Nessuna attività in questo mese.</p>`;
    const months=[5,4,3,2,1,0].map(i=>{ const d=new Date(y,m-i,1); return { d, c:C.mix(S.days,d.getFullYear(),d.getMonth()) }; });
    const max=Math.max(1,...months.map(o=>KINDS.reduce((s,[k])=>s+o.c[k],0)));
    const cols=months.map(o=>{ const t=KINDS.reduce((s,[k])=>s+o.c[k],0), name=cap(monLong(o.d));
      // the track carries the whole month, used when a coloured band is too thin to tap
      const sum = t ? `${name} · `+KINDS.filter(([k])=>o.c[k]).map(([k,l])=>`${l} ${o.c[k]}`).join(", ") : `${name} · nessuna attività`;
      return `<div class="st-col"><div class="st-track" data-tip="${sum}"><div class="st-colbar" style="height:${t/max*100}%">${KINDS.filter(([k])=>o.c[k]).map(([k,l])=>`<span class="c-${k}" style="flex:${o.c[k]}" data-tip="${name} · ${l} ${o.c[k]}"></span>`).join("")}</div></div><small>${monShort(o.d)}</small></div>`; }).join("");
    return `${now}<p class="st-note">Ultimi 6 mesi</p><div class="st-cols">${cols}</div>`;
  }
  function lineSvg(s){
    const W=300, H=150, L=36, R=8, T=12, B=24, t0=+parse(s[0].d), t1=+parse(s[s.length-1].d), span=(t1-t0)||1;
    const kgs=s.map(x=>x.kg), lo0=Math.min(...kgs), hi0=Math.max(...kgs), pad=(hi0-lo0||hi0*0.1||1)*0.15, lo=lo0-pad, hi=hi0+pad;
    const X=d=>s.length===1 ? (L+W-R)/2 : L+(+parse(d)-t0)/span*(W-L-R);
    const Y=kg=>T+(hi-kg)/(hi-lo)*(H-T-B);
    const pts=s.map(x=>`${X(x.d).toFixed(1)},${Y(x.kg).toFixed(1)}`).join(" ");
    // ticks: first day of each month in range, or Mondays when the history is shorter than ~2 months
    const ticks=[], monthly=span>56*864e5;
    if(s.length>1){
      if(monthly){ const d=parse(s[0].d); d.setDate(1); d.setMonth(d.getMonth()+1);
        for(; +d<=t1; d.setMonth(d.getMonth()+1)) ticks.push({ d:new Date(d), lbl: monShort(d)+(d.getMonth()===0?" "+String(d.getFullYear()).slice(2):"") }); }
      else { let mon=C.mondayOf(s[0].d); if(+parse(mon)<t0) mon=C.addDays(mon,7);
        for(; +parse(mon)<=t1; mon=C.addDays(mon,7)) ticks.push({ d:parse(mon), lbl: fmtDate(mon) }); }
    }
    const every=Math.max(1,Math.ceil(ticks.length*34/(W-L-R)));   // keep labels at least ~34px apart
    const axis=ticks.map((t,i)=>{ const x=X(ymdLocal(t.d)).toFixed(1);
      return `<line class="st-tick" x1="${x}" x2="${x}" y1="${H-B}" y2="${H-B+4}"></line>`+(i%every===0?`<text class="st-t" x="${x}" y="${H-B+15}" text-anchor="middle">${t.lbl}</text>`:""); }).join("");
    // one vertical band per session, split halfway between neighbours: the nearest point always wins
    const xs=s.map(x=>X(x.d));
    const hits=s.map((x,i)=>{ const a=i?(xs[i-1]+xs[i])/2:L, b=i<s.length-1?(xs[i]+xs[i+1])/2:W-R;
      return `<rect class="st-hit" data-dot="${i}" x="${a.toFixed(1)}" y="${T}" width="${Math.max(b-a,1).toFixed(1)}" height="${H-B-T}" data-tip="${fmtDate(x.d)} · ${fmt(x.kg)} kg"></rect>`; }).join("");
    return `<svg class="st-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Peso per sessione">
      <line class="st-axis" x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}"></line>
      <line class="st-grid" x1="${L}" x2="${W-R}" y1="${Y(hi0)}" y2="${Y(hi0)}"></line>
      ${lo0!==hi0?`<line class="st-grid" x1="${L}" x2="${W-R}" y1="${Y(lo0)}" y2="${Y(lo0)}"></line><text class="st-t" x="${L-6}" y="${Y(lo0)+3}" text-anchor="end">${fmt(lo0)}</text>`:""}
      <text class="st-t" x="${L-6}" y="${Y(hi0)+3}" text-anchor="end">${fmt(hi0)}</text>
      ${axis}
      ${s.length>1?`<polyline class="st-line" points="${pts}"></polyline>`:`<text class="st-t" x="${X(s[0].d)}" y="${H-B+15}" text-anchor="middle">${fmtDate(s[0].d)}</text>`}
      ${s.map((x,i)=>`<circle class="st-dot" data-i="${i}" cx="${X(x.d).toFixed(1)}" cy="${Y(x.kg).toFixed(1)}" r="3.5"></circle>`).join("")}
      ${hits}
    </svg>`;
  }
  function loadBlock(){
    const ids=Object.keys(ALL);
    if(!stEx || !ALL[stEx]) stEx = C.lastSessionId(S.days, ids) || DAYS[0].ex[0].id;
    const count=e=>e.kg==null ? C.countSessions(S.days,e.id) : C.sessions(S.days,e.id).length;
    const sel=`<select id="st-ex" class="st-sel" aria-label="Esercizio">${DAYS.map(d=>`<optgroup label="${d.tab}">${d.ex.concat((d.old||[]).filter(count)).map(e=>`<option value="${e.id}"${e.id===stEx?" selected":""}>${e.name}${count(e)?"":" (nessuna sessione)"}</option>`).join("")}</optgroup>`).join("")}</select>`;
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

  const tip=document.createElement("div"); tip.id="st-tip"; tip.setAttribute("role","status"); document.body.appendChild(tip);
  let tipEl=null, lastPointer="mouse";
  // a session band points at its dot: the label sits on the dot and the dot is highlighted
  const dotOf = el => el.dataset.dot!=null ? el.ownerSVGElement.querySelector(`.st-dot[data-i="${el.dataset.dot}"]`) : null;
  function hideTip(){ tip.classList.remove("on"); if(tipEl){ tipEl.classList.remove("tip-on"); const d=dotOf(tipEl); if(d) d.classList.remove("tip-on"); } tipEl=null; }
  function showTip(el){
    if(tipEl===el) return;
    hideTip();
    tipEl=el; el.classList.add("tip-on"); tip.textContent=el.dataset.tip; tip.classList.add("on");
    const dot=dotOf(el); if(dot) dot.classList.add("tip-on");
    const r=(dot||el).getBoundingClientRect(), w=tip.offsetWidth, h=tip.offsetHeight;
    let top=r.top-h-8; if(top<8) top=r.bottom+8;
    tip.style.left=Math.min(Math.max(8, r.left+r.width/2-w/2), innerWidth-w-8)+"px"; tip.style.top=top+"px";
  }
  function tipTarget(t){
    let el=t.closest&&t.closest("#stats [data-tip]"); if(!el) return null;
    if(lastPointer!=="mouse"){ const r=el.getBoundingClientRect(), up=el.parentElement&&el.parentElement.closest("[data-tip]");
      if(up && Math.min(r.width,r.height)<14) el=up; }
    return el;
  }
  document.addEventListener("pointerdown", ev=>{ lastPointer=ev.pointerType||"mouse"; }, true);
  document.addEventListener("pointerover", ev=>{ if(ev.pointerType!=="mouse") return; const el=tipTarget(ev.target); el ? showTip(el) : hideTip(); });
  document.addEventListener("click", ev=>{ if(lastPointer==="mouse") return; const el=tipTarget(ev.target); if(el && el!==tipEl) showTip(el); else hideTip(); });
  addEventListener("scroll", hideTip, {passive:true});

  window.renderStats = function(el){
    hideTip();
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
