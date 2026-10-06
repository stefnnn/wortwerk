export type Localized = { en: string; de: string }

export const compareRows = ['focus', 'git', 'formats', 'pricing', 'hosting', 'mt', 'origin'] as const
export type CompareRow = (typeof compareRows)[number]

export type Competitor = {
  slug: string
  name: string
  summary: Localized
  theyShine: Localized[]
  weDiffer: Localized[]
  values: Record<CompareRow, Localized>
}

export const wortwerkValues: Record<CompareRow, Localized> = {
  focus: {
    en: 'Developer teams that keep their strings in git',
    de: 'Entwicklerteams, deren Texte in git leben',
  },
  git: {
    en: 'Source strings from the repo, translations back as a pull request with minimal diffs',
    de: 'Quelltexte aus dem Repo, Übersetzungen zurück als Pull Request mit minimalen Diffs',
  },
  formats: {
    en: 'JSON, YAML and gettext PO, structure preserved',
    de: 'JSON, YAML und gettext PO, Struktur bleibt erhalten',
  },
  pricing: {
    en: 'Free for 1 project and 1,000 keys, flat yearly plans from CHF 450',
    de: 'Gratis für 1 Projekt und 1000 Keys, Pauschalpläne ab CHF 450 / Jahr',
  },
  hosting: { en: 'Hosted service', de: 'Gehosteter Dienst' },
  mt: {
    en: 'AI pre-translation on the Agency plan, placeholders validated',
    de: 'KI-Vorübersetzung im Agency-Plan, Platzhalter werden geprüft',
  },
  origin: { en: 'Switzerland', de: 'Schweiz' },
}

