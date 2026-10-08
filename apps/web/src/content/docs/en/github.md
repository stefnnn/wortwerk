---
title: Connect GitHub
description: Install the wortwerk GitHub App, link a repository to a project and get translations back as pull requests.
---

wortwerk connects to GitHub through a **GitHub App**. The app only gets access to the repositories you choose, and pushes reach wortwerk through the app's webhook, so there is nothing to configure in the repository itself.

## Install the app

1. In wortwerk, open **Settings → Git connections** and click **Connect GitHub**. (You can also start from a new project's setup page.)
2. GitHub asks where to install the app. Pick your personal account or an organisation.
3. Choose **Only select repositories** and pick the ones with translation files, or allow all repositories.
4. GitHub sends you back to wortwerk, which shows the connection with the account name.

Each connection can be used by every project in the workspace. Connect several accounts or organisations if your repositories are spread out.

> **Not an organisation owner?** GitHub then sends an installation _request_ to the owners. wortwerk shows "Installation requested" until one of them approves it. Afterwards, click **Connect GitHub** again to finish.

### What the app may do

| Permission                  | Why                                                         |
| --------------------------- | ----------------------------------------------------------- |
| Contents: read & write      | read translation files at a commit, write the export branch |
| Pull requests: read & write | open and update the translations pull request               |
| Metadata: read              | list repositories and branches                              |
| Push events                 | start a sync when the tracked branch changes                |

The app never pushes to your tracked branch. It only writes to its own export branch and opens a pull request from there.

## Link a repository to a project

Open the project, then **Settings → Repository** (or the setup page of a new project):

| Field                | Meaning                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Connection           | the GitHub account or organisation you connected                                                                                 |
| Repository           | the repository with the translation files                                                                                        |
| Tracked branch       | where developers merge, usually `main`. Defaults to the repository's default branch                                              |
| Export branch        | where wortwerk writes translations, `wortwerk/translations` by default. It is regenerated on every export, so don't commit to it |
| Locale aliases       | map project languages to file names, e.g. `de-CH=de` when the file is called `de.json`                                           |
| Export automatically | export a minute after translations stop changing, instead of only when you click **Export now**                                  |

Then add one **file pattern** per set of files, with `%locale%` where the language goes:

```text
locales/%locale%.json
packages/app/src/i18n/%locale%.ts
config/locales/%locale%.yml
```

Saving starts the first sync. It reads the source file of each pattern at the head of the tracked branch, creates the keys and imports translations that already exist in the repository (marked _needs review_).

## Day to day

- **Developers** push to the tracked branch as usual. New keys show up in wortwerk within seconds, changed source texts flag their translations for review, and removed keys become obsolete.
- **Translators** work in the editor.
- **Exports** create or update one pull request, _Update translations from wortwerk_, from the export branch into the tracked branch. Its description lists the source texts edited in wortwerk and the number of changed strings per language. Merge it like any other pull request. The next push then shows the project as _In sync_.

You can also start a sync with **Sync now**, or from CI with the [CLI](/docs/cli#use-it-in-ci) or the [API](/docs/api).

## Troubleshooting

- **"No translation files found"**: the file pattern doesn't match any file at the head of the tracked branch. Check the path and the locale aliases.
- **The repository is missing from the list**: the app is installed with _Only select repositories_. Add it on GitHub under _Settings → Applications → wortwerk → Configure_.
- **Branch protection**: wortwerk only writes to the export branch. If you protect `wortwerk/*`, allow the wortwerk app to force-push to it.
- **Disconnecting**: uninstalling the app on GitHub removes the connection in wortwerk too. Keys and translations stay in the project.

Read [How sync works](/docs/sync) for what exactly happens on each pull and export.
