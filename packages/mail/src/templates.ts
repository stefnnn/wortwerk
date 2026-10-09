import type { Mail } from './index.ts'

export type MailLocale = 'en' | 'de'

const colors = {
  page: '#f7f9f8',
  card: '#ffffff',
  border: '#dfe4e2',
  text: '#1a211e',
  muted: '#5f6563',
  accent: '#29a383',
  accentText: '#ffffff',
}

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

const chrome = {
  en: {
    fallback: 'If the button does not work, copy this link into your browser:',
    footer: 'Translation management that speaks git · Made in Switzerland',
    ignore: 'If you did not expect this email, you can safely ignore it.',
  },
  de: {
    fallback: 'Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:',
    footer: 'Übersetzungsmanagement, das git spricht · Made in Switzerland',
    ignore: 'Falls du diese E-Mail nicht erwartet hast, kannst du sie ignorieren.',
  },
}

const copy = {
  magicLink: {
    en: {
      subject: 'Sign in to wortwerk',
      heading: 'Sign in to wortwerk',
      body: 'Click the button below to sign in. The link expires in 5 minutes and can only be used once.',
      action: 'Sign in',
    },
    de: {
      subject: 'Bei wortwerk anmelden',
      heading: 'Bei wortwerk anmelden',
      body: 'Klicke auf den Button, um dich anzumelden. Der Link ist 5 Minuten gültig und nur einmal verwendbar.',
      action: 'Anmelden',
    },
  },
  noAccount: {
    en: {
      subject: 'Sign in to wortwerk',
      heading: 'No account yet',
      body: 'Someone asked for a sign-in link for this address, but there is no wortwerk account for it. Create one to get started.',
      action: 'Create an account',
    },
    de: {
      subject: 'Bei wortwerk anmelden',
      heading: 'Noch kein Konto',
      body: 'Für diese Adresse wurde ein Anmeldelink angefordert, es gibt aber noch kein wortwerk-Konto dazu. Erstelle eines, um loszulegen.',
      action: 'Konto erstellen',
    },
  },
  verification: {
    en: {
      subject: 'Confirm your wortwerk account',
      heading: 'Confirm your email address',
      body: 'Confirm this email address to finish creating your wortwerk account.',
      action: 'Confirm email',
    },
    de: {
      subject: 'Bestätige dein wortwerk-Konto',
      heading: 'Bestätige deine E-Mail-Adresse',
      body: 'Bestätige diese E-Mail-Adresse, um dein wortwerk-Konto fertig einzurichten.',
      action: 'E-Mail bestätigen',
    },
  },
  invitation: {
    en: {
      subject: (team: string) => `You're invited to ${team} on wortwerk`,
      heading: (team: string) => `Join ${team}`,
      body: (inviter: string, team: string) =>
        `${inviter} invited you to join ${team} on wortwerk, where your team manages its translations.`,
      action: 'Accept invitation',
    },
    de: {
      subject: (team: string) => `Einladung zu ${team} auf wortwerk`,
      heading: (team: string) => `${team} beitreten`,
      body: (inviter: string, team: string) =>
        `${inviter} hat dich zu ${team} auf wortwerk eingeladen, wo dein Team seine Übersetzungen verwaltet.`,
      action: 'Einladung annehmen',
    },
  },
}

type Content = { heading: string; body: string; action: string; url: string; locale: MailLocale }

export function renderMail({ heading, body, action, url, locale }: Content) {
  const c = chrome[locale]
  const origin = new URL(url).origin
  const e = escapeHtml
  const text = `${heading}\n\n${body}\n\n${action}: ${url}\n\n${c.ignore}\n\n-- \nwortwerk · ${origin}`
  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${e(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${colors.page};">
<div style="display:none;max-height:0;overflow:hidden;">${e(body)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.page};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="padding:0 4px 24px;">
<a href="${e(origin)}" style="text-decoration:none;color:${colors.text};font:600 18px/24px ${font};">
<img src="${e(origin)}/email-logo.png" width="24" height="24" alt="" style="vertical-align:middle;border:0;border-radius:6px;margin-right:8px;">wortwerk</a>
</td></tr>
<tr><td style="background:${colors.card};border:1px solid ${colors.border};border-radius:12px;padding:36px 32px;">
<h1 style="margin:0 0 12px;color:${colors.text};font:600 22px/30px ${font};letter-spacing:-0.01em;">${e(heading)}</h1>
<p style="margin:0 0 28px;color:${colors.muted};font:400 15px/24px ${font};">${e(body)}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background:${colors.accent};border-radius:8px;">
<a href="${e(url)}" style="display:inline-block;padding:12px 22px;color:${colors.accentText};font:600 15px/20px ${font};text-decoration:none;">${e(action)}</a>
</td></tr></table>
<p style="margin:32px 0 6px;color:${colors.muted};font:400 13px/20px ${font};">${e(c.fallback)}</p>
<p style="margin:0;font:400 13px/20px ${font};word-break:break-all;"><a href="${e(url)}" style="color:${colors.accent};">${e(url)}</a></p>
</td></tr>
<tr><td style="padding:24px 4px 0;color:${colors.muted};font:400 12px/18px ${font};">
${e(c.ignore)}<br>${e(c.footer)}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
  return { text, html }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

export function magicLinkMail(to: string, url: string, locale: MailLocale = 'en'): Mail {
  const c = copy.magicLink[locale]
  return { to, subject: c.subject, ...renderMail({ ...c, url, locale }) }
}

export function noAccountMail(to: string, signUpUrl: string, locale: MailLocale = 'en'): Mail {
  const c = copy.noAccount[locale]
  return { to, subject: c.subject, ...renderMail({ ...c, url: signUpUrl, locale }) }
}

export function verificationMail(to: string, url: string, locale: MailLocale = 'en'): Mail {
  const c = copy.verification[locale]
  return { to, subject: c.subject, ...renderMail({ ...c, url, locale }) }
}

export function invitationMail(
  to: string,
  url: string,
  { inviter, team }: { inviter: string; team: string },
  locale: MailLocale = 'en',
): Mail {
  const c = copy.invitation[locale]
  return {
    to,
    subject: c.subject(team),
    ...renderMail({ heading: c.heading(team), body: c.body(inviter, team), action: c.action, url, locale }),
  }
}

export function mailLocale(headers: Headers | undefined): MailLocale {
  const referer = headers?.get('referer')
  if (referer) {
    const path = URL.parse(referer)?.pathname
    if (path) return path === '/de' || path.startsWith('/de/') ? 'de' : 'en'
  }
  const cookie = headers?.get('cookie')?.match(/(?:^|;\s*)PARAGLIDE_LOCALE=(\w+)/)?.[1]
  if (cookie === 'de' || cookie === 'en') return cookie
  return headers?.get('accept-language')?.toLowerCase().startsWith('de') ? 'de' : 'en'
}
