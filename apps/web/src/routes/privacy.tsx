import { createFileRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { MarketingLayout, PageHeading } from '#/components/marketing/site.tsx'
import { m } from '#/paraglide/messages.js'
import { getLocale } from '#/paraglide/runtime.js'

const contact = 'contact@wortwerk.li'
const updated = '2026-10-06'

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [{ title: `wortwerk — ${m.privacy_title()}` }, { name: 'description', content: m.privacy_intro() }],
  }),
  component: PrivacyPage,
})

type Section = { title: string; body: ReactNode }

const en: Section[] = [
  {
    title: 'Contact',
    body: (
      <p>
        For any privacy question about wortwerk.li write to <Mail />. We process data in accordance with the
        Swiss Federal Act on Data Protection (FADP) and, where applicable, the EU General Data Protection
        Regulation (GDPR).
      </p>
    ),
  },
  {
    title: 'What we process',
    body: (
      <ul>
        <li>
          <strong>Account data:</strong> name, email address and the workspaces you belong to.
        </li>
        <li>
          <strong>Workspace content:</strong> keys, translations, revisions, comments and screenshots that you
          or your team add, plus files read from connected repositories.
        </li>
        <li>
          <strong>Repository access:</strong> tokens for GitHub or Bitbucket, stored encrypted and used only
          to read locale files and open pull requests.
        </li>
        <li>
          <strong>Technical data:</strong> session information and short-lived application logs needed to
          operate and secure the service. We do not keep web server access logs.
        </li>
      </ul>
    ),
  },
  {
    title: 'Why we process it',
    body: (
      <p>
        Only to provide wortwerk: to sign you in, run your projects, sync with your repositories, send emails
        you asked for (sign-in links, invitations) and keep the service secure. We do not sell data, do not
        show ads and do not use your content to train models.
      </p>
    ),
  },
  {
    title: 'Service providers',
    body: (
      <ul>
        <li>
          Our server and database are <strong>hosted in Zurich</strong>, Switzerland.
        </li>
        <li>
          <strong>Resend</strong> delivers sign-in and invitation emails.
        </li>
        <li>
          <strong>OpenRouter</strong> and the model provider it routes to receive source texts when someone on
          the Agency plan starts a machine translation. Nothing is sent otherwise.
        </li>
        <li>
          <strong>GitHub</strong> and <strong>Bitbucket</strong> when you connect a repository.
        </li>
      </ul>
    ),
  },
  {
    title: 'International transfers',
    body: (
      <p>
        Some of these providers process data outside Switzerland, including in the United States. Where this
        happens we rely on adequacy decisions or standard contractual clauses.
      </p>
    ),
  },
  {
    title: 'Cookies and local storage',
    body: (
      <p>
        We use a session cookie to keep you signed in and a cookie that remembers your language. Your theme
        choice is stored in your browser. There are no analytics, tracking or advertising cookies.
      </p>
    ),
  },
  {
    title: 'How long we keep data',
    body: (
      <p>
        Account and workspace data are kept as long as your account exists. When you delete content or ask us
        to delete your account, it is removed from the live database right away and from backups within 14
        days.
      </p>
    ),
  },
  {
    title: 'Your rights',
    body: (
      <p>
        You can ask for access to, correction of, export of or deletion of your personal data and object to
        its processing by writing to <Mail />. You can also lodge a complaint with the Federal Data Protection
        and Information Commissioner (FDPIC) or your local supervisory authority.
      </p>
    ),
  },
  {
    title: 'Changes',
    body: (
      <p>
        If we change how we process data, we update this page and, for significant changes, let you know by
        email.
      </p>
    ),
  },
]

