---
title: CLI
description: Sign in from your terminal, sync from CI, pull translations for local development and catch broken placeholders before they ship.
---

The `wortwerk` command line tool needs Node.js 22 or newer. Run it with `npx`, or install it in your project:

```sh
npx wortwerk --help
npm install --save-dev wortwerk
```

## Sign in

```sh
npx wortwerk login
```

The CLI shows a code like `BCDF-GHJK` and opens your browser. Check that the code matches, then click **Allow access**. The CLI receives a personal access token (valid for one year, access to all your workspaces) and stores it in `~/.config/wortwerk/credentials.json`, readable only by you. Over SSH or in a container, open the printed link on any device. Set `BROWSER=none` to stop the CLI from trying to open a browser.

```sh
npx wortwerk whoami      # who you are, which workspaces
npx wortwerk logout      # revokes the token and forgets it
```

You can see and revoke CLI sessions under **Account & API** in the app. They are named after your computer.

## Set up a project from a folder

Run `init` at the root of your repository:

```sh
npx wortwerk init
```

`init` inspects the git checkout, detects a GitHub or Bitbucket remote, finds translation files such as `locales/en.json`, `en/messages.yml` or `messages.en.po`, and suggests matching `%locale%` patterns and locales. It then opens a browser where you can sign up or sign in, confirm the project, choose a workspace and authorize the repository. The first repository pull starts as soon as setup is complete.

Use `--source-locale`, `--locales`, `--file`, `--repo`, or `--branch` to override a suggestion. `--no-open` prints the setup URL without launching a browser, and `--no-repo` creates a standalone project. To link directly to an existing project, sign in first and use `npx wortwerk init --project <project-id>`.

The result is a `wortwerk.json`, which you commit:

```json
{
  "project": "5f0c1d1e-8a4e-4c55-9b7e-2f2d3c1a9e10",
  "sourceLocale": "en",
  "locales": ["de", "en", "fr"],
  "files": [{ "path": "locales/%locale%.json", "format": "json" }]
}
```

`locales` and `files` are a copy of the project settings, refreshed by `init`, `pull` and `push`, so that `lint` also works offline.

## Commands

| Command                                         | What it does                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `pull [-l de,fr] [--source]`                    | downloads the translation files into the folder                                  |
| `push [-l de] [--overwrite]`                    | uploads local files: the source by default, translations with `-l`               |
| `sync [--export]`                               | pulls the repository into wortwerk, optionally exports a pull request afterwards |
| `status [-l de]`                                | progress per language                                                            |
| `check [--min 100] [--approved]`                | exits with code 1 when a language is below the threshold                         |
| `lint [--strict]`                               | checks local files offline for broken placeholders, markup and plurals           |
| `keys [search] [-l de] [--status untranslated]` | lists keys                                                                       |
| `translate <key> [value] -l de`                 | shows a key in all languages, or sets one translation                            |
| `mt <locale>`                                   | machine-translates all untranslated keys of a language (paid plans)              |
| `open`                                          | opens the project in the browser                                                 |

`push`, `sync` and `mt` wait until the job finished and print its result. Add `--no-wait` to return right away.

### Projects with a repository

For a connected project, keys come from the repository, so `push` refuses to upload source files. Commit them and let the webhook (or `wortwerk sync`) pick them up. `pull` is still useful: it writes the latest translations into your working copy, with locale aliases applied, before the wortwerk pull request is merged.

### Projects without a repository

`push` uploads the source file and creates or updates keys, `push -l de` uploads German translations (existing translations are only replaced with `--overwrite`), and `pull` downloads the results.

## Check files offline

```sh
npx wortwerk lint
```

`lint` compares every local translation with its source text: valid ICU syntax, the same placeholders, the same markup, and every plural form the language needs. Keys that only exist in a translation file are reported as warnings. The exit code is 1 when there are errors (or warnings, with `--strict`), so it works as a pre-commit hook or CI step.

```text
src/locales/de.json
  error greeting placeholders changed (name → nme)
1 file checked: 1 error, 0 warnings
```

## Use it in CI

Create a **project token** in the project settings under _CI tokens_ and store it as a secret named `WORTWERK_TOKEN`. Project tokens can read their project and start syncs, nothing else. The CLI picks the token up from the environment, together with the project from `wortwerk.json`.

GitHub Actions example: sync after every merge to `main` and fail pull requests whose translations are incomplete:

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

| Variable         | Purpose                                               |
| ---------------- | ----------------------------------------------------- |
| `WORTWERK_TOKEN` | personal or project token, overrides the stored login |
| `WORTWERK_HOST`  | server URL, for self-hosted installations             |
| `BROWSER=none`   | don't open a browser during `login` or `init`         |
| `DEBUG=1`        | print stack traces on errors                          |
