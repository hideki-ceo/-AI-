import { InquiryForm } from "./InquiryForm";

export function Cta() {
  return (
    <section id="contact" className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 px-6 py-14 text-center text-white sm:px-14">
          <h2 className="text-2xl font-bold leading-snug sm:text-4xl">名簿回収と鍵番号の自動化について相談する</h2>
          <p className="mx-auto mt-5 max-w-2xl leading-relaxed text-brand-100">
            ご連絡先を送信いただくと、導入方法をご案内します。
          </p>
          <InquiryForm />
        </div>
      </div>
    </section>
  );
}
