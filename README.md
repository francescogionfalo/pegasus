# Pegasus

Scheda pesi personale basata su *Protocols* di Andrew Huberman, con lo storico di tutti gli allenamenti. Web app installabile sull'iPhone, dati salvati sul telefono.

## Provarla sul Mac

Il service worker non funziona aprendo il file direttamente, serve un piccolo server locale. Dalla cartella del progetto:

```
python3 -m http.server 8000
```

Poi apri http://localhost:8000 nel browser.

## Pubblicarla su GitHub Pages (gratis)

1. Crea un account su github.com, se non ce l'hai.
2. Crea un repository nuovo, per esempio `huberman-gym`. Con l'account gratuito, per usare Pages deve essere **pubblico**: si vede il codice, non i tuoi dati, che restano sul telefono.
3. Carica i file di questa cartella nel repository (Claude Code può farlo per te con git).
4. Nel repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, cartella `/ (root)`, Save.
5. Dopo un paio di minuti l'app è su `https://<tuo-utente>.github.io/huberman-gym/`.

Ogni volta che pubblichi una modifica, alza `VERSION` in `sw.js`, così il telefono scarica i file nuovi.

## Installarla sull'iPhone

1. Apri l'indirizzo di GitHub Pages in **Safari** (non in Chrome).
2. Tocca **Condividi → Aggiungi alla schermata Home**.
3. Aprila sempre dall'icona: è lì che vivono i tuoi dati. Safari e l'icona hanno memorie separate.

## Backup

Ogni volta che segni un giorno come fatto si apre da solo il salvataggio del backup: scegli "Salva su File" e una cartella di iCloud Drive. Ogni file contiene tutto lo storico, quindi basta sempre il più recente. In fondo alla pagina: **Esporta backup** salva un file JSON (scegli "Salva su File" e mettilo su iCloud Drive). **Importa backup** lo ripristina, per esempio su un telefono nuovo.

## Crediti

- Icone delle attività: [Material Symbols](https://fonts.google.com/icons) di Google, licenza Apache 2.0.
- Foto degli esercizi: [free-exercise-db](https://github.com/yuhonas/free-exercise-db), dominio pubblico (Unlicense).
