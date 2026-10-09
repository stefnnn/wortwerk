import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CircleAlert,
  CircleCheck,
  Copy,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  FileQuestion,
  KeyRound,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { FilePatternForm } from "#/components/app/file-patterns.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button, buttonVariants } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "#/components/ui/field.tsx";
import { Input } from "#/components/ui/input.tsx";
import { NativeSelect } from "#/components/ui/native-select.tsx";
import { t, unwrap } from "#/lib/api.ts";
import { formatDateTime } from "#/lib/format.ts";
import { useAction } from "#/lib/mutations.ts";
import { queries } from "#/lib/queries.ts";
import { m } from "#/paraglide/messages.js";

type Props = { tenant: string; project: string };

const providerName = { github: "GitHub", bitbucket: "Bitbucket" } as const;

function parseAliases(value: string) {
  return Object.fromEntries(
    value
      .split(/[,\n]/)
      .map((pair) => pair.split("=").map((s) => s.trim()))
      .filter(
        (pair): pair is [string, string] =>
          pair.length === 2 && Boolean(pair[0]) && Boolean(pair[1]),
      ),
  );
}

const formatAliases = (aliases: Record<string, string>) =>
  Object.entries(aliases)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");

export function RepoCard({ tenant, project }: Props) {
  const connections = useQuery(queries.gitConnections(tenant));
  const link = useQuery(queries.repo(tenant, project));
  const details = useQuery(queries.project(tenant, project));
  const runs = useQuery(queries.runs(tenant, project));
  const [editing, setEditing] = useState(false);
  const param = { tenant, project };
  const invalidate = [
    queries.repo(tenant, project).queryKey,
    queries.runs(tenant, project).queryKey,
  ];

  const sync = useAction(
    () => unwrap(t.projects[":project"].repo.sync.$post({ param })),
    {
      invalidate,
      success: m.repo_sync_queued(),
    },
  );
  const exportNow = useAction(
    () => unwrap(t.projects[":project"].repo.export.$post({ param })),
    {
      invalidate,
      success: m.repo_export_queued(),
    },
  );
  const disconnect = useAction(
    () => unwrap(t.projects[":project"].repo.$delete({ param })),
    { invalidate },
  );

  if (!connections.data || link.data === undefined) return null;

  if (!connections.data.connections.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{m.repo_title()}</CardTitle>
          <CardDescription>{m.repo_subtitle()}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {m.repo_no_connections()}{" "}
            <Link
              to="/t/$tenant/settings"
              params={{ tenant }}
              className="text-primary hover:underline"
            >
              {m.repo_open_settings()}
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  const repo = link.data;
  const noFiles = details.data?.files.length === 0;
  const lastRun = runs.data?.find(
    (r) => r.kind === "pull" || r.kind === "push",
  );
  if (!repo || editing) {
    return (
      <RepoForm
        tenant={tenant}
        project={project}
        connections={connections.data.connections}
        initial={repo}
        onDone={() => setEditing(false)}
        onCancel={repo ? () => setEditing(false) : undefined}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.repo_title()}</CardTitle>
        <CardDescription>{m.repo_linked_body()}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {repo.accessLostAt && (
          <RepoAccessAlert tenant={tenant} project={project} repo={repo} />
        )}
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">{m.repo_repository()}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {providerName[repo.connection.provider]}
            </Badge>
            <code>{repo.repo}</code>
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <GitBranch className="size-3.5" /> <code>{repo.branch}</code>
            </span>
          </dd>
          <dt className="text-muted-foreground">{m.repo_export_branch()}</dt>
          <dd>
            <code>{repo.exportBranch}</code>{" "}
            <span className="text-muted-foreground">
              ·{" "}
              {repo.autoExport
                ? m.repo_auto_export_on()
                : m.repo_auto_export_off()}
            </span>
          </dd>
          {Object.keys(repo.localeAliases).length > 0 && (
            <>
              <dt className="text-muted-foreground">{m.repo_aliases()}</dt>
              <dd className="font-mono text-xs">
                {formatAliases(repo.localeAliases)}
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">{m.repo_last_pull()}</dt>
          <dd>
            {repo.lastPulledAt ? (
              <>
                {repo.lastPulledSha && (
                  <code>{repo.lastPulledSha.slice(0, 7)} · </code>
                )}
                {formatDateTime(repo.lastPulledAt)}
              </>
            ) : (
              "—"
            )}
          </dd>
          <dt className="text-muted-foreground">{m.repo_last_push()}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            {repo.lastPushedAt ? formatDateTime(repo.lastPushedAt) : "—"}
            {repo.pullRequestUrl && (
              <a
                href={repo.pullRequestUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary inline-flex items-center gap-1 hover:underline"
              >
                <GitPullRequest className="size-3.5" /> {m.repo_pull_request()}{" "}
                <ExternalLink className="size-3" />
              </a>
            )}
          </dd>
        </dl>

        {noFiles ? (
          <Alert>
            <FileQuestion />
            <AlertTitle>{m.repo_no_files_title()}</AlertTitle>
            <AlertDescription className="grid gap-3">
              <p>{m.repo_no_files_body()}</p>
              <FilePatternForm tenant={tenant} project={project} />
            </AlertDescription>
          </Alert>
        ) : (
          lastRun && <LastRun run={lastRun} />
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => sync.mutate(undefined)}
            disabled={sync.isPending || noFiles}
          >
            <RefreshCw /> {m.repo_sync_now()}
          </Button>
          <Button
            variant="outline"
            onClick={() => exportNow.mutate(undefined)}
            disabled={exportNow.isPending || noFiles}
          >
            <Upload /> {m.repo_export_now()}
          </Button>
          <Button variant="ghost" onClick={() => setEditing(true)}>
            {m.action_edit()}
          </Button>
          <Button
            variant="ghost"
            className="text-destructive ml-auto"
            onClick={() => disconnect.mutate(undefined)}
          >
            {m.repo_disconnect()}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function RepoAccessAlert({
  tenant,
  project,
  repo,
}: {
  tenant: string;
  project: string;
  repo: {
    repo: string;
    accessLostAt: string | null;
    accessFixUrl: string | null;
  };
}) {
  const check = useAction(
    () =>
      unwrap(
        t.projects[":project"].repo.check.$post({ param: { tenant, project } }),
      ),
    {
      invalidate: [queries.repo(tenant, project).queryKey],
      onSuccess: (link) => {
        if (link?.accessLostAt) toast.error(m.repo_access_still_lost());
        else toast.success(m.repo_access_restored());
      },
    },
  );
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{m.repo_access_title({ repo: repo.repo })}</AlertTitle>
      <AlertDescription className="grid gap-1.5">
        <p>
          {m.repo_access_body({
            since: formatDateTime(repo.accessLostAt ?? ""),
          })}
        </p>
        <div className="flex flex-wrap gap-2 pb-1">
          {repo.accessFixUrl && (
            <a
              href={repo.accessFixUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({
                size: "sm",
                className: "no-underline! hover:text-white!",
              })}
            >
              {m.repo_access_fix()} <ExternalLink />
            </a>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => check.mutate(undefined)}
            disabled={check.isPending}
          >
            {check.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}{" "}
            {m.repo_access_check()}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

type Run = {
  kind: string;
  status: string;
  error: string | null;
  createdAt: string | Date;
  finishedAt?: string | Date | null;
};

function LastRun({ run }: { run: Run }) {
  const label = run.kind === "push" ? m.repo_last_push() : m.repo_last_pull();
  if (run.status === "failed") {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>
          {run.kind === "push" ? m.repo_export_failed() : m.repo_sync_failed()}
        </AlertTitle>
        <AlertDescription>
          <p>{run.error}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {formatDateTime(run.createdAt)}
          </p>
        </AlertDescription>
      </Alert>
    );
  }
  const active = run.status === "queued" || run.status === "running";
  return (
    <p className="text-muted-foreground flex items-center gap-2 text-sm">
      {active ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <CircleCheck className="text-success size-4" />
      )}
      {label}: {active ? m.run_running() : m.run_succeeded()} ·{" "}
      {formatDateTime(run.createdAt)}
    </p>
  );
}

type Connection = {
  id: string;
  provider: "github" | "bitbucket";
  accountName: string;
};
type Initial = {
  connectionId: string;
  repo: string;
  branch: string;
  exportBranch: string;
  localeAliases: Record<string, string>;
  autoExport: boolean;
} | null;

function RepoForm({
  tenant,
  project,
  connections,
  initial,
  onDone,
  onCancel,
}: Props & {
  connections: Connection[];
  initial: Initial;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [connectionId, setConnectionId] = useState(
    initial?.connectionId ?? connections[0]!.id,
  );
  const [repo, setRepo] = useState(initial?.repo ?? "");
  const [branch, setBranch] = useState(initial?.branch ?? "");
  const [exportBranch, setExportBranch] = useState(
    initial?.exportBranch ?? "wortwerk/translations",
  );
  const [aliases, setAliases] = useState(
    formatAliases(initial?.localeAliases ?? {}),
  );
  const [autoExport, setAutoExport] = useState(initial?.autoExport ?? true);
  const repos = useQuery(queries.gitRepos(tenant, connectionId));

  const save = useAction(
    () =>
      unwrap(
        t.projects[":project"].repo.$put({
          param: { tenant, project },
          json: {
            connectionId,
            repo,
            branch:
              branch ||
              repos.data?.find((r) => r.fullName === repo)?.defaultBranch ||
              "main",
            exportBranch,
            localeAliases: parseAliases(aliases),
            autoExport,
          },
        }),
      ),
    {
      invalidate: [
        queries.repo(tenant, project).queryKey,
        queries.runs(tenant, project).queryKey,
      ],
      success: m.repo_saved(),
      onSuccess: (result) => {
        if (result.webhookError)
          toast.warning(
            m.repo_webhook_failed({ message: result.webhookError }),
          );
        onDone();
      },
    },
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(undefined);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.repo_title()}</CardTitle>
        <CardDescription>{m.repo_subtitle()}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="repo-connection">
                  {m.repo_connection()}
                </FieldLabel>
                <NativeSelect
                  id="repo-connection"
                  value={connectionId}
                  onChange={(e) => {
                    setConnectionId(e.target.value);
                    setRepo("");
                  }}
                >
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {providerName[c.provider]} · {c.accountName}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="repo-name">
                  {m.repo_repository()}
                </FieldLabel>
                <NativeSelect
                  id="repo-name"
                  value={repo}
                  required
                  disabled={repos.isLoading}
                  onChange={(e) => {
                    setRepo(e.target.value);
                    setBranch(
                      repos.data?.find((r) => r.fullName === e.target.value)
                        ?.defaultBranch ?? "",
                    );
                  }}
                >
                  <option value="">
                    {repos.isLoading ? m.loading() : m.repo_choose()}
                  </option>
                  {repos.data?.map((r) => (
                    <option key={r.fullName} value={r.fullName}>
                      {r.fullName}
                    </option>
                  ))}
                </NativeSelect>
                {repos.isError && (
                  <FieldDescription className="text-destructive">
                    {repos.error.message}
                  </FieldDescription>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="repo-branch">{m.repo_branch()}</FieldLabel>
                <Input
                  id="repo-branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="font-mono"
                />
                <FieldDescription>{m.repo_branch_hint()}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="repo-export-branch">
                  {m.repo_export_branch()}
                </FieldLabel>
                <Input
                  id="repo-export-branch"
                  value={exportBranch}
                  onChange={(e) => setExportBranch(e.target.value)}
                  required
                  className="font-mono"
                />
                <FieldDescription>
                  {m.repo_export_branch_hint()}
                </FieldDescription>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="repo-aliases">{m.repo_aliases()}</FieldLabel>
              <Input
                id="repo-aliases"
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
                placeholder="de-CH=de, pt-BR=pt_BR"
                className="font-mono"
              />
              <FieldDescription>{m.repo_aliases_hint()}</FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="repo-auto"
                checked={autoExport}
                onCheckedChange={(v) => setAutoExport(v === true)}
              />
              <FieldLabel htmlFor="repo-auto" className="font-normal">
                {m.repo_auto_export()}
              </FieldLabel>
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={!repo || save.isPending}>
                {initial ? m.action_save() : m.repo_connect()}
              </Button>
              {onCancel && (
                <Button type="button" variant="ghost" onClick={onCancel}>
                  {m.action_cancel()}
                </Button>
              )}
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

export function TokensCard({
  tenant,
  project,
  projectId,
}: Props & { projectId: string }) {
  const tokens = useQuery(queries.tokens(tenant, project));
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const param = { tenant, project };
  const invalidate = [queries.tokens(tenant, project).queryKey];

  const create = useAction(
    () =>
      unwrap(t.projects[":project"].tokens.$post({ param, json: { name } })),
    {
      invalidate,
      onSuccess: (result) => {
        setCreated(result.token);
        setName("");
      },
    },
  );
  const revoke = useAction(
    (tokenId: string) =>
      unwrap(
        t.projects[":project"].tokens[":tokenId"].$delete({
          param: { ...param, tokenId },
        }),
      ),
    { invalidate },
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(undefined);
  };
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const example = `curl -X POST ${origin}/api/v1/projects/${projectId}/sync \\
  -H "Authorization: Bearer $WORTWERK_TOKEN" \\
  -H "Content-Type: application/json" -d '{"export": true}'`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.tokens_title()}</CardTitle>
        <CardDescription>{m.tokens_subtitle()}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {created && (
          <Alert>
            <KeyRound />
            <AlertTitle>{m.tokens_created()}</AlertTitle>
            <AlertDescription className="grid gap-2">
              <div className="flex items-center gap-2">
                <code className="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1">
                  {created}
                </code>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={m.action_copy()}
                  onClick={() =>
                    navigator.clipboard
                      .writeText(created)
                      .then(() => toast.success(m.copied()))
                  }
                >
                  <Copy />
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
        <form onSubmit={submit} className="flex max-w-md gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="GitHub Actions"
            required
          />
          <Button type="submit" variant="outline" disabled={create.isPending}>
            {m.tokens_create()}
          </Button>
        </form>
        {tokens.data && tokens.data.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {tokens.data.map((token) => (
              <li
                key={token.id}
                className="flex items-center gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{token.name}</p>
                  <p className="text-muted-foreground font-mono text-xs">
                    {token.tokenPrefix}… ·{" "}
                    {token.lastUsedAt
                      ? m.tokens_used({
                          date: formatDateTime(token.lastUsedAt),
                        })
                      : m.tokens_unused()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={m.tokens_revoke()}
                  onClick={() => revoke.mutate(token.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <pre className="bg-muted overflow-x-auto rounded-lg p-3 text-xs">
          {example}
        </pre>
      </CardContent>
    </Card>
  );
}
