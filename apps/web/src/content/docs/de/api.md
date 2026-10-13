---
title: API
description: Mit einem Token authentifizieren, Scopes und Fehler verstehen, durch Keys blättern. Alle Endpunkte stehen in der API-Referenz.
---

Die öffentliche API liegt unter `https://wortwerk.li/api/v1`. Sie spricht JSON, ist im Pfad versioniert und ist dieselbe API, die auch die CLI nutzt. Die [API-Referenz](/docs/api/reference) listet alle Endpunkte mit Parametern, Schemas und Beispielen. Das maschinenlesbare OpenAPI-3.1-Dokument liegt unter [`/api/v1/openapi.json`](https://wortwerk.li/api/v1/openapi.json).

```sh
curl https://wortwerk.li/api/v1/me \
  -H "Authorization: Bearer $WORTWERK_TOKEN"
```

## Tokens

Jede Anfrage enthält ein Bearer-Token. Es gibt zwei Arten:

|                | Persönliches Zugriffstoken                | Projekt-Token                                     |
| -------------- | ----------------------------------------- | ------------------------------------------------- |
| Präfix         | `wwu_`                                    | `ww_`                                             |
| Erstellt unter | **Konto & API** oder mit `wortwerk login` | Projekteinstellungen, **CI-Tokens**               |
| Handelt als    | du, mit deinen Workspaces und Rollen      | das Projekt, ohne Person                          |
| Reichweite     | alle deine Workspaces oder einer          | ein Projekt                                       |
| Zugriff        | nur lesen, oder lesen & schreiben         | lesen und synchronisieren                         |
| Ablauf         | nach 30, 90 oder 365 Tagen, oder nie      | nie, widerrufe es, wenn du es nicht mehr brauchst |

Nutze **Projekt-Tokens** für die CI: Sie können weder Übersetzungen noch Einstellungen ändern und hören auf zu funktionieren, wenn das Projekt gelöscht wird. Nutze **persönliche Tokens** für Skripte, die in deinem Namen handeln: Änderungen damit erscheinen im Verlauf der Übersetzung unter deinem Namen.

Tokens werden beim Erstellen genau einmal angezeigt. wortwerk speichert nur einen Hash, und die Token-Liste zeigt das Präfix und wann jedes Token zuletzt verwendet wurde.

### Scopes

| Scope | Erlaubt für                                           | Endpunkte                                                                                         |
| ----- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| read  | alle Tokens                                           | alles, was nur liest: Projekte, Keys, Statistiken, Datei-Downloads, Runs                          |
| write | persönliche Tokens mit Schreibzugriff                 | Übersetzungen, Keys, Sprachen, Dateimuster und Uploads, maschinelle Übersetzung, Projekte anlegen |
| sync  | persönliche Tokens mit Schreibzugriff, Projekt-Tokens | Synchronisationen und Exporte starten                                                             |

### Gäste

Das persönliche Token eines Gasts hat genau dessen Zugriff: nur die freigegebenen Projekte, Änderungen nur in den freigegebenen Sprachen und nur die Inhalts-Endpunkte (Projekte, Statistiken und Keys lesen, Übersetzungen setzen). Alles andere antwortet mit `403`.

## Fehler

Fehler haben einen HTTP-Status und einen JSON-Body:

```json
{ "error": "not_found", "message": "Project not found" }
```

| Status | `error`         | Wann                                                                                                        |
| ------ | --------------- | ----------------------------------------------------------------------------------------------------------- |
| 400    | `invalid`       | Validierung fehlgeschlagen, die Meldung nennt das Feld                                                      |
| 401    | `http`          | Token fehlt, ist unbekannt, widerrufen oder abgelaufen                                                      |
| 402    | `limit_reached` | die Limite deines Abos (Projekte, Keys, Personen) ist erreicht, oder die Funktion braucht ein bezahltes Abo |
| 403    | `forbidden`     | dem Token fehlt der Scope, oder Gäste dürfen den Endpunkt nicht nutzen                                      |
| 404    | `not_found`     | existiert nicht, oder das Token sieht es nicht                                                              |
| 409    | `conflict`      | z. B. ein Key oder Projekt-Slug, den es schon gibt                                                          |

## Seitenweise abrufen

Listen, die gross werden können, etwa Keys, liefern eine Seite und einen Cursor:

```json
{ "data": [ … ], "total": 1250, "nextCursor": "MTAw" }
```

Gib `nextCursor` als `cursor` mit, um die nächste Seite zu holen, bis er `null` ist. `limit` bestimmt die Seitengrösse (bis 200).

## Hintergrund-Jobs

Synchronisationen, Exporte, Uploads und maschinelle Übersetzungen laufen im Hintergrund. Die API antwortet mit `202 Accepted` und einem **Run**:

```json
{ "id": "…", "kind": "pull", "status": "queued" }
```

Frage `GET /projects/{projectId}/runs/{runId}` ab, bis `status` `succeeded` oder `failed` ist. `result` enthält dann Zahlen wie hinzugefügte Keys oder geänderte Übersetzungen, `error` erklärt Fehlschläge.

## Häufige Aufgaben

Einen Key über seinen Namen finden und die deutsche Übersetzung setzen:

```sh
KEY=$(curl -s "https://wortwerk.li/api/v1/projects/$PROJECT_ID/keys?locale=de&name=cart.title" \
  -H "Authorization: Bearer $WORTWERK_TOKEN" | jq -r '.data[0].id')

curl -X PUT "https://wortwerk.li/api/v1/projects/$PROJECT_ID/keys/$KEY/translations/de" \
  -H "Authorization: Bearer $WORTWERK_TOKEN" -H "Content-Type: application/json" \
  -d '{"value": "Warenkorb", "status": "approved"}'
```

Eine Datei in einer Sprache herunterladen. Der Header `x-wortwerk-path` enthält ihren Pfad im Repository:

```sh
curl "https://wortwerk.li/api/v1/projects/$PROJECT_ID/files/$FILE_ID/download?locale=fr" \
  -H "Authorization: Bearer $WORTWERK_TOKEN" -o locales/fr.json
```

Synchronisation und Export aus der CI starten:

```sh
curl -X POST "https://wortwerk.li/api/v1/projects/$PROJECT_ID/sync" \
  -H "Authorization: Bearer $WORTWERK_TOKEN" -H "Content-Type: application/json" \
  -d '{"export": true}'
```
