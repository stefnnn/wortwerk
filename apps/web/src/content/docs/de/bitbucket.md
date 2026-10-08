---
title: Bitbucket verbinden
description: Verbinde Bitbucket Cloud per OAuth, verknüpfe ein Repository und erhalte Übersetzungen als Pull Requests.
---

wortwerk verbindet sich per OAuth mit **Bitbucket Cloud**. Wenn du ein Repository verknüpfst, legt wortwerk darin einen Webhook an, damit Pushes ohne weitere Einrichtung bei wortwerk ankommen.

## Konto verbinden

1. Öffne in wortwerk **Einstellungen → Git-Verbindungen** und klicke auf **Bitbucket verbinden**. (Du kannst auch auf der Einrichtungsseite eines neuen Projekts starten.)
2. Bitbucket fragt, ob du wortwerk Zugriff gewährst. Angefragt werden:

| Berechtigung             | Wozu                                                   |
| ------------------------ | ------------------------------------------------------ |
| Account: read            | anzeigen, welches Konto verbunden ist                  |
| Repositories: write      | Übersetzungsdateien lesen, den Export-Branch schreiben |
| Pull requests: write     | den Übersetzungs-Pull-Request öffnen und aktualisieren |
| Webhooks: read and write | den Push-Webhook in verknüpften Repositories anlegen   |

3. Bitbucket leitet dich zurück zu wortwerk, wo die Verbindung mit deinem Kontonamen erscheint.

Die Verbindung handelt mit deinen Bitbucket-Rechten und kann von allen Projekten im Workspace genutzt werden.

## Repository mit einem Projekt verknüpfen

Öffne das Projekt und dann **Einstellungen → Repository**, wähle die Bitbucket-Verbindung und das Repository und fülle dieselben Felder aus wie bei GitHub: verfolgter Branch, Export-Branch (standardmässig `wortwerk/translations`), Sprach-Aliase und automatischer Export. Füge danach die Dateimuster hinzu, z. B. `locales/%locale%.json`. Die Felder sind unter [GitHub verbinden](/docs/github#repository-mit-einem-projekt-verknuepfen) erklärt.

Beim Speichern

1. legt wortwerk im Repository einen **Webhook** für Push-Events mit eigenem Signatur-Secret an,
2. startet die erste Synchronisation vom Kopf des verfolgten Branches.

> **«Gespeichert, aber der Webhook konnte nicht erstellt werden»** heisst, dass dein Bitbucket-Konto die Webhooks dieses Repositorys nicht verwalten darf (dafür braucht es Admin-Rechte im Repository). Synchronisieren funktioniert trotzdem, mit **Jetzt synchronisieren** oder aus der CI. Lass eine Person mit Admin-Rechten ihr Konto verbinden, oder speichere das Repository erneut, sobald du die Rechte hast.

## Unterschied beim Export

Die API von Bitbucket kann keinen Force-Push. Statt den Export-Branch bei jedem Export neu vom verfolgten Branch zu erzeugen, setzt wortwerk einen neuen Commit auf den bisherigen Stand des Export-Branches. Der Inhalt des Pull Requests ist derselbe: die aktuellen Übersetzungen und die bearbeiteten Quelltexte, verglichen mit dem verfolgten Branch.

Wird der Export-Branch unübersichtlich, etwa nach einem lange offenen Pull Request, merge oder schliesse den Pull Request und lösche den Branch. Der nächste Export legt ihn neu vom verfolgten Branch an.

## Trennen

**Trennen** im Projekt entfernt den Webhook aus dem Repository. Wenn du die Verbindung unter **Einstellungen → Git-Verbindungen** entfernst, wird sie von allen Projekten gelöst. Keys und Übersetzungen bleiben in wortwerk.

Was bei jedem Pull und Export passiert, steht in [So funktioniert die Synchronisation](/docs/sync).
