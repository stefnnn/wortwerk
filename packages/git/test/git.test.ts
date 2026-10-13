import { generateKeyPairSync, createVerify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { GitHubApp, signPayload, verifySignature } from '../src/index.ts'

describe('webhook signatures', () => {
  it('accepts valid and rejects tampered payloads', () => {
    const header = signPayload('s3cret', '{"a":1}')
    expect(verifySignature('s3cret', '{"a":1}', header)).toBe(true)
    expect(verifySignature('s3cret', '{"a":2}', header)).toBe(false)
    expect(verifySignature('other', '{"a":1}', header)).toBe(false)
    expect(verifySignature('s3cret', '{"a":1}', null)).toBe(false)
    expect(verifySignature('s3cret', '{"a":1}', 'sha256=short')).toBe(false)
  })
})

describe('GitHubApp', () => {
  it('signs app JWTs with the private key', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().replace(/\n/g, '\\n')
    const app = new GitHubApp({ appId: '42', slug: 'wortwerk', privateKey: pem, webhookSecret: 'x' })
    const jwt = app.appJwt(1_000_000)
    const [header, payload, signature] = jwt.split('.')
    expect(JSON.parse(Buffer.from(payload!, 'base64url').toString())).toEqual({
      iat: 999_940,
      exp: 1_000_540,
      iss: '42',
    })
    const valid = createVerify('RSA-SHA256')
      .update(`${header}.${payload}`)
      .verify(publicKey, Buffer.from(signature!, 'base64url'))
    expect(valid).toBe(true)
    expect(app.installUrl('a b')).toBe('https://github.com/apps/wortwerk/installations/new?state=a%20b')
  })
})
