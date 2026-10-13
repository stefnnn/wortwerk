import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { m } from '#/paraglide/messages.js'

export function useAction<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  options: {
    invalidate?: QueryKey[]
    success?: string
    onSuccess?: (result: TResult, args: TArgs) => void
  } = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result, args) => {
      await Promise.all(
        (options.invalidate ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      )
      if (options.success) toast.success(options.success)
      options.onSuccess?.(result, args)
    },
    onError: async (error) => {
      // a failed action can still have changed state, e.g. a sync that found the repository gone
      await Promise.all(
        (options.invalidate ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      )
      toast.error(error.message || m.error_generic())
    },
  })
}
