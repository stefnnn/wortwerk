import { queryOptions, keepPreviousData } from '@tanstack/react-query'
import { t, unwrap } from './api.ts'

export type KeyFilters = {
  locale: string
  status?: 'untranslated' | 'translated' | 'needs_review' | 'approved'
  search?: string
  fileId?: string
  obsolete?: boolean
  offset?: number
}

export const queries = {
  tenant: (tenant: string) =>
    queryOptions({
      queryKey: ['tenant', tenant],
      queryFn: () => unwrap(t.$get({ param: { tenant } })),
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
              search: filters.search || undefined,
              fileId: filters.fileId,
              obsolete: filters.obsolete ? 'true' : undefined,
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
}
