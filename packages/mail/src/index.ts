import nodemailer from 'nodemailer'

export type Mail = {
  to: string
  subject: string
  text: string
  html?: string
}

export interface Mailer {
  send(mail: Mail): Promise<void>
}

export class ConsoleMailer implements Mailer {
  async send(mail: Mail) {
    console.info(`[mail] to=${mail.to} subject=${JSON.stringify(mail.subject)}\n${mail.text}`)
  }
}

export class SmtpMailer implements Mailer {
  #client: nodemailer.Transporter
  #from: string

  constructor(server: string, email: string, password: string) {
    this.#client = nodemailer.createTransport({
      host: server,
      port: 587,
      secure: false,
      auth: { user: email, pass: password },
    })
    this.#from = email
  }

  async send(mail: Mail) {
    await this.#client.sendMail({ from: this.#from, ...mail })
  }
}

export function createMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  if (env.MAIL_DRIVER === 'smtp') {
    if (!env.SMTP_SERVER || !env.SMTP_EMAIL || !env.SMTP_PASSWORD) {
      throw new Error('SMTP_SERVER, SMTP_EMAIL and SMTP_PASSWORD are required')
    }
    return new SmtpMailer(env.SMTP_SERVER, env.SMTP_EMAIL, env.SMTP_PASSWORD)
  }
  return new ConsoleMailer()
}

export * from './templates.ts'
