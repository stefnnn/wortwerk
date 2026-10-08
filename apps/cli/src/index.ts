#!/usr/bin/env node
import { log } from '@clack/prompts'
import { defineCommand, runMain, type CommandDef } from 'citty'
import { CliError, version } from './client.ts'
import { login, logout, whoami } from './commands/auth.ts'
import { mt, pull, push, sync } from './commands/files.ts'
import { init } from './commands/init.ts'
import { keys, open, translate } from './commands/keys.ts'
import { lint } from './commands/lint.ts'
import { check, status } from './commands/status.ts'

// errors become one readable line instead of a stack trace (set DEBUG=1 for the stack)
function guarded<T extends CommandDef<any>>(command: T): T {
  const run = command.run
  if (!run) return command
  return {
    ...command,
    run: async (context: never) => {
      try {
        await run(context)
      } catch (error) {
        if (process.env.DEBUG) console.error(error)
        log.error(error instanceof CliError ? error.message : `Unexpected error: ${(error as Error).message}`)
        process.exitCode = 1
      }
    },
  }
}

const commands = {
  login,
  logout,
  whoami,
  init,
  pull,
  push,
  sync,
  status,
  check,
  lint,
  keys,
  translate,
  mt,
  open,
}

const main = defineCommand({
  meta: {
    name: 'wortwerk',
    version,
    description: 'Translation management with git flow · https://wortwerk.li',
  },
  subCommands: Object.fromEntries(Object.entries(commands).map(([name, cmd]) => [name, guarded(cmd)])),
})

await runMain(main)
