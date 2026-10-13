---
title: Connect Bitbucket
description: Connect Bitbucket Cloud with OAuth, link a repository and receive translations as pull requests.
---

wortwerk connects to **Bitbucket Cloud** with OAuth. When you link a repository, wortwerk adds a webhook to it, so pushes reach wortwerk without further setup.

## Connect your account

1. In wortwerk, open **Settings → Git connections** and click **Connect Bitbucket**. (You can also start from a new project's setup page.)
2. Bitbucket asks you to grant wortwerk access. It requests:

| Permission               | Why                                             |
| ------------------------ | ----------------------------------------------- |
| Account: read            | show which account is connected                 |
| Repositories: write      | read translation files, write the export branch |
| Pull requests: write     | open and update the translations pull request   |
| Webhooks: read and write | add the push webhook to repositories you link   |

3. Bitbucket sends you back to wortwerk, which shows the connection with your account name.

The connection acts with your Bitbucket permissions and can be used by every project in the workspace.

## Link a repository to a project

Open the project, then **Settings → Repository**, choose the Bitbucket connection and the repository, and fill in the same fields as for GitHub: tracked branch, export branch (`wortwerk/translations` by default), locale aliases and automatic export. Then add the file patterns, e.g. `locales/%locale%.json`. The fields are explained in [Connect GitHub](/docs/github#link-a-repository-to-a-project).

When you save, wortwerk:

1. creates a **webhook** on the repository for push events, with its own signing secret,
2. starts the first sync from the head of the tracked branch.

> **"Saved, but the webhook could not be created"** means your Bitbucket user may not manage webhooks of that repository (repository admin rights are needed). Syncing works anyway with **Sync now** or from CI. Ask an admin to connect their account, or save the repository again once you have the rights.

## How exports differ from GitHub

Bitbucket's API can't force-push. Instead of regenerating the export branch from the tracked branch on every export, wortwerk adds a new commit on top of the export branch's previous head. The pull request content is the same: the current translations and the source text edits, compared to the tracked branch.

If the export branch gets out of hand, for example after a long-lived pull request, merge or decline the pull request and delete the branch. The next export creates it again from the tracked branch.

## Disconnecting

**Disconnect** in the project removes the webhook from the repository. Removing the connection in **Settings → Git connections** unlinks it from all projects. Keys and translations stay in wortwerk.

Read [How sync works](/docs/sync) for what happens on each pull and export.
