---
title: GitHub verbinden
description: Installiere die wortwerk GitHub App, verknüpfe ein Repository mit einem Projekt und erhalte Übersetzungen als Pull Requests.
---

wortwerk verbindet sich über eine **GitHub App** mit GitHub. Die App bekommt nur Zugriff auf die Repositories, die du auswählst, und Pushes erreichen wortwerk über den Webhook der App. Im Repository selbst musst du nichts einrichten.

## App installieren

1. Öffne in wortwerk **Einstellungen → Git-Verbindungen** und klicke auf **GitHub verbinden**. (Du kannst auch auf der Einrichtungsseite eines neuen Projekts starten.)
2. GitHub fragt, wo die App installiert werden soll. Wähle dein persönliches Konto oder eine Organisation.
3. Wähle **Only select repositories** und die Repositories mit Übersetzungsdateien, oder erlaube alle Repositories.
4. GitHub leitet dich zurück zu wortwerk, wo die Verbindung mit dem Kontonamen erscheint.

Jede Verbindung kann von allen Projekten im Workspace genutzt werden. Verbinde mehrere Konten oder Organisationen, wenn deine Repositories verteilt sind.

> **Keine Owner-Rechte in der Organisation?** Dann schickt GitHub eine _Anfrage_ zur Installation an die Owner. wortwerk zeigt «Installation angefragt», bis jemand sie bestätigt. Klicke danach nochmals auf **GitHub verbinden**, um abzuschliessen.

### Was die App darf

| Berechtigung                | Wozu                                                                 |
| --------------------------- | -------------------------------------------------------------------- |
| Contents: read & write      | Übersetzungsdateien eines Commits lesen, den Export-Branch schreiben |
| Pull requests: read & write | den Übersetzungs-Pull-Request öffnen und aktualisieren               |
| Metadata: read              | Repositories und Branches auflisten                                  |
| Push-Events                 | eine Synchronisation starten, wenn sich der verfolgte Branch ändert  |

Die App pusht nie auf deinen verfolgten Branch. Sie schreibt nur auf ihren eigenen Export-Branch und öffnet von dort einen Pull Request.

## Repository mit einem Projekt verknüpfen

Öffne das Projekt und dann **Einstellungen → Repository** (oder die Einrichtungsseite eines neuen Projekts):

| Feld                    | Bedeutung                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Verbindung              | das verbundene GitHub-Konto oder die Organisation                                                                                               |
| Repository              | das Repository mit den Übersetzungsdateien                                                                                                      |
| Verfolgter Branch       | wohin Entwickler mergen, meist `main`. Standard ist der Default-Branch des Repositorys                                                          |
| Export-Branch           | wohin wortwerk Übersetzungen schreibt, standardmässig `wortwerk/translations`. Er wird bei jedem Export neu erzeugt, committe also nicht darauf |
| Sprach-Aliase           | ordnen Projektsprachen Dateinamen zu, z. B. `de-CH=de`, wenn die Datei `de.json` heisst                                                         |
| Automatisch exportieren | eine Minute nach der letzten Änderung exportieren, statt nur über **Jetzt exportieren**                                                         |

Füge dann pro Gruppe von Dateien ein **Dateimuster** hinzu, mit `%locale%` an der Stelle der Sprache:

```text
locales/%locale%.json
packages/app/src/i18n/%locale%.ts
config/locales/%locale%.yml
```

Das Speichern startet die erste Synchronisation. Sie liest die Quelldatei jedes Musters am Kopf des verfolgten Branches, legt die Keys an und importiert Übersetzungen, die bereits im Repository liegen (als _Zu prüfen_ markiert).

## Im Alltag

- **Entwickler** pushen wie gewohnt auf den verfolgten Branch. Neue Keys erscheinen innert Sekunden in wortwerk, geänderte Quelltexte setzen ihre Übersetzungen auf _Zu prüfen_, und entfernte Keys werden veraltet.
- **Übersetzer** arbeiten im Editor.
- **Exporte** erstellen oder aktualisieren einen einzigen Pull Request, _Update translations from wortwerk_, vom Export-Branch in den verfolgten Branch. Die Beschreibung listet die in wortwerk bearbeiteten Quelltexte und die Zahl geänderter Texte pro Sprache. Merge ihn wie jeden anderen Pull Request. Nach dem nächsten Push zeigt das Projekt _Mit Repository synchron_.

Eine Synchronisation startest du auch mit **Jetzt synchronisieren** oder aus der CI mit der [CLI](/docs/cli#in-der-ci-nutzen) oder der [API](/docs/api).

## Fehlerbehebung

- **«No translation files found»**: Das Dateimuster passt auf keine Datei am Kopf des verfolgten Branches. Prüfe den Pfad und die Sprach-Aliase.
- **Das Repository fehlt in der Liste**: Die App ist mit _Only select repositories_ installiert. Füge es auf GitHub unter _Settings → Applications → wortwerk → Configure_ hinzu.
- **Branch Protection**: wortwerk schreibt nur auf den Export-Branch. Wenn du `wortwerk/*` schützt, erlaube der wortwerk App den Force-Push darauf.
- **Trennen**: Wenn du die App auf GitHub deinstallierst, verschwindet auch die Verbindung in wortwerk. Keys und Übersetzungen bleiben im Projekt.

Was bei jedem Pull und Export genau passiert, steht in [So funktioniert die Synchronisation](/docs/sync).
