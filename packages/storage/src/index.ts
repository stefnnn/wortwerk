import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'

export interface Storage {
  put(key: string, body: Uint8Array): Promise<void>
  get(key: string): Promise<Uint8Array<ArrayBuffer> | null>
  delete(key: string): Promise<void>
}

export class LocalStorage implements Storage {
  #root: string

  constructor(root: string) {
    this.#root = resolve(root)
  }

  #path(key: string) {
    const path = resolve(this.#root, key)
    if (!path.startsWith(this.#root + sep)) throw new Error(`invalid storage key: ${key}`)
    return path
  }

  async put(key: string, body: Uint8Array) {
    const path = this.#path(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, body)
  }

  async get(key: string) {
    const path = this.#path(key)
    if (!(await stat(path).catch(() => null))) return null
    return new Uint8Array(await readFile(path))
  }

  async delete(key: string) {
    await rm(this.#path(key), { force: true })
  }
}

export function createStorage(env: NodeJS.ProcessEnv = process.env): Storage {
  return new LocalStorage(env.STORAGE_DIR ?? './storage')
}
