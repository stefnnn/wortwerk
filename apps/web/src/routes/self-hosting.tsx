import { createFileRoute } from '@tanstack/react-router'
import { Check, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { MarketingLayout, PageHeading } from '#/components/marketing/site.tsx'
import { m } from '#/paraglide/messages.js'

const repo = 'https://github.com/stefnnn/wortwerk'

export const Route = createFileRoute('/self-hosting')({
  head: () => ({
    meta: [
      { title: `wortwerk — ${m.self_hosting_title()}` },
      { name: 'description', content: m.self_hosting_intro() },
    ],
  }),
  component: SelfHostingPage,
})

const commands = `git clone ${repo}.git
cd wortwerk
nano .env   # DOMAIN, APP_URL, POSTGRES_PASSWORD, BETTER_AUTH_SECRET, SMTP_*, ADMIN_EMAILS
docker compose -f docker-compose.prod.yml up -d --build`

function SelfHostingPage() {
  const steps = [
    { title: m.self_hosting_step_1_title(), body: m.self_hosting_step_1_body() },
    { title: m.self_hosting_step_2_title(), body: m.self_hosting_step_2_body() },
    { title: m.self_hosting_step_3_title(), body: m.self_hosting_step_3_body() },
    { title: m.self_hosting_step_4_title(), body: m.self_hosting_step_4_body() },
  ]
  const allowed = [
    m.self_hosting_license_1(),
    m.self_hosting_license_2(),
    m.self_hosting_license_3(),
    m.self_hosting_license_4(),
  ]
  return (
    <MarketingLayout>
      <PageHeading title={m.self_hosting_title()}>
        <p>{m.self_hosting_intro()}</p>
      </PageHeading>
      <div className="mx-auto max-w-3xl space-y-14 px-6 pb-24">
        <ol className="space-y-8">
          {steps.map((step, i) => (
            <li key={step.title} className="flex gap-5">
              <span className="text-primary w-8 shrink-0 text-3xl font-semibold tabular-nums">{i + 1}</span>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">{step.title}</h2>
                <p className="text-muted-foreground mt-1.5 leading-7 text-pretty">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <pre className="bg-card overflow-x-auto rounded-xl border p-5 font-mono text-[13px] leading-6">
          {commands}
        </pre>
        <section>
          <h2 className="text-xl font-semibold tracking-tight">{m.self_hosting_license_title()}</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {allowed.map((item) => (
              <Item key={item} icon={<Check className="text-primary" />}>
                {item}
              </Item>
            ))}
            <Item icon={<X className="text-destructive" />}>{m.self_hosting_license_not()}</Item>
          </ul>
          <p className="text-muted-foreground mt-5 text-sm text-pretty">{m.self_hosting_license_future()}</p>
          <a
            href={`${repo}/blob/main/LICENSE`}
            className="text-primary mt-3 inline-block text-sm font-medium underline-offset-4 hover:underline"
          >
            {m.self_hosting_license_full()}
          </a>
        </section>
        <p className="text-muted-foreground border-t pt-6 text-sm">
          {m.self_hosting_questions()}{' '}
          <a href="mailto:contact@wortwerk.li" className="text-primary underline-offset-4 hover:underline">
            contact@wortwerk.li
          </a>
        </p>
      </div>
    </MarketingLayout>
  )
}

function Item({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-2.5 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0">
      {icon}
      <span>{children}</span>
    </li>
  )
}
