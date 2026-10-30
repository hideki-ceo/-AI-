export function SectionHeading({
  eyebrow,
  title,
  description,
  invert = false,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  invert?: boolean;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className={`text-sm font-semibold uppercase tracking-widest ${invert ? "text-brand-200" : "text-brand-600"}`}>
        {eyebrow}
      </p>
      <h2 className={`mt-3 text-2xl font-bold leading-snug sm:text-4xl ${invert ? "text-white" : "text-ink"}`}>{title}</h2>
      {description && (
        <p className={`mt-5 leading-relaxed ${invert ? "text-brand-100" : "text-slate-600"}`}>{description}</p>
      )}
    </div>
  );
}
