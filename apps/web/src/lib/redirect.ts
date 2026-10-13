import { z } from 'zod'

export const redirectSearch = z.object({
  redirect: z
    .string()
    .regex(/^\/(?!\/)/)
    .optional()
    .catch(undefined),
})
