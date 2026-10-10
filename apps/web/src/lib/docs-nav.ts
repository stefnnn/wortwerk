// plain data so vite.config.ts can derive the prerendered pages from it
export const docsSections = [
  { id: 'start', pages: ['index', 'getting-started', 'machine-translation'] },
  { id: 'repositories', pages: ['github', 'bitbucket', 'sync'] },
  { id: 'tools', pages: ['cli', 'api'] },
] as const

export type DocSection = (typeof docsSections)[number]['id']

export const docSlugs: string[] = docsSections.flatMap((s) => [...s.pages])

export const docPaths = [
  '/docs',
  ...docSlugs.filter((s) => s !== 'index').map((s) => `/docs/${s}`),
  '/docs/api/reference',
]
