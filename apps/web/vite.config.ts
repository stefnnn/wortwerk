import { defineConfig } from 'vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  server: { port: 3010 },
  plugins: [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],
    }),
    tailwindcss(),
    tanstackStart({
      prerender: { enabled: true, autoStaticPathsDiscovery: false, crawlLinks: false },
      pages: [{ path: '/' }, { path: '/de/' }],
    }),
    nitro(),
    viteReact(),
  ],
})
