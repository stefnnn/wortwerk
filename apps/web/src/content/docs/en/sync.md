---
title: How sync works
description: What happens on every pull and every export, how edits on both sides are merged, and why your pull requests stay small.
---

A connected project moves data in two directions:

- a **pull** reads the repository into wortwerk,
- an **export** writes translations (and source wording edited in wortwerk) back as a pull request.

Both run as background jobs, one at a time per project, so a pull and an export never overlap.

## Who owns what

|                                                       | Owner      | Direction                 |
| ----------------------------------------------------- | ---------- | ------------------------- |
| Keys: which messages exist                            | repository | repo → wortwerk           |
| Message structure: placeholders, markup, plural forms | repository | repo → wortwerk           |
| Source wording                                        | shared     | both ways, merged per key |
| Translations                                          | wortwerk   | wortwerk → repo           |

Keys of a connected project are only ever added by developers in the repository, never in wortwerk. That keeps the code and the translation files consistent: a key exists exactly when some code can use it.

## Pull: repository → wortwerk

### When it runs

- on every **push** to the tracked branch (GitHub App or Bitbucket webhook),
- when you click **Sync now** in the project,
- from CI with `wortwerk sync` or the [API](/docs/api),
- after you connect a repository, change the tracked branch, or add a file pattern or language,
- before every export, if the tracked branch moved since the last pull (see below).

Webhooks carry the commit SHA. A commit that was already synced is skipped, so redelivered webhooks do no harm.

### What it does

For each file pattern, wortwerk reads the **source language file** at that commit and compares it with the project:

1. **New keys** are created, in file order.
2. **Keys missing from the file** become _obsolete_. They disappear from the editor, but their translations are kept, and if the key comes back later, everything is restored. Obsolete keys are only deleted when you click **Purge obsolete keys** in the project settings.
3. **Source texts** are merged per key (see below). When the wording changes, the translations of that key move to _needs review_.

Then the **target language files** are read. Translations in the repository only fill gaps, they never overwrite work done in wortwerk:

- on the **first pull** of a file or language, every translation from the repository is imported,
- afterwards, only translations of **keys that are new** in this pull are imported.

Imported translations are marked _needs review_.

### Auto-translate new keys

With **Auto-translate new keys** in the project settings (on by default, Project and Agency plans), wortwerk machine-translates the keys a pull added into every language that still lacks a translation, marked _needs review_. With **Export automatically** on, the result goes out in the pull request a minute later, so a feature branch merged into the tracked branch comes back with its translations without anyone opening wortwerk.

Only keys that are new in a pull count. The keys of the first pull, and translations that were already missing before, are your backlog: pre-translate those in the editor. A pull that adds more than 500 keys at once (a new file pattern, a mass rename) is skipped as well and noted in the sync history. File imports work the same way.

## Merging source text

Developers change wording in code reviews, and copywriters fix texts in wortwerk, sometimes the same text at the same time. wortwerk merges every key **three-way**, using the last value it saw in the repository as the common base:

| Repository | wortwerk  | Result                                                    |
| ---------- | --------- | --------------------------------------------------------- |
| changed    | unchanged | the repository's text is taken                            |
| unchanged  | changed   | wortwerk's text is kept and goes out with the next export |
| changed    | changed   | **conflict**: the repository wins                         |

In a conflict, the wording from wortwerk isn't lost. The editor shows the key with _Before_, _Repository now_ and _Wording from wortwerk_. Choose **Use my wording** to re-apply your edit (it then goes out with the next export), or **Keep repository version** to dismiss it.

### Only wording, never structure

Source edits in wortwerk may change the wording, but not the structure, because the code depends on it. The editor refuses a source edit that

- adds, removes or renames a placeholder (`{name}`, `{count}`),
- changes markup (`<b>…</b>`, `<link>…</link>`),
- turns a message into a plural or back, or drops a plural form.

Change those in the repository. Translations must be valid ICU messages; machine translations are additionally checked for the same placeholders, markup and the plural forms each language needs (for example `one`, `few`, `many`, `other` in Polish). [`wortwerk lint`](/docs/cli#check-files-offline) runs the full structure check on translation files.

## Export: wortwerk → repository

### When it runs

- when you click **Export now**,
- automatically one minute after the last translation change, if **Export automatically** is on,
- from CI with `wortwerk sync --export` or the API.

### What it does

1. **Catch up with the repository.** If the tracked branch moved since the last pull, wortwerk pulls first. Otherwise the export could undo changes developers just made.
2. **Patch the source file.** Source wording edited in wortwerk is written into the repository's source file _as it is at that commit_. Only the edited entries change. Everything else stays byte for byte as it was, including formatting and comments.
3. **Write the target files.** Every language file is generated from wortwerk, using the source file as the template, so key order, nesting and comments match. Files whose content is identical to the repository are left out.
4. **Update the branch.** The export branch (`wortwerk/translations`) is regenerated from the head of the tracked branch and force-pushed. On Bitbucket, a new commit goes on top of the previous export instead.
5. **Open or update the pull request** _Update translations from wortwerk_. Its description lists source text changes as a before/after table and the number of changed strings per language.

There is only ever one wortwerk pull request per project. Every export replaces its content, so it always shows the complete, current difference. That is also why you shouldn't commit to the export branch yourself.

### After merging

The merge is a push to the tracked branch, so wortwerk pulls it. The values in the repository now match wortwerk, and the project shows **In sync**. Until then, the project shows _Changes not in a pull request yet_ or _Pull request submitted_.

## File formats

wortwerk stores every message as **ICU MessageFormat** and converts on the way in and out:

| Format  | Details                                                                                                                                      |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON    | nested or flat keys. Plurals as ICU (`{count, plural, …}`) or i18next suffixes (`key_one`, `key_other`), placeholders `{name}` or `{{name}}` |
| YAML    | Rails style, with or without the root language key, placeholders `%{name}`                                                                   |
| PO      | gettext, including `msgctxt` and plural forms                                                                                                |
| TS / JS | object literals in `.ts`, `.js`, `.mjs`, … files. They are parsed, never executed                                                            |

The style is detected from the source file and kept when writing, so a file that uses i18next plurals keeps using them.

## Locale aliases

Project languages and file names don't always match. Map them in the repository settings, one per line:

```text
de-CH=de
pt-BR=pt_BR
```

The language `de-CH` is then read from and written to `locales/de.json` for the pattern `locales/%locale%.json`.
