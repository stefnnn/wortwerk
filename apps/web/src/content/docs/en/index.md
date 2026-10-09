---
title: Introduction
description: wortwerk keeps your app's translations next to your code. Developers keep working in git, translators work in a focused editor, and changes travel between the two as pull requests.
---

> **Set up in one command.** Run `npx wortwerk init` at the root of your repository. It detects your GitHub or Bitbucket remote and translation files, lets you sign up in the browser and runs the first sync. See [Quick setup with init](/docs/cli#quick-setup-with-init).

## How wortwerk fits into your workflow

Most translation tools want to be the source of truth. wortwerk splits ownership along the lines that already exist in a software team:

|                                                                 | Owned by        | Travels                            |
| --------------------------------------------------------------- | --------------- | ---------------------------------- |
| Keys and message structure (placeholders, markup, plural forms) | your repository | repo → wortwerk                    |
| Source wording                                                  | both            | both ways, merged per key          |
| Translations                                                    | wortwerk        | wortwerk → repo, as a pull request |

Developers add keys in the code they are writing anyway. When they push, wortwerk picks up the new keys within seconds. Translators see them in the editor, and once they are done, wortwerk opens a pull request with the translated files. Nobody copies files around and nobody resolves merge conflicts in JSON.

## What you can connect

- **Repositories** on [GitHub](/docs/github) and [Bitbucket Cloud](/docs/bitbucket). One tracked branch per project.
- **File formats**: JSON (nested or flat, ICU or i18next style), YAML (Rails style), gettext PO, and TypeScript or JavaScript object literals. Files are written back with their key order, nesting and comments intact, so pull request diffs stay small.
- **Without a repository**: upload files in the browser or use the [CLI](/docs/cli) to push and pull them.

## Where to go next

- [Getting started](/docs/getting-started): create a workspace and your first project, from the terminal or in the browser.
- [How sync works](/docs/sync): what happens on every pull and export, in detail.
- [CLI](/docs/cli) and [API](/docs/api): automate syncs, gate releases on missing translations, or build your own integration.
