import { relations, sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { tenant, user } from './auth.ts'

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())
const tenantId = () =>
  text()
    .notNull()
    .references(() => tenant.id, { onDelete: 'cascade' })
const createdAt = () => timestamp({ withTimezone: true }).defaultNow().notNull()
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull()
const userRef = () => text().references(() => user.id, { onDelete: 'set null' })

export const fileFormat = pgEnum('file_format', ['json', 'yaml', 'po', 'script'])
export const translationStatus = pgEnum('translation_status', [
  'untranslated',
  'translated',
  'needs_review',
  'approved',
])
export const revisionSource = pgEnum('revision_source', ['editor', 'import', 'git', 'machine'])
export const syncRunKind = pgEnum('sync_run_kind', ['import', 'export', 'pull', 'push', 'machine'])
export const gitProvider = pgEnum('git_provider', ['github', 'bitbucket'])
export const syncRunStatus = pgEnum('sync_run_status', ['queued', 'running', 'succeeded', 'failed'])

export const project = pgTable(
  'project',
  {
    id: id(),
    tenantId: tenantId(),
    name: text().notNull(),
    slug: text().notNull(),
    sourceLocale: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.tenantId, t.slug)],
)

// Scoped access for guests (workspace members with role "guest"): they only reach projects listed here.
// `locales` null = every locale of the project, otherwise only the listed ones can be edited.
export const projectMember = pgTable(
  'project_member',
  {
    id: id(),
    tenantId: tenantId(),
    projectId: text()
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    locales: jsonb().$type<string[] | null>(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.projectId, t.userId), index().on(t.tenantId, t.userId)],
)

export const projectLocale = pgTable(
  'project_locale',
  {
    id: id(),
    tenantId: tenantId(),
    projectId: text()
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    code: text().notNull(),
    // extra machine translation instructions for this locale, appended to the main prompt
    instructions: text().default('').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.projectId, t.code)],
)

export const projectFile = pgTable(
  'project_file',
  {
    id: id(),
    tenantId: tenantId(),
    projectId: text()
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    path: text().notNull(),
    format: fileFormat().notNull(),
    options: jsonb().$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.projectId, t.path)],
)

export const projectFileSnapshot = pgTable(
  'project_file_snapshot',
  {
    id: id(),
    tenantId: tenantId(),
    fileId: text()
      .notNull()
      .references(() => projectFile.id, { onDelete: 'cascade' }),
    locale: text().notNull(),
    content: text().notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.fileId, t.locale)],
)

export const translationKey = pgTable(
  'translation_key',
  {
    id: id(),
    tenantId: tenantId(),
    projectId: text()
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    fileId: text().references(() => projectFile.id, { onDelete: 'set null' }),
    name: text().notNull(),
    context: text().default('').notNull(),
    description: text().default('').notNull(),
    isPlural: boolean().default(false).notNull(),
    position: integer().default(0).notNull(),
    obsoleteAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique().on(t.projectId, t.fileId, t.context, t.name).nullsNotDistinct(),
    index().on(t.tenantId),
    index().on(t.projectId, t.position),
  ],
)

export const translation = pgTable(
  'translation',
  {
    id: id(),
    tenantId: tenantId(),
    keyId: text()
      .notNull()
      .references(() => translationKey.id, { onDelete: 'cascade' }),
    locale: text().notNull(),
    value: text().notNull(),
    status: translationStatus().default('translated').notNull(),
    // source locale only: the value last seen in the repo, the base for three-way pulls
    repoValue: text(),
    updatedById: userRef(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique().on(t.keyId, t.locale),
    index().on(t.tenantId, t.locale),
    index().on(t.tenantId, t.updatedAt),
    index('translation_value_trgm_idx').using('gin', sql`${t.value} gin_trgm_ops`),
  ],
)

export const translationRevision = pgTable(
  'translation_revision',
  {
    id: id(),
    tenantId: tenantId(),
    translationId: text()
      .notNull()
      .references(() => translation.id, { onDelete: 'cascade' }),
    value: text().notNull(),
    status: translationStatus().notNull(),
    source: revisionSource().notNull(),
    userId: userRef(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.translationId, t.createdAt)],
)

export const conflictResolution = pgEnum('conflict_resolution', ['repo', 'edited'])

// a pull changed source text that was also edited in wortwerk; the repo value won, `mine` is kept
export const sourceConflict = pgTable(
  'source_conflict',
  {
    id: id(),
    tenantId: tenantId(),
    keyId: text()
      .notNull()
      .references(() => translationKey.id, { onDelete: 'cascade' }),
    mine: text().notNull(),
    base: text(),
    // null when the key was removed from the repo
    theirs: text(),
    createdAt: createdAt(),
    resolvedAt: timestamp({ withTimezone: true }),
    resolvedById: userRef(),
    resolution: conflictResolution(),
  },
  (t) => [index().on(t.keyId), index().on(t.tenantId, t.resolvedAt)],
)

export const keyComment = pgTable(
  'key_comment',
  {
    id: id(),
    tenantId: tenantId(),
    keyId: text()
      .notNull()
      .references(() => translationKey.id, { onDelete: 'cascade' }),
    userId: userRef(),
    body: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.keyId)],
)

