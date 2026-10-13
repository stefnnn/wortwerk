import { createHmac, timingSafeEqual } from 'node:crypto'

export function signPayload(secret: string, body: string) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

export function verifySignature(secret: string, body: string, header: string | null | undefined) {
  if (!header) return false
  const expected = Buffer.from(signPayload(secret, body))
  const actual = Buffer.from(header)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
