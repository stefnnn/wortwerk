# wortwerk

Command line client for [wortwerk](https://wortwerk.li), translation management with git flow.

```sh
npx wortwerk login      # sign in through your browser
npx wortwerk init       # detect the project, then finish account and repository setup in the browser
npx wortwerk pull       # download translation files
npx wortwerk lint       # check placeholders, markup and plurals offline
```

| Command                           | What it does                                                      |
| --------------------------------- | ----------------------------------------------------------------- |
| `login` / `logout` / `whoami`     | device-flow sign-in, token stored in `~/.config/wortwerk`         |
| `init`                            | create or link a project, detect files/locales and connect git    |
| `pull [-l de,fr] [--source]`      | download translation files                                        |
| `push [-l de] [--overwrite]`      | upload the source file, or translations with `-l`                 |
| `sync [--export]`                 | pull the repository into wortwerk, optionally open a pull request |
| `status`, `check [--min 100]`     | progress per language, fail CI below a threshold                  |
| `lint [--strict]`                 | offline ICU / placeholder / markup / plural checks                |
| `keys`, `translate`, `mt`, `open` | search keys, set translations, machine-translate, open the app    |

In CI, set `WORTWERK_TOKEN` to a project token from the project settings.

Requires Node.js 22 or newer. Documentation: <https://wortwerk.li/docs/cli>

`init` recognizes GitHub and Bitbucket remotes, locale file patterns, and likely source and target locales.
Use `--source-locale`, `--locales`, `--file`, `--repo`, or `--branch` to override its suggestions. The browser
handles signup, confirmation, workspace creation, and provider authorization. Use `--no-open` on remote shells.
