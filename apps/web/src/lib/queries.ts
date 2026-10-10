import { queryOptions, keepPreviousData } from '@tanstack/react-query'
import { client, t, unwrap } from './api.ts'

export type KeyFilters = {
  locale: string
  status?: 'untranslated' | 'translated' | 'needs_review' | 'approved'
  sync?: 'pending' | 'conflict'
  search?: string
  fileId?: string
  obsolete?: boolean
  includeSource?: boolean
  offset?: number
}

export const queries = {
  adminOverview: () =>
    queryOptions({
      queryKey: ['admin', 'overview'],
      queryFn: () => unwrap(client.api.admin.overview.$get()),
    }),
  apiTokens: () =>
    queryOptions({
      queryKey: ['account', 'tokens'],
      queryFn: () => unwrap(client.api.account.tokens.$get()),
    }),
  tenant: (tenant: string) =>
    queryOptions({
      queryKey: ['tenant', tenant],
      queryFn: () => unwrap(t.$get({ param: { tenant } })),
    }),
  access: (tenant: string) =>
    queryOptions({
      queryKey: ['tenant', tenant, 'access'],
      queryFn: () => unwrap(t.access.$get({ param: { tenant } })),
    }),
  projects: (tenant: string) =>
    queryOptions({
      queryKey: ['tenant', tenant, 'projects'],
      queryFn: () => unwrap(t.projects.$get({ param: { tenant } })),
    }),
  project: (tenant: string, project: string) =>
    queryOptions({
      queryKey: ['tenant', tenant, 'project', project],
      queryFn: () => unwrap(t.projects[':project'].$get({ param: { tenant, project } })),
    }),
  stats: (tenant: string, project: string) =>
    queryOptions({
      queryKey: ['tenant', tenant, 'project', project, 'stats'],
      queryFn: () => unwrap(t.projects[':project'].stats.$get({ param: { tenant, project } })),
    }),
  runs: (tenant: string, project: string) =>
    queryOptions({
      queryKey: ['tenant', tenant, 'project', project, 'runs'],
      queryFn: () => unwrap(t.projects[':project'].runs.$get({ param: { tenant, project } })),
      refetchInterval: (query) =>
        query.state.data?.some((r) => r.status === 'queued' || r.status === 'running') ? 1500 : false,
    }),
  sourceSync: (tenant: string, project: string) =>
    queryOptions({
      queryKey: ['tenant', tenant, 'project', project, 'source-sync'],
      queryFn: () => unwrap(t.projects[':project']['source-sync'].$get({ param: { tenant, project } })),
    }),
  conflicts: (tenant: string, keyId: string) =>
    queryOptions({
      queryKey: ['tenant', tenant, 'key', keyId, 'conflicts'],
      queryFn: () => unwrap(t.keys[':keyId'].conflicts.$get({ param: { tenant, keyId } })),
    }),
  keys: (tenant: string, project: string, filters: KeyFilters) =>
    queryOptions({
      queryKey: ['tenant', tenant, 'project', project, 'keys', filters],
      queryFn: () =>
        unwrap(
          t.projects[':project'].keys.$get({
            param: { tenant, project },
            query: {
              locale: filters.locale,
              status: filters.status,
              sync: filters.sync,
              search: filters.search || undefined,
              fileId: filters.fileId,
              obsolete: filters.obsolete ? 'true' : undefined,
              includeSource: filters.includeSource ? 'true' : undefined,
              offset: String(filters.offset ?? 0),
              limit: '50',
            },
          }),
        ),
      placeholderData: keepPreviousData,
    }),
  revisions: (tenant: string, keyId: string, locale: string) =>
    queryOptions({
      queryKey: ['tenant', tenant, 'key', keyId, 'revisions', locale],
      queryFn: () =>
        unwrap(t.keys[':keyId'].translations[':locale'].revisions.$get({ param: { tenant, keyId, locale } })),
    }),
  suggestions: (tenant: string, keyId: string, locale: string) =>
    queryOptions({
      queryKey: ['tenant', tenant, 'key', keyId, 'suggestions', locale],
      queryFn: () =>
        unwrap(t.keys[':keyId'].suggestions.$get({ param: { tenant, keyId }, query: { locale } })),
    }),
  comments: (tenant: string, keyId: string) =>
    queryOptions({
      queryKey: ['tenant', tenant, 'key', keyId, 'comments'],
      queryFn: () => unwrap(t.keys[':keyId'].comments.$get({ param: { tenant, keyId } })),
    }),
  screenshots: (tenant: string, keyId: string) =>
    queryOptions({
      queryKey: ['tenant', tenant, 'key', keyId, 'screenshots'],
      queryFn: () => unwrap(t.keys[':keyId'].screenshots.$get({ param: { tenant, keyId } })),
    }),
  gitConnections: (tenant: string) =>
    queryOptions({
      queryKey: ['tenant', tenant, 'git', 'connections'],
      queryFn: () => unwrap(t.git.connections.$get({ param: { tenant } })),
    }),
  gitRepos: (tenant: string, connectionId: string) =>
    queryOptions({
      queryKey: ['tenant', tenant, 'git', 'connections', connectionId, 'repos'],
      queryFn: () =>
        unwrap(t.git.connections[':connectionId'].repos.$get({ param: { tenant, connectionId } })),
      enabled: Boolean(connectionId),
      staleTime: 60_000,
    }),
  repo: (tenant: string, project: string) =>
    queryOptions({
      queryKey: ['tenant', tenant, 'project', project, 'repo'],
      queryFn: () => unwrap(t.projects[':project'].repo.$get({ param: { tenant, project } })),
    }),
  tokens: (tenant: string, project: string) =>
    queryOptions({
      queryKey: ['tenant', tenant, 'project', project, 'tokens'],
      queryFn: () => unwrap(t.projects[':project'].tokens.$get({ param: { tenant, project } })),
    }),
}
