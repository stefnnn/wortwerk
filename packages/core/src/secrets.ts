import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

function key() {
  const secret = process.env.APP_SECRET || process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('APP_SECRET or BETTER_AUTH_SECRET must be set')
  return createHash('sha256').update(`wortwerk:secrets:${secret}`).digest()
}

export function sealSecret(value: unknown) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return ['v1', iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.')
}

export function openSecret<T>(sealed: string): T {
  const [version, iv, tag, data] = sealed.split('.')
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unsupported secret format')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  const plain = Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()])
  return JSON.parse(plain.toString('utf8')) as T
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}
