---
title: Machine translation
description: How auto-translate fills in new keys with Claude, and how the needs review status keeps a person in charge.
---

wortwerk machine-translates with the latest Claude models from Anthropic. You can use it in three ways:

- **Auto-translate new keys**: every key a developer adds is translated into all languages right after the sync, without anyone opening wortwerk.
- **Pre-translate**: fill in everything that is still missing with **Translate all missing** on the project overview, or only the keys you select in the editor.
- **Per key**: click **Machine translate** while editing a single translation and adjust the suggestion before saving.

Machine translation is included in the Project and Agency plans at no extra cost, subject to fair use.

## Auto-translate new keys

The setting lives in the project **Settings** under **General** and is on by default. With it, the loop from commit to merged translations runs on its own:

1. A developer adds `checkout.title` to the source file and pushes to the tracked branch.
2. wortwerk syncs, creates the key and machine-translates it into every target language.
3. With **Export automatically** on, the translations go out in the wortwerk pull request a minute later.

A feature branch merged into the tracked branch therefore comes back with its translations, and nothing is left empty in the meantime.

What counts as new:

- Only keys that are **new in a sync** or a file import are auto-translated, and only in languages that don't have a translation yet. Existing translations are never overwritten.
- The **first sync** of a project is not auto-translated. Its missing translations are your backlog: pre-translate them when you are ready.
- A sync that adds **more than 500 keys** at once (a new file pattern, a mass rename) is skipped and noted in the sync history. Pre-translate those keys instead.
- Feature branches are not tracked. Their keys are translated once they reach the tracked branch.

## Needs review

Every machine translation is saved with the status **Needs review**, whether it came from auto-translate, a pre-translation or a single key. The status says: this text has a value and ships with the next export, but no person has confirmed it yet.

| Status       | Meaning                                                                          |
| ------------ | -------------------------------------------------------------------------------- |
| Untranslated | No translation yet                                                               |
| Translated   | Has a value, not reviewed                                                        |
| Needs review | The source text changed, or the value came from an import or machine translation |
| Approved     | Reviewed and final                                                               |

To review, filter the editor by **Needs review**, read each translation in its context (key description, comments, screenshots) and either fix it or click **Approve**. You can also select several keys and change their status at once. The history of each translation records that its first version came from machine translation.

If the source text changes later, approved translations move back to _needs review_ as well, so the review list always shows what needs a look.

## Better results with context

Claude sees more than the bare text. Each request includes:

- the **key name** and its **description**, as context only,
- the **project context** from **Settings → Machine translation instructions**, for example who the product is for and what tone it uses,
- the **instructions per language**, for example "always use informal language" or "use Swiss spelling (ss instead of ß)".

The more specific the project context, the closer the first draft gets to your voice.

## Placeholders and plurals stay intact

Messages are sent as ICU MessageFormat with their placeholders protected. Every result is checked before it is saved: placeholders like `{name}`, plural and select forms (including the plural categories the target language needs) and markup must match the source. A translation that fails the check is rejected and the key stays untranslated, so broken messages never end up in your repository.

## Plans

Auto-translate, pre-translation and per-key machine translation are available on the Project and Agency plans. On the Free plan the setting is off and can't be turned on.
