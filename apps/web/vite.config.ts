import { defineConfig } from 'vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { competitors } from './src/lib/compare.ts'
import { docPaths } from './src/lib/docs-nav.ts'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  server: { port: 3010 },
  preview: { host: '127.0.0.1' },
  plugins: [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],
    }),
    tailwindcss(),
    tanstackStart({
      prerender: { enabled: true, autoStaticPathsDiscovery: false, crawlLinks: false },
      pages: [
        '/',
        '/privacy',
        '/compare',
        ...competitors.map((c) => `/compare/${c.slug}`),
        ...docPaths,
      ].flatMap((path) => [{ path }, { path: path === '/' ? '/de/' : `/de${path}` }]),
    }),
    nitro(),
    viteReact(),
  ],
})
