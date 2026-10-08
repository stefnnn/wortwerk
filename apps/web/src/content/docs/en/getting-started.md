---
title: Getting started
description: From a new account to the first translated pull request in about ten minutes.
---

## 1. Create your account and workspace

[Create an account](/sign-up) with your email address. Afterwards you sign in with a magic link or your password.

wortwerk then asks for a **workspace** name. A workspace holds your projects, members and plan. Everyone owns one workspace and can be invited to any number of others. You switch between them in the top left of the app.

## 2. Create a project

A project usually corresponds to one app or repository. Give it:

- a **name** and a **slug** (used in URLs),
- the **source language**, the language your developers write the texts in, for example `en`,
- the **target languages** you want to translate into, for example `de`, `fr`, `it`.

Language codes follow the usual `language` or `language-REGION` form (`de`, `de-CH`, `pt-BR`). You can add and remove languages later in the project settings.

## 3. Choose where the files come from

After creating the project, wortwerk asks how your translation files get in:

### Connect a repository (recommended)

Connect [GitHub](/docs/github) or [Bitbucket](/docs/bitbucket), pick the repository and add a **file pattern** with `%locale%` where the language code goes:

```text
locales/%locale%.json
config/locales/%locale%.yml
src/i18n/%locale%/messages.po
```

The first sync starts right away. It reads the source file, creates a key for every message and imports the translations that already exist in the repository. From then on, every push to the tracked branch updates wortwerk automatically.

### Upload files

No repository, or not yet? Upload your source file first (it creates the keys), then the files of the other languages. The [CLI](/docs/cli) does the same from your terminal with `wortwerk push`, and `wortwerk pull` downloads the translated files.

## 4. Invite your team

In **Settings → Members** you invite people by email:

- **Members** can do everything in the workspace: projects, settings, repository connections, members.
- **Guests** are meant for translators and agencies. They only see the projects you grant them, optionally limited to some languages, and can edit translations, comment and attach screenshots. They don't see settings or other members.

Members and guests both count towards your plan's user limit.

## 5. Translate

The editor shows one row per key and language with its source text. Every translation has a status:

| Status       | Meaning                                                                          |
| ------------ | -------------------------------------------------------------------------------- |
| Untranslated | No translation yet                                                               |
| Translated   | Has a value, not reviewed                                                        |
| Needs review | The source text changed, or the value came from an import or machine translation |
| Approved     | Reviewed and final                                                               |

While translating you get suggestions from your **translation memory** (similar texts in all your projects), can ask for a **machine translation** of a single key (paid plans), leave **comments** and attach **screenshots** for context. Every change is kept in the history of the translation.

Placeholders like `{name}`, plural forms and markup are part of the message structure. wortwerk stores all messages as ICU MessageFormat internally and converts to and from your file format, so translators see the same notation in every project.

## 6. Ship the translations

For connected repositories, wortwerk exports translations as a **pull request** on its own branch (`wortwerk/translations` by default). You can click **Export now** in the project, let wortwerk export automatically a minute after the last change, or trigger it from CI. Merge the pull request like any other.

Without a repository, download the files from the **Files** page or run `wortwerk pull`.

> Want to know exactly what happens on each sync, including what happens when developers and translators edit the same text? Read [How sync works](/docs/sync).
