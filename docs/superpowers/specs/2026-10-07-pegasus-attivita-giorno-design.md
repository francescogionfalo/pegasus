# Pegasus: attività scelte giorno per giorno

Data: 2026-10-07. Stato: approvato da Francesco in chat. Sostituisce, per la parte "giorni fissi", lo spec `2026-10-07-pegasus-storico-design.md`.

## Obiettivo

I giorni non hanno più un allenamento assegnato. Francesco sceglie cosa ha fatto in ogni giorno; il piano Huberman resta come suggerimento.

## Decisioni

- Attività: Muay Thai, Resistance training (Gambe / Torso / Braccia), Cardio, Terapia di contrasto (ex sauna), Riposo. "Palestra" e "Resistance training" sono la stessa voce.
- Più attività nello stesso giorno (es. Braccia + Cardio), ognuna con il suo "realizzato".
- Piano Huberman come suggerimento: lun/mer/ven Muay Thai, mar Gambe, gio Torso, sab Terapia di contrasto, dom Braccia.
- Muay Thai, Cardio, Terapia di contrasto: solo "Segna come realizzato" per ora.
- Riposo: registrato appena scelto, nessun "realizzato", riquadro grigio.
- Segnare un'attività realizzata apre il backup (come prima).

## Interfaccia

- Intestazione: solo "Pegasus".
- Striscia settimana: date vere, frecce, "Oggi". Ogni riquadro mostra le etichette delle attività; se vuoto, il consigliato in grigio. Verde se almeno un'attività è realizzata, grigio se solo riposo, contorno verde se ci sono attività non ancora realizzate. Tocco = seleziona il giorno (all'avvio: oggi).
- Sotto: il giorno selezionato. Vuoto: scelta attività aperta, consigliato evidenziato. Resistance apre Gambe / Torso / Braccia e poi la scheda esistente. Attività inserite in ordine, ognuna con "Segna come realizzato" e "Rimuovi" (conferma se l'allenamento ha spunte). "+ Aggiungi attività" per aggiungerne altre. Niente doppioni nello stesso giorno.
- Le schede G2/G4/G7 spariscono.
- Storico: calendario con verde / grigio / contorno come la striscia e le iniziali delle attività; totali del mese per tipo; dettaglio del giorno.

## Dati

`S.days[data] = { acts: [{k, done}], ex: { id: {done, kg, sets} } }`, `k` in `muay | g2 | g4 | g7 | cardio | contrast | rest`.

Migrazione dal formato `{a, done, ex}`: `acts = [{k: a (sauna → contrast), done}]`. Applicata al caricamento e all'import. Backup `version: 3`; import di 1 e 2 ancora accettato.

## Fuori dallo scopo

Dettagli di Muay Thai e Cardio (durata, distanza).
