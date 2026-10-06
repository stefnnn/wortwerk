import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AuthLayout } from '#/components/auth-layout.tsx'
import { Button } from '#/components/ui/button.tsx'
import { FieldError } from '#/components/ui/field.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { authClient } from '#/lib/auth-client.ts'
import { getViewer } from '#/lib/viewer.ts'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/invitations/$id')({
  beforeLoad: async ({ location }) => {
    const viewer = await getViewer()
    if (!viewer) throw redirect({ to: '/sign-up', search: { redirect: location.href } })
  },
  component: Invitation,
})

function Invitation() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const invitation = useQuery({
    queryKey: ['invitation', id],
    queryFn: async () => {
      const { data, error } = await authClient.organization.getInvitation({ query: { id } })
      if (error) throw new Error(error.message ?? m.error_generic())
      return data
    },
    retry: false,
  })
  const accept = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.organization.acceptInvitation({ invitationId: id })
      if (error) throw new Error(error.message ?? m.error_generic())
    },
    onSuccess: () => navigate({ to: '/t/$tenant', params: { tenant: invitation.data!.organizationSlug } }),
  })

  if (invitation.isPending) {
    return (
      <AuthLayout title={m.invitation_title()}>
        <Skeleton className="h-10 w-full" />
      </AuthLayout>
    )
  }
  if (invitation.error) {
    return (
      <AuthLayout title={m.invitation_title()}>
        <FieldError>{invitation.error.message}</FieldError>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={m.invitation_title()}
      description={m.invitation_body({
        inviter: invitation.data.inviterEmail,
        team: invitation.data.organizationName,
      })}
    >
      {accept.error && <FieldError className="mb-4">{accept.error.message}</FieldError>}
      <Button size="lg" className="w-full" onClick={() => accept.mutate()} disabled={accept.isPending}>
        {m.invitation_accept()}
      </Button>
    </AuthLayout>
  )
}