export const keyScreenshot = pgTable(
  'key_screenshot',
  {
    id: id(),
    tenantId: tenantId(),
    keyId: text()
      .notNull()
      .references(() => translationKey.id, { onDelete: 'cascade' }),
    storageKey: text().notNull(),
    filename: text().notNull(),
    mimeType: text().notNull(),
    size: integer().notNull(),
    uploadedById: userRef(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.keyId)],
)

export const syncRun = pgTable(
  'sync_run',
  {
    id: id(),
    tenantId: tenantId(),
    projectId: text()
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    kind: syncRunKind().notNull(),
    status: syncRunStatus().default('queued').notNull(),
    params: jsonb().$type<Record<string, unknown>>().default({}).notNull(),
    result: jsonb().$type<Record<string, unknown>>(),
    error: text(),
    createdById: userRef(),
    createdAt: createdAt(),
    startedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.projectId, t.createdAt)],
)

export const gitConnection = pgTable(
  'git_connection',
  {
    id: id(),
    tenantId: tenantId(),
    provider: gitProvider().notNull(),
    externalId: text().notNull(),
    accountName: text().notNull(),
    credentials: text(),
    createdById: userRef(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.tenantId, t.provider, t.externalId), index().on(t.provider, t.externalId)],
)

export const projectRepo = pgTable(
  'project_repo',
  {
    id: id(),
    tenantId: tenantId(),
    projectId: text()
      .notNull()
      .unique()
      .references(() => project.id, { onDelete: 'cascade' }),
    connectionId: text()
      .notNull()
      .references(() => gitConnection.id, { onDelete: 'cascade' }),
    repo: text().notNull(),
    branch: text().notNull(),
    exportBranch: text().default('wortwerk/translations').notNull(),
    localeAliases: jsonb().$type<Record<string, string>>().default({}).notNull(),
    autoExport: boolean().default(true).notNull(),
    webhookId: text(),
    webhookSecret: text(),
    lastPulledSha: text(),
    lastPulledAt: timestamp({ withTimezone: true }),
    lastPushedSha: text(),
    lastPushedAt: timestamp({ withTimezone: true }),
    pullRequestUrl: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.connectionId, t.repo)],
)

export const projectToken = pgTable(
  'project_token',
  {
    id: id(),
    tenantId: tenantId(),
    projectId: text()
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    tokenHash: text().notNull().unique(),
    tokenPrefix: text().notNull(),
    lastUsedAt: timestamp({ withTimezone: true }),
    createdById: userRef(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.projectId)],
)

export const projectRelations = relations(project, ({ one, many }) => ({
  repo: one(projectRepo),
  locales: many(projectLocale),
  files: many(projectFile),
  keys: many(translationKey),
}))

export const projectLocaleRelations = relations(projectLocale, ({ one }) => ({
  project: one(project, { fields: [projectLocale.projectId], references: [project.id] }),
}))

export const projectFileRelations = relations(projectFile, ({ one, many }) => ({
  project: one(project, { fields: [projectFile.projectId], references: [project.id] }),
  snapshots: many(projectFileSnapshot),
}))

export const projectFileSnapshotRelations = relations(projectFileSnapshot, ({ one }) => ({
  file: one(projectFile, { fields: [projectFileSnapshot.fileId], references: [projectFile.id] }),
}))

export const translationKeyRelations = relations(translationKey, ({ one, many }) => ({
  project: one(project, { fields: [translationKey.projectId], references: [project.id] }),
  file: one(projectFile, { fields: [translationKey.fileId], references: [projectFile.id] }),
  translations: many(translation),
  comments: many(keyComment),
  screenshots: many(keyScreenshot),
  conflicts: many(sourceConflict),
}))

export const sourceConflictRelations = relations(sourceConflict, ({ one }) => ({
  key: one(translationKey, { fields: [sourceConflict.keyId], references: [translationKey.id] }),
}))

export const translationRelations = relations(translation, ({ one, many }) => ({
  key: one(translationKey, { fields: [translation.keyId], references: [translationKey.id] }),
  revisions: many(translationRevision),
}))

export const translationRevisionRelations = relations(translationRevision, ({ one }) => ({
  translation: one(translation, {
    fields: [translationRevision.translationId],
    references: [translation.id],
  }),
  user: one(user, { fields: [translationRevision.userId], references: [user.id] }),
}))

export const keyCommentRelations = relations(keyComment, ({ one }) => ({
  key: one(translationKey, { fields: [keyComment.keyId], references: [translationKey.id] }),
  user: one(user, { fields: [keyComment.userId], references: [user.id] }),
}))

export const keyScreenshotRelations = relations(keyScreenshot, ({ one }) => ({
  key: one(translationKey, { fields: [keyScreenshot.keyId], references: [translationKey.id] }),
}))

export const gitConnectionRelations = relations(gitConnection, ({ many }) => ({
  repos: many(projectRepo),
}))

export const projectRepoRelations = relations(projectRepo, ({ one }) => ({
  project: one(project, { fields: [projectRepo.projectId], references: [project.id] }),
  connection: one(gitConnection, { fields: [projectRepo.connectionId], references: [gitConnection.id] }),
}))
