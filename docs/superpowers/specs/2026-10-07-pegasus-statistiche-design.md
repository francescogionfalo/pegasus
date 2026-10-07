# Pegasus: pagina Statistiche

Data: 2026-10-07. Stato: approvato da Francesco (documento riletto).

## Obiettivo

Una terza vista, **Statistiche**, per vedere nel tempo l'evoluzione degli allenamenti: costanza, progressione dei carichi, mix di attività. Appena si entra, statistiche generali del mese.

Fuori dallo scopo: aderenza al protocollo Huberman (serie per gruppo, 3 resistance a settimana), volume (kg × ripetizioni) e forza stimata. Le ripetizioni non vengono registrate, quindi questi calcoli oggi non sono possibili.

## Dati disponibili (nessuna migrazione)

- `S.days[data] = { acts:[{k, done}], ex:{ id:{done, kg, sets:[bool]} } }`, `k` in `muay | g2 | g4 | g7 | cardio | contrast | rest`.
- `S.log[id] = [{d, from, to}]`: cambi di peso con +/−. Non usato dalle statistiche.
- Nuovo: `S.goal` (intero, predefinito 5), obiettivo di giorni allenati a settimana. Entra nel backup. Assente = 5. Nessun cambio di versione del backup: è un campo opzionale.

## Definizioni

- **Giorno allenato:** giorno con almeno un'attività `done` tra `muay`, `g2`, `g4`, `g7`, `cardio`. Contrasto e riposo non contano.
- **Settimana:** lunedì-domenica. Appartiene al mese in cui cade la sua domenica.
- **Settimana riuscita:** giorni allenati ≥ `S.goal`. La settimana in corso non è mai "fallita": conta come riuscita solo quando raggiunge l'obiettivo.
- **Sessione di un esercizio:** un giorno in cui `ex[id]` esiste con `kg != null` (segnato "Fatto" o con almeno una serie spuntata). Il valore del punto è `kg` di quel giorno.

## Interfaccia

Selettore in alto a tre schede: Scheda | Storico | Statistiche.

### Riepilogo (sempre visibile)

Navigazione mese con ‹ › (predefinito: mese corrente). Quattro riquadri in griglia 2×2:

1. **Giorni allenati** nel mese. Sotto: differenza con il mese precedente. Per il mese corrente il confronto è alla stessa data (dal giorno 1 al giorno di oggi del mese prima, limitato all'ultimo giorno di quel mese).
2. **Settimane riuscite** nel mese, "x su y", dove y sono le settimane concluse appartenenti al mese più quella in corso solo se già riuscita. Per il mese corrente, sotto: "in corso: n/goal".
3. **Serie attuale:** settimane consecutive riuscite fino a oggi (la settimana in corso conta solo se già riuscita; se non lo è, la serie parte dalla settimana precedente). Sotto: record di sempre. Non dipende dal mese scelto.
4. **Carichi aumentati** nel mese, calcolato sulle **sessioni** (stessa fonte del grafico, così i numeri sono sempre coerenti): per ogni esercizio con almeno una sessione nel mese, il riferimento è l'ultima sessione prima del mese (se non esiste, la prima sessione del mese). L'esercizio conta se il peso dell'ultima sessione del mese è maggiore del riferimento. `S.log` non viene usato nelle statistiche.

### Blocchi espandibili (chiusi all'apertura, stessa animazione degli esercizi)

**Costanza**
- Grafico a barre SVG delle ultime 12 settimane (la più recente è quella in corso): altezza = giorni allenati (0-7). Verde se riuscita, grigio se no, tratteggiata se in corso. Linea tratteggiata rossa all'altezza dell'obiettivo. Etichette: data del lunedì della prima settimana e "settimana in corso".
- Selettore "Obiettivo settimanale − n giorni +" (limiti 1-7), salva `S.goal` e ricalcola tutto.

**Mix attività**
- Barra orizzontale divisa per il mese scelto: Resistance (rosso), Muay Thai (blu), Cardio (giallo), Contrasto (grigio), solo attività `done`. Legenda con i numeri.
- Riga "Resistance: Gambe n · Torso n · Braccia n".
- Colonne impilate degli ultimi 6 mesi fino al mese scelto, stessa divisione per colori, altezza proporzionale al mese con più attività.

**Progressione carichi**
- `<select>` nativo con gli esercizi raggruppati per Gambe, Torso e Braccia (`<optgroup>`); quelli senza sessioni con il suffisso "(nessuna sessione)". Predefinito: l'esercizio con la sessione più recente; se non ce ne sono, il primo dell'elenco.
- Grafico a linee SVG di tutto lo storico (non dipende dal mese scelto): un punto per sessione, asse x per data, asse y da min a max con margine, etichette dei valori min/max e delle date estreme.
- Sotto: variazione totale "+15 kg (+9%) in 5 settimane" e "ultima sessione 6 ott". "Fermo da n settimane" in giallo quando ci sono almeno 2 sessioni con il peso attuale e la prima di queste (l'inizio dell'ultima serie di sessioni a peso uguale) risale a 4 o più settimane prima di oggi; n = settimane intere da quella sessione a oggi.
- Esercizi a corpo libero (`kg == null` nel piano): niente grafico, solo "n sessioni".
- Una sola sessione: punto singolo e "servono almeno 2 sessioni per vedere l'andamento". Nessuna: "Nessuna sessione registrata".

### Stati vuoti

Mese senza attività: riquadri a 0, grafici con "Nessuna attività in questo mese".

## Architettura

- Nuovo file `stats.js`, caricato da `index.html` dopo lo script principale con `<script src="stats.js">`. Espone `renderStats(el)`, chiamata da `render()` quando la vista è `stats`.
- Funzioni di calcolo pure in `stats.js` (ricevono `S` e la data di oggi, restituiscono numeri), separate dal disegno, così si possono verificare da sole.
- Usa variabili globali già presenti in `index.html` (`S`, `DAYS`, `ALL`, `ACT`, `ymd`, `parse`, `fmt`, `persist`, `OPEN`, animazioni). Nessun bundler.
- SVG disegnati a mano con i colori dell'app via variabili CSS (`var(--green)` ecc.), così funzionano in tema chiaro e scuro.
- `sw.js`: `stats.js` aggiunto ai file precaricati, `VERSION` alzata.
- Animazioni: entrata con `stagger` come le altre viste; blocchi `<details>` con l'animazione esistente.

## Verifica

- Script Node che carica le funzioni di calcolo con dati costruiti apposta e controlla risultati noti: giorni allenati, contrasto/riposo esclusi, attività non realizzate escluse, settimana a cavallo di due mesi, confronto alla stessa data (anche 31 vs mese da 30 giorni), serie attuale con settimana in corso riuscita e non, record, carichi aumentati, sessioni e "fermo da".
- Controllo nel browser (Playwright, viewport iPhone): apertura vista, cambio mese, blocchi, selettore esercizio, obiettivo +/−, tema scuro, nessun errore in console.