export const competitors: Competitor[] = [
  {
    slug: 'lokalise',
    name: 'Lokalise',
    summary: {
      en: 'Lokalise is a broad localization platform for product, marketing and support content, with integrations for design tools, over-the-air SDKs for mobile apps and a large catalogue of connectors. wortwerk does one thing: keep the translations of a code repository in sync through pull requests.',
      de: 'Lokalise ist eine breite Lokalisierungsplattform für Produkt-, Marketing- und Support-Inhalte, mit Integrationen für Design-Tools, Over-the-Air-SDKs für Mobile-Apps und einem grossen Katalog an Konnektoren. wortwerk macht eine Sache: die Übersetzungen eines Code-Repositorys per Pull Request synchron halten.',
    },
    theyShine: [
      { en: 'Design tool plugins such as Figma', de: 'Plugins für Design-Tools wie Figma' },
      { en: 'Over-the-air updates for iOS and Android', de: 'Over-the-Air-Updates für iOS und Android' },
      { en: 'Many file formats and integrations', de: 'Sehr viele Dateiformate und Integrationen' },
    ],
    weDiffer: [
      {
        en: 'Flat yearly prices instead of per-seat tiers',
        de: 'Pauschale Jahrespreise statt Stufen pro Sitzplatz',
      },
      {
        en: 'Git is the source of truth, no upload or download step',
        de: 'git ist die Quelle der Wahrheit, kein Hoch- oder Herunterladen',
      },
      {
        en: 'Small, focused editor without onboarding overhead',
        de: 'Kleiner, fokussierter Editor ohne Einarbeitungsaufwand',
      },
    ],
    values: {
      focus: {
        en: 'Product, marketing and support localization',
        de: 'Lokalisierung von Produkt, Marketing und Support',
      },
      git: {
        en: 'Integrations for GitHub, GitLab, Bitbucket and more',
        de: 'Integrationen für GitHub, GitLab, Bitbucket und weitere',
      },
      formats: { en: 'A large range of formats', de: 'Sehr viele Formate' },
      pricing: {
        en: 'Tiered subscriptions, enterprise on request',
        de: 'Abo-Stufen, Enterprise auf Anfrage',
      },
      hosting: { en: 'Hosted service', de: 'Gehosteter Dienst' },
      mt: { en: 'AI and machine translation engines', de: 'KI und maschinelle Übersetzung' },
      origin: { en: 'Latvia', de: 'Lettland' },
    },
  },
  {
    slug: 'crowdin',
    name: 'Crowdin',
    summary: {
      en: 'Crowdin is one of the largest localization platforms, with a marketplace of hundreds of apps and integrations and strong support for community translation of open-source projects. wortwerk is deliberately smaller: a git-first tool for teams who want translations to behave like code.',
      de: 'Crowdin ist eine der grössten Lokalisierungsplattformen, mit einem Marktplatz voller Apps und Integrationen und guter Unterstützung für Community-Übersetzungen von Open-Source-Projekten. wortwerk ist bewusst kleiner: ein git-zentriertes Werkzeug für Teams, die Übersetzungen wie Code behandeln wollen.',
    },
    theyShine: [
      { en: 'Huge integration marketplace', de: 'Riesiger Integrations-Marktplatz' },
      { en: 'Crowdsourced and community translation', de: 'Crowdsourcing und Community-Übersetzung' },
      { en: 'Free plans for open-source projects', de: 'Gratis-Pläne für Open-Source-Projekte' },
    ],
    weDiffer: [
      {
        en: 'Predictable price in CHF, no per-word or seat tiers',
        de: 'Planbarer Preis in CHF, keine Stufen nach Wörtern oder Sitzplätzen',
      },
      {
        en: 'Exports keep key order, nesting and comments',
        de: 'Exporte behalten Reihenfolge, Verschachtelung und Kommentare',
      },
      { en: 'Set up in the browser in a few minutes', de: 'In wenigen Minuten im Browser eingerichtet' },
    ],
    values: {
      focus: {
        en: 'All-round localization, including communities',
        de: 'Lokalisierung aller Art, inklusive Communities',
      },
      git: {
        en: 'Integrations for GitHub, GitLab, Bitbucket and Azure Repos',
        de: 'Integrationen für GitHub, GitLab, Bitbucket und Azure Repos',
      },
      formats: { en: 'A very large range of formats', de: 'Sehr viele Formate' },
      pricing: { en: 'Tiered subscriptions, free for open source', de: 'Abo-Stufen, gratis für Open Source' },
      hosting: { en: 'Hosted service, Enterprise edition', de: 'Gehosteter Dienst, Enterprise-Edition' },
      mt: {
        en: 'AI and many machine translation engines',
        de: 'KI und viele maschinelle Übersetzungsdienste',
      },
      origin: { en: 'Estonia', de: 'Estland' },
    },
  },
  {
    slug: 'phrase',
    name: 'Phrase',
    summary: {
      en: 'Phrase is an enterprise localization suite that combines software string management (Phrase Strings) with a full translation management system for documents and agencies. wortwerk targets smaller teams that want the git part, done well, without the suite.',
      de: 'Phrase ist eine Enterprise-Lokalisierungssuite, die die Verwaltung von Software-Texten (Phrase Strings) mit einem vollständigen Übersetzungsmanagementsystem für Dokumente und Agenturen verbindet. wortwerk richtet sich an kleinere Teams, die den git-Teil gut gelöst haben wollen, ohne ganze Suite.',
    },
    theyShine: [
      {
        en: 'Document and CAT workflows for professional translators',
        de: 'Dokument- und CAT-Workflows für professionelle Übersetzer',
      },
      { en: 'Enterprise features and compliance', de: 'Enterprise-Funktionen und Compliance' },
      { en: 'Workflow automation across many teams', de: 'Workflow-Automatisierung über viele Teams hinweg' },
    ],
    weDiffer: [
      {
        en: 'No sales call, start for free in a minute',
        de: 'Kein Verkaufsgespräch, in einer Minute gratis starten',
      },
      {
        en: 'One product, flat yearly prices, no add-ons',
        de: 'Ein Produkt, pauschale Jahrespreise, keine Zusatzmodule',
      },
      { en: 'Pull requests with clean, reviewable diffs', de: 'Pull Requests mit sauberen, prüfbaren Diffs' },
    ],
    values: {
      focus: { en: 'Enterprise localization suite', de: 'Enterprise-Lokalisierungssuite' },
      git: {
        en: 'Repository sync for GitHub, GitLab and Bitbucket',
        de: 'Repository-Sync für GitHub, GitLab und Bitbucket',
      },
      formats: {
        en: 'A large range of software and document formats',
        de: 'Sehr viele Software- und Dokumentformate',
      },
      pricing: {
        en: 'Tiered subscriptions, enterprise on request',
        de: 'Abo-Stufen, Enterprise auf Anfrage',
      },
      hosting: { en: 'Hosted service', de: 'Gehosteter Dienst' },
      mt: {
        en: 'AI, machine translation and quality estimation',
        de: 'KI, maschinelle Übersetzung und Qualitätsschätzung',
      },
      origin: { en: 'Germany / Czech Republic', de: 'Deutschland / Tschechien' },
    },
  },
  {
    slug: 'transifex',
    name: 'Transifex',
    summary: {
      en: 'Transifex localizes software and content, and with Transifex Native it can deliver strings to your app over the air instead of through files. wortwerk stays with files in your repository: translations are reviewed and merged like any other change.',
      de: 'Transifex lokalisiert Software und Inhalte und kann mit Transifex Native Texte direkt in die App ausliefern statt über Dateien. wortwerk bleibt bei Dateien im Repository: Übersetzungen werden geprüft und gemergt wie jede andere Änderung.',
    },
    theyShine: [
      {
        en: 'Over-the-air delivery with Transifex Native',
        de: 'Over-the-Air-Auslieferung mit Transifex Native',
      },
      { en: 'Website and content localization', de: 'Lokalisierung von Websites und Inhalten' },
      { en: 'Long track record with large customers', de: 'Lange Erfahrung mit grossen Kunden' },
    ],
    weDiffer: [
      {
        en: 'Translations stay versioned in your repo',
        de: 'Übersetzungen bleiben versioniert in deinem Repo',
      },
      { en: 'Flat price instead of word-based tiers', de: 'Pauschalpreis statt Stufen nach Wörtern' },
      { en: 'No SDK required in your app', de: 'Kein SDK in deiner App nötig' },
    ],
    values: {
      focus: { en: 'Software and content localization', de: 'Lokalisierung von Software und Inhalten' },
      git: { en: 'GitHub and GitLab integrations, CLI', de: 'GitHub- und GitLab-Integrationen, CLI' },
      formats: { en: 'A large range of formats', de: 'Sehr viele Formate' },
      pricing: { en: 'Tiered subscriptions', de: 'Abo-Stufen' },
      hosting: { en: 'Hosted service', de: 'Gehosteter Dienst' },
      mt: { en: 'AI and machine translation engines', de: 'KI und maschinelle Übersetzung' },
      origin: { en: 'USA / Greece', de: 'USA / Griechenland' },
    },
  },
  {
    slug: 'weblate',
    name: 'Weblate',
    summary: {
      en: 'Weblate is open-source and git-native as well: it commits translations directly into repositories and can be self-hosted. If you want to run the software yourself, Weblate is a great choice. wortwerk is a hosted service with a simpler setup and a more focused editor.',
      de: 'Weblate ist ebenfalls Open Source und git-nativ: Es committet Übersetzungen direkt in Repositories und lässt sich selbst hosten. Wer die Software selbst betreiben will, ist mit Weblate gut bedient. wortwerk ist ein gehosteter Dienst mit einfacherer Einrichtung und einem fokussierteren Editor.',
    },
    theyShine: [
      { en: 'Open source and self-hostable', de: 'Open Source und selbst hostbar' },
      { en: 'Many formats and quality checks', de: 'Viele Formate und Qualitätsprüfungen' },
      { en: 'Free hosting for libre projects', de: 'Gratis-Hosting für freie Projekte' },
    ],
    weDiffer: [
      {
        en: 'One branch, regenerated on every export, instead of a commit stream',
        de: 'Ein Branch, bei jedem Export neu erzeugt, statt eines Commit-Stroms',
      },
      {
        en: 'Connect a GitHub App or Bitbucket account in a few clicks',
        de: 'GitHub App oder Bitbucket-Konto mit wenigen Klicks verbinden',
      },
      {
        en: 'Lean interface for non-technical translators',
        de: 'Schlanke Oberfläche für nicht-technische Übersetzer',
      },
    ],
    values: {
      focus: { en: 'Open-source, git-based localization', de: 'Open-Source-Lokalisierung auf git-Basis' },
      git: {
        en: 'Native git: commits and pushes, merge requests',
        de: 'Natives git: Commits und Pushes, Merge Requests',
      },
      formats: { en: 'A large range of formats', de: 'Sehr viele Formate' },
      pricing: {
        en: 'Hosted plans by size, free for libre projects',
        de: 'Gehostete Pläne nach Grösse, gratis für freie Projekte',
      },
      hosting: { en: 'Open source (GPL), self-hostable', de: 'Open Source (GPL), selbst hostbar' },
      mt: { en: 'Many machine translation services', de: 'Viele maschinelle Übersetzungsdienste' },
      origin: { en: 'Czech Republic', de: 'Tschechien' },
    },
  },
  {
    slug: 'tolgee',
    name: 'Tolgee',
    summary: {
      en: 'Tolgee focuses on in-context translation: with its SDKs, translators edit strings directly inside the running app. It is open source and can be self-hosted. wortwerk needs no SDK, it works purely with the files in your repository.',
      de: 'Tolgee setzt auf In-Context-Übersetzung: Mit den SDKs bearbeiten Übersetzer Texte direkt in der laufenden App. Tolgee ist Open Source und lässt sich selbst hosten. wortwerk braucht kein SDK und arbeitet nur mit den Dateien in deinem Repository.',
    },
    theyShine: [
      { en: 'In-context editing inside your app', de: 'In-Context-Bearbeitung direkt in deiner App' },
      { en: 'Automatic screenshots via SDK', de: 'Automatische Screenshots per SDK' },
      { en: 'Open source and self-hostable', de: 'Open Source und selbst hostbar' },
    ],
    weDiffer: [
      { en: 'Nothing to install in your app', de: 'Nichts in deiner App zu installieren' },
      {
        en: 'Works with gettext and Rails YAML, not only JS stacks',
        de: 'Funktioniert mit gettext und Rails-YAML, nicht nur mit JS-Stacks',
      },
      { en: 'Pull requests instead of CLI pushes and pulls', de: 'Pull Requests statt CLI-Push und -Pull' },
    ],
    values: {
      focus: { en: 'In-context translation for web apps', de: 'In-Context-Übersetzung für Web-Apps' },
      git: { en: 'CLI and CI integration', de: 'CLI- und CI-Integration' },
      formats: { en: 'Common web and mobile formats', de: 'Gängige Web- und Mobile-Formate' },
      pricing: { en: 'Free tier, paid plans by size', de: 'Gratis-Stufe, bezahlte Pläne nach Grösse' },
      hosting: { en: 'Open source, self-hostable', de: 'Open Source, selbst hostbar' },
      mt: { en: 'AI and machine translation', de: 'KI und maschinelle Übersetzung' },
      origin: { en: 'Czech Republic', de: 'Tschechien' },
    },
  },
]

export function findCompetitor(slug: string) {
  return competitors.find((c) => c.slug === slug)
}
