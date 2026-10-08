---
title: CLI
description: Melde dich im Terminal an, synchronisiere aus der CI, hole Übersetzungen für die lokale Entwicklung und finde kaputte Platzhalter, bevor sie live gehen.
---

Das Kommandozeilen-Tool `wortwerk` braucht Node.js 22 oder neuer. Führe es mit `npx` aus oder installiere es in deinem Projekt:

```sh
npx wortwerk --help
npm install --save-dev wortwerk
```

## Anmelden

```sh
npx wortwerk login
```

Die CLI zeigt einen Code wie `BCDF-GHJK` und öffnet deinen Browser. Prüfe, ob der Code übereinstimmt, und klicke auf **Zugriff erlauben**. Die CLI erhält ein persönliches Zugriffstoken (ein Jahr gültig, Zugriff auf all deine Workspaces) und speichert es in `~/.config/wortwerk/credentials.json`, nur für dich lesbar. Über SSH oder in einem Container öffnest du den angezeigten Link auf einem beliebigen Gerät. Mit `BROWSER=none` versucht die CLI gar nicht erst, einen Browser zu öffnen.

```sh
npx wortwerk whoami      # wer du bist, welche Workspaces
npx wortwerk logout      # widerruft das Token und vergisst es
```

CLI-Sitzungen siehst und widerrufst du in der App unter **Konto & API**. Sie heissen nach deinem Computer.

## Einen Ordner mit einem Projekt verknüpfen

Führe `init` im Wurzelverzeichnis deines Repositorys aus:

```sh
npx wortwerk init
```

Die CLI fragt nach Workspace und Projekt (oder legt ein neues an). Hat das Projekt noch keine Dateimuster, durchsucht sie den Ordner nach Übersetzungsdateien wie `locales/en.json`, `en/messages.yml` oder `messages.en.po` und schlägt passende `%locale%`-Muster vor.

Das Ergebnis ist eine `wortwerk.json`, die du committest:

```json
{
  "project": "5f0c1d1e-8a4e-4c55-9b7e-2f2d3c1a9e10",
  "sourceLocale": "en",
  "locales": ["de", "en", "fr"],
  "files": [{ "path": "locales/%locale%.json", "format": "json" }]
}
```

`locales` und `files` sind eine Kopie der Projekteinstellungen. `init`, `pull` und `push` aktualisieren sie, damit `lint` auch offline funktioniert.

## Befehle

| Befehl                                         | Was er macht                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `pull [-l de,fr] [--source]`                   | lädt die Übersetzungsdateien in den Ordner                                      |
| `push [-l de] [--overwrite]`                   | lädt lokale Dateien hoch: standardmässig die Quelldatei, Übersetzungen mit `-l` |
| `sync [--export]`                              | holt das Repository in wortwerk, optional mit anschliessendem Pull Request      |
| `status [-l de]`                               | Fortschritt pro Sprache                                                         |
| `check [--min 100] [--approved]`               | endet mit Exit-Code 1, wenn eine Sprache unter dem Schwellenwert liegt          |
| `lint [--strict]`                              | prüft lokale Dateien offline auf kaputte Platzhalter, Markup und Plurale        |
| `keys [suche] [-l de] [--status untranslated]` | listet Keys auf                                                                 |
| `translate <key> [wert] -l de`                 | zeigt einen Key in allen Sprachen oder setzt eine Übersetzung                   |
| `mt <locale>`                                  | übersetzt alle unübersetzten Keys einer Sprache maschinell (bezahlte Abos)      |
| `open`                                         | öffnet das Projekt im Browser                                                   |

`push`, `sync` und `mt` warten, bis der Job fertig ist, und zeigen das Ergebnis. Mit `--no-wait` kehren sie sofort zurück.

### Projekte mit Repository

Bei einem verbundenen Projekt kommen die Keys aus dem Repository, deshalb lehnt `push` das Hochladen von Quelldateien ab. Committe sie, und der Webhook (oder `wortwerk sync`) holt sie ab. `pull` ist trotzdem nützlich: Es schreibt die neusten Übersetzungen mit angewendeten Sprach-Aliasen in deine Arbeitskopie, noch bevor der wortwerk-Pull-Request gemergt ist.

### Projekte ohne Repository

`push` lädt die Quelldatei hoch und legt Keys an oder aktualisiert sie, `push -l de` lädt deutsche Übersetzungen hoch (bestehende Übersetzungen werden nur mit `--overwrite` ersetzt), und `pull` lädt die Ergebnisse herunter.

## Dateien offline prüfen

```sh
npx wortwerk lint
```

`lint` vergleicht jede lokale Übersetzung mit ihrem Quelltext: gültige ICU-Syntax, dieselben Platzhalter, dasselbe Markup und alle Pluralformen, die die Sprache braucht. Keys, die nur in einer Übersetzungsdatei vorkommen, erscheinen als Warnung. Bei Fehlern ist der Exit-Code 1 (mit `--strict` auch bei Warnungen), damit eignet sich `lint` als Pre-Commit-Hook oder CI-Schritt.

```text
src/locales/de.json
  error greeting placeholders changed (name → nme)
1 file checked: 1 error, 0 warnings
```

## In der CI nutzen

Erstelle in den Projekteinstellungen unter _CI-Tokens_ ein **Projekt-Token** und speichere es als Secret namens `WORTWERK_TOKEN`. Projekt-Tokens dürfen ihr Projekt lesen und Synchronisationen starten, sonst nichts. Die CLI liest das Token aus der Umgebung und das Projekt aus der `wortwerk.json`.

Beispiel für GitHub Actions: nach jedem Merge auf `main` synchronisieren und Pull Requests mit unvollständigen Übersetzungen fehlschlagen lassen:

```yaml
name: translations
on:
  push:
    branches: [main]
  pull_request:

jobs:
  wortwerk:
    runs-on: ubuntu-latest
    env:
      WORTWERK_TOKEN: ${{ secrets.WORTWERK_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx wortwerk lint
      - if: github.event_name == 'push'
        run: npx wortwerk sync --export
      - if: github.event_name == 'pull_request'
        run: npx wortwerk check --min 100
```

| Variable         | Zweck                                                                        |
| ---------------- | ---------------------------------------------------------------------------- |
| `WORTWERK_TOKEN` | persönliches oder Projekt-Token, hat Vorrang vor der gespeicherten Anmeldung |
| `WORTWERK_HOST`  | Server-URL für selbst gehostete Installationen                               |
| `BROWSER=none`   | beim `login` keinen Browser öffnen                                           |
| `DEBUG=1`        | bei Fehlern Stack-Traces ausgeben                                            |