const de: Section[] = [
  {
    title: 'Kontakt',
    body: (
      <p>
        Fragen zum Datenschutz auf wortwerk.li richtest du an <Mail />. Wir bearbeiten Daten nach dem
        Schweizer Datenschutzgesetz (DSG) und, wo anwendbar, nach der EU-Datenschutz-Grundverordnung (DSGVO).
      </p>
    ),
  },
  {
    title: 'Welche Daten wir bearbeiten',
    body: (
      <ul>
        <li>
          <strong>Kontodaten:</strong> Name, E-Mail-Adresse und die Workspaces, denen du angehörst.
        </li>
        <li>
          <strong>Workspace-Inhalte:</strong> Keys, Übersetzungen, Revisionen, Kommentare und Screenshots, die
          du oder dein Team erfassen, sowie Dateien aus verbundenen Repositories.
        </li>
        <li>
          <strong>Repository-Zugriff:</strong> Tokens für GitHub oder Bitbucket, verschlüsselt gespeichert und
          nur zum Lesen von Sprachdateien und Öffnen von Pull Requests verwendet.
        </li>
        <li>
          <strong>Technische Daten:</strong> Sitzungsinformationen und kurzlebige Anwendungslogs, die für
          Betrieb und Sicherheit nötig sind. Zugriffslogs des Webservers speichern wir nicht.
        </li>
      </ul>
    ),
  },
  {
    title: 'Wozu wir sie bearbeiten',
    body: (
      <p>
        Ausschliesslich, um wortwerk bereitzustellen: für die Anmeldung, deine Projekte, die Synchronisation
        mit deinen Repositories, E-Mails, die du angefordert hast (Anmeldelinks, Einladungen), und die
        Sicherheit des Dienstes. Wir verkaufen keine Daten, zeigen keine Werbung und trainieren keine Modelle
        mit deinen Inhalten.
      </p>
    ),
  },
  {
    title: 'Dienstleister',
    body: (
      <ul>
        <li>
          Server und Datenbank werden <strong>in Zürich</strong> gehostet.
        </li>
        <li>
          <strong>Resend</strong> versendet Anmelde- und Einladungs-E-Mails.
        </li>
        <li>
          <strong>OpenRouter</strong> und der dort gewählte Modellanbieter erhalten Quelltexte, wenn jemand im
          Agency-Plan eine maschinelle Übersetzung startet. Sonst wird nichts übermittelt.
        </li>
        <li>
          <strong>GitHub</strong> und <strong>Bitbucket</strong>, wenn du ein Repository verbindest.
        </li>
      </ul>
    ),
  },
  {
    title: 'Übermittlung ins Ausland',
    body: (
      <p>
        Einige dieser Dienstleister bearbeiten Daten ausserhalb der Schweiz, auch in den USA. In diesen Fällen
        stützen wir uns auf Angemessenheitsbeschlüsse oder Standardvertragsklauseln.
      </p>
    ),
  },
  {
    title: 'Cookies und lokaler Speicher',
    body: (
      <p>
        Wir verwenden ein Sitzungscookie, damit du angemeldet bleibst, und ein Cookie für deine Sprache. Deine
        Theme-Wahl wird in deinem Browser gespeichert. Es gibt keine Analyse-, Tracking- oder Werbe-Cookies.
      </p>
    ),
  },
  {
    title: 'Aufbewahrung',
    body: (
      <p>
        Konto- und Workspace-Daten bewahren wir auf, solange dein Konto besteht. Löschst du Inhalte oder
        bittest du uns, dein Konto zu löschen, werden sie sofort aus der Datenbank und innert 14 Tagen aus den
        Backups entfernt.
      </p>
    ),
  },
  {
    title: 'Deine Rechte',
    body: (
      <p>
        Du kannst Auskunft, Berichtigung, Herausgabe oder Löschung deiner Personendaten verlangen und der
        Bearbeitung widersprechen. Schreib dazu an <Mail />. Zudem kannst du dich beim Eidgenössischen
        Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB) oder bei deiner zuständigen Aufsichtsbehörde
        beschweren.
      </p>
    ),
  },
  {
    title: 'Änderungen',
    body: (
      <p>
        Ändern wir die Bearbeitung von Daten, passen wir diese Seite an und informieren dich bei wesentlichen
        Änderungen per E-Mail.
      </p>
    ),
  },
]

function Mail() {
  return (
    <a href={`mailto:${contact}`} className="text-primary underline-offset-4 hover:underline">
      {contact}
    </a>
  )
}

function PrivacyPage() {
  const sections = getLocale() === 'de' ? de : en
  return (
    <MarketingLayout>
      <PageHeading title={m.privacy_title()}>
        <p>{m.privacy_intro()}</p>
      </PageHeading>
      <div className="mx-auto max-w-3xl space-y-10 px-6 pb-24">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>
            <div className="text-muted-foreground [&_strong]:text-foreground mt-3 leading-7 [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
              {section.body}
            </div>
          </section>
        ))}
        <p className="text-muted-foreground border-t pt-6 text-sm">{m.privacy_updated({ date: updated })}</p>
      </div>
    </MarketingLayout>
  )
}
