import { Plus } from 'lucide-react'
import { m } from '#/paraglide/messages.js'

export function faqItems() {
  return [
    [m.faq_format_q(), m.faq_format_a()],
    [m.faq_main_q(), m.faq_main_a()],
    [m.faq_removed_q(), m.faq_removed_a()],
    [m.faq_providers_q(), m.faq_providers_a()],
    [m.faq_ci_q(), m.faq_ci_a()],
    [m.faq_mt_q(), m.faq_mt_a()],
    [m.faq_keys_q(), m.faq_keys_a()],
    [m.faq_data_q(), m.faq_data_a()],
  ] as const
}

export function Faq() {
  return (
    <div className="divide-y rounded-xl border">
      {faqItems().map(([question, answer]) => (
        <details key={question} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium">
            {question}
            <Plus className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-45" />
          </summary>
          <p className="text-muted-foreground -mt-1 pb-5 text-sm leading-6 text-pretty">{answer}</p>
        </details>
      ))}
    </div>
  )
}

export function faqJsonLd() {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems().map(([name, text]) => ({
      '@type': 'Question',
      name,
      acceptedAnswer: { '@type': 'Answer', text },
    })),
  })
}
