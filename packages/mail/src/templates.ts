import type { Mail } from './index.ts'

export type MailLocale = 'en' | 'de'

const copy = {
  magicLink: {
    en: { subject: 'Sign in to wortwerk', body: 'Use this link to sign in. It expires in 5 minutes.' },
    de: {
      subject: 'Bei wortwerk anmelden',
      body: 'Mit diesem Link meldest du dich an. Er ist 5 Minuten gültig.',
    },
  },
  invitation: {
    en: {
      subject: (team: string) => `You're invited to ${team} on wortwerk`,
      body: (inviter: string, team: string) => `${inviter} invited you to join ${team} on wortwerk.`,
    },
    de: {
      subject: (team: string) => `Einladung zu ${team} auf wortwerk`,
      body: (inviter: string, team: string) => `${inviter} hat dich zu ${team} auf wortwerk eingeladen.`,
    },
  },
}

function layout(paragraph: string, url: string) {
  const text = `${paragraph}\n\n${url}`
  const html = `<p>${escapeHtml(paragraph)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`
  return { text, html }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

export function magicLinkMail(to: string, url: string, locale: MailLocale = 'en'): Mail {
  const c = copy.magicLink[locale]
  return { to, subject: c.subject, ...layout(c.body, url) }
}

export function invitationMail(
  to: string,
  url: string,
  { inviter, team }: { inviter: string; team: string },
  locale: MailLocale = 'en',
): Mail {
  const c = copy.invitation[locale]
  return { to, subject: c.subject(team), ...layout(c.body(inviter, team), url) }
}
