# Product analytics

Pug is initialized in the browser only, for production builds served at `wortwerk.li`.
Local development, previews and self-hosted installations send nothing. The public
key and project ID are in `apps/web/src/lib/analytics.ts`. No server key is needed
for this integration; `PUG_API_KEY` can remain reserved for future server usage and
must never be exposed via a `VITE_` variable.

Anonymous visits use Pug's cookieless mode. Signed-in sessions identify by the
stable user ID, with name/email and active workspace ID/name/slug, plan and role.
Signing out resets the identity and returns to cookieless mode. This follows Pug's
account-session integration model; there is no additional consent banner.

Page views are captured once per resolved router path, after identity/workspace
context is set. Generic click, scroll and form capture is disabled. Query strings, fragments, invitation tokens
and page titles are stripped. Translation contents and search terms are never
sent. Feature events fire after successful actions (queued means accepted for
background processing, not completed).

| Event                            | Properties                                 | Product question                                                 |
| -------------------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `page_view`                      | Pug page metadata, `surface`               | Which public pages and app screens get used?                     |
| `settings_opened`                | `scope`                                    | How often do people reach workspace/project configuration?       |
| `auto_translate_changed`         | `project_id`, `enabled`                    | Do people keep automatic translation enabled?                    |
| `machine_translation_generated`  | `project_id`, `locale`                     | How useful is per-key machine translation?                       |
| `machine_translation_queued`     | `project_id`, `locale`, `count`            | How often do people request bulk translation, and at what scale? |
| `translation_suggestion_applied` | `locale`, `score`                          | Are translation memory suggestions useful?                       |
| `translation_saved`              | `project_id`, `locale`, `source`, `status` | Are people editing source wording, translating, or reviewing?    |
| `translation_status_changed`     | `project_id`, `locale`, `status`, `count`  | How much bulk review work happens?                               |

All events include `surface` (`website` or `app`) and, when signed in, current
account/workspace context. These are UI usage events, not an audit log: browsers
can block or lose them. Automatic worker runs and CLI/API actions are excluded.
There are no tickets or keyword suggestion workflows in wortwerk currently.
Settings visits can also be derived from page views. Enabling auto-translate
measures preference; it does not imply an automatic worker run occurred.

After deployment, check Pug's Live view: visit a public page, sign in, switch
workspaces, generate a translation, apply a memory suggestion and sign out.
Check that workspace/plan attribution changes and subsequent anonymous visits
have no account properties. Do not enable analytics locally just to test it.

SDK reference: https://docs.pug.sh/sdks/web/
