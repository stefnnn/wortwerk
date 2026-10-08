# wortwerk

Command line client for [wortwerk](https://wortwerk.li), translation management with git flow.

```sh
npx wortwerk login      # sign in through your browser
npx wortwerk init       # link this folder to a project, writes wortwerk.json
npx wortwerk pull       # download translation files
npx wortwerk lint       # check placeholders, markup and plurals offline
```

| Command                           | What it does                                                      |
| --------------------------------- | ----------------------------------------------------------------- |
| `login` / `logout` / `whoami`     | device-flow sign-in, token stored in `~/.config/wortwerk`         |
| `init`                            | link a folder to a project, detect `%locale%` file patterns       |
| `pull [-l de,fr] [--source]`      | download translation files                                        |
| `push [-l de] [--overwrite]`      | upload the source file, or translations with `-l`                 |
| `sync [--export]`                 | pull the repository into wortwerk, optionally open a pull request |
| `status`, `check [--min 100]`     | progress per language, fail CI below a threshold                  |
| `lint [--strict]`                 | offline ICU / placeholder / markup / plural checks                |
| `keys`, `translate`, `mt`, `open` | search keys, set translations, machine-translate, open the app    |

In CI, set `WORTWERK_TOKEN` to a project token from the project settings.

Requires Node.js 22 or newer. Documentation: <https://wortwerk.li/docs/cli>
