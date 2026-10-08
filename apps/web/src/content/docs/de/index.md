---
title: Einführung
description: wortwerk hält die Übersetzungen deiner App neben deinem Code. Entwickler arbeiten weiter in git, Übersetzerinnen in einem fokussierten Editor, und Änderungen reisen als Pull Requests zwischen beiden.
---

## Wie wortwerk in deinen Ablauf passt

Die meisten Übersetzungstools wollen die einzige Quelle der Wahrheit sein. wortwerk teilt die Verantwortung entlang der Linien, die es in einem Softwareteam ohnehin gibt:

|                                                                 | Gehört            | Fliesst                                      |
| --------------------------------------------------------------- | ----------------- | -------------------------------------------- |
| Keys und Struktur der Texte (Platzhalter, Markup, Pluralformen) | deinem Repository | Repo → wortwerk                              |
| Formulierung der Quelltexte                                     | beiden            | in beide Richtungen, pro Key zusammengeführt |
| Übersetzungen                                                   | wortwerk          | wortwerk → Repo, als Pull Request            |

Entwickler fügen Keys im Code hinzu, den sie sowieso gerade schreiben. Sobald sie pushen, übernimmt wortwerk die neuen Keys innert Sekunden. Übersetzer sehen sie im Editor, und wenn sie fertig sind, öffnet wortwerk einen Pull Request mit den übersetzten Dateien. Niemand kopiert Dateien herum, und niemand löst Merge-Konflikte in JSON.

## Was du verbinden kannst

- **Repositories** auf [GitHub](/docs/github) und [Bitbucket Cloud](/docs/bitbucket). Pro Projekt ein verfolgter Branch.
- **Dateiformate**: JSON (verschachtelt oder flach, ICU- oder i18next-Stil), YAML (Rails-Stil), gettext PO sowie TypeScript- oder JavaScript-Objektliterale. Dateien werden mit unveränderter Key-Reihenfolge, Verschachtelung und Kommentaren zurückgeschrieben, damit die Diffs im Pull Request klein bleiben.
- **Ohne Repository**: Lade Dateien im Browser hoch oder nutze die [CLI](/docs/cli), um sie hoch- und herunterzuladen.

## Wie weiter

- [Erste Schritte](/docs/getting-started): Workspace und erstes Projekt anlegen.
- [So funktioniert die Synchronisation](/docs/sync): Was bei jedem Pull und Export genau passiert.
- [CLI](/docs/cli) und [API](/docs/api): Syncs automatisieren, Releases bei fehlenden Übersetzungen stoppen oder eigene Integrationen bauen.
