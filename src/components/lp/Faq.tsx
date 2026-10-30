import { BookingFlow } from "./BookingFlow";
import { FAQ_ITEMS } from "./faq-data";
import { SectionHeading } from "./SectionHeading";

// <details> で開閉するので回答文は初期 HTML に含まれ、クローラーにもそのまま読まれる
export function Faq() {
  return (
    <section id="faq" className="bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHeading eyebrow="FAQ" title="よくある質問" />
        <div className="mt-12 space-y-3">
          {FAQ_ITEMS.map((item) => (
            <details key={item.question} className="group rounded-2xl bg-white ring-1 ring-slate-200 open:ring-brand-500">
              <summary className="flex cursor-pointer items-center justify-between gap-4 p-5 sm:p-6">
                <h3 className="font-bold text-ink">
                  <span className="mr-2 text-brand-600">Q.</span>
                  {item.question}
                </h3>
                <svg
                  viewBox="0 0 20 20"
                  className="h-5 w-5 shrink-0 fill-slate-400 transition group-open:rotate-180"
                  aria-hidden="true"
                >
                  <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z" />
                </svg>
              </summary>
              <p className="px-5 pb-6 text-sm leading-relaxed text-slate-600 sm:px-6">
                <span className="mr-2 font-bold text-brand-600">A.</span>
                {item.answer}
              </p>
              {item.illustration === "booking-flow" && (
                <div className="px-5 pb-6 sm:px-6">
                  <BookingFlow />
                </div>
              )}
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
