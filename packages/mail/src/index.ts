import { Resend } from 'resend'

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

export class ResendMailer implements Mailer {
  #client: Resend
  #from: string

  constructor(apiKey: string, from: string) {
    this.#client = new Resend(apiKey)
    this.#from = from
  }

  async send(mail: Mail) {
    const { error } = await this.#client.emails.send({ from: this.#from, ...mail })
    if (error) throw new Error(`resend: ${error.message}`)
  }
}

export function createMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  if (env.MAIL_DRIVER === 'resend') {
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) throw new Error('RESEND_API_KEY and MAIL_FROM are required')
    return new ResendMailer(env.RESEND_API_KEY, env.MAIL_FROM)
  }
  return new ConsoleMailer()
}

export * from './templates.ts'
