import { env } from './env.ts'

export function isAdminUser(user: { email: string; emailVerified?: boolean }) {
  return Boolean(user.emailVerified) && env.ADMIN_EMAILS.includes(user.email.toLowerCase())
}
