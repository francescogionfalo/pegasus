# Pegasus: storico allenamenti, calendario, backup automatico

Data: 2026-10-07. Stato: approvato da Francesco in chat.

## Obiettivo

L'app diventa anche lo storico di tutti gli allenamenti, non solo la guida in palestra. Si chiama Pegasus.

## Decisioni prese

- Giorni fissi: giorno 1 = lunedì, giorno 7 = domenica.
- Spunte tutte manuali e indipendenti: serie, esercizio ("Fatto") e giorno ("Segna come realizzato") non si influenzano a vicenda.
- Backup: a ogni giorno segnato come fatto si apre il menu di condivisione di iOS con il backup completo. Annullare non toglie la spunta del giorno. Ogni backup contiene tutti i dati, basta sempre l'ultimo.

## Nome

`Pegasus` in `<title>`, `h1`, `apple-mobile-web-app-title`, `manifest.webmanifest` (name e short_name), file di backup `pegasus-backup-AAAA-MM-GG.json`. Le chiavi di `localStorage` restano invariate per non perdere i dati.

## Modello dati

`S.days["AAAA-MM-GG"] = { a, done, ex }`

- `a`: attività del giorno, `g2` / `g4` / `g7` / `muay` / `sauna`, salvata così lo storico resta leggibile anche se il piano cambia.
- `done`: giorno segnato come fatto.
- `ex[idEsercizio] = { done, kg, sets }`: `done` esercizio fatto, `kg` peso usato (fotografato quando si tocca "Fatto"; aggiornato se si cambia il peso nello stesso giorno, solo se la data è oggi), `sets` array di booleani delle serie spuntate.

Migrazione: le spunte di `scheda-sessione-v1` (serie di oggi) vengono spostate in `S.days[data]`, poi la chiave non si usa più.

Backup: `{app:"pegasus", version:2, exported, data:S}`. L'import accetta anche `version:1` / `app:"huberman-gym"` (senza `days`).

## Interfaccia

**Selettore vista** sotto l'intestazione: `Scheda` | `Storico`.

**Striscia settimana (vista Scheda)**: frecce ‹ › per cambiare settimana, etichetta con l'intervallo di date e "Oggi" per tornare alla settimana corrente. Ogni riquadro mostra giorno della settimana, numero del giorno, attività. Verde se il giorno è fatto, bordo marcato su oggi.
- Muay Thai e sauna: il tocco segna/toglie fatto (e apre il backup quando lo segna).
- Giorni pesi: il tocco apre la scheda di quel giorno.

**Scheda giorno pesi**: tutte le spunte si riferiscono alla data di quel giorno nella settimana visualizzata. L'intestazione mostra la data. Ogni esercizio ha il pulsante "Fatto" (blocco verde, riga chiusa con ✓). Le serie restano con il timer, salvate per data. In fondo il pulsante "Segna come realizzato" / "Annulla realizzato"; segnarlo apre il backup.

**Storico**: calendario mensile (lun-dom) con frecce per il mese. Giorno fatto pieno nel colore dell'attività (rosso pesi, blu Muay Thai, giallo sauna); giorno con solo esercizi o serie spuntate ma non segnato: solo contorno. Contatore del mese (allenamenti totali, pesi, Muay Thai, sauna). Tocco su un giorno: dettaglio con attività, stato, esercizi con ✓, peso e serie.

## Fuori dallo scopo

Grafici dei carichi, ripetizioni effettive, modifica dei giorni direttamente dal calendario.

## Verifica

Test Playwright su viewport iPhone: segnare Muay Thai e gambe, esercizi e serie su date diverse, navigazione settimane, calendario e dettaglio, migrazione da sessione v1, import di backup v1 e v2, nessun errore in console, tema chiaro e scuro.
