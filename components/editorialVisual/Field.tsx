export function Field({ label, value, onChange, multiline = false, numericBounds }: { label: string; value: string; onChange(value: string): void; multiline?: boolean; numericBounds?: { min: number; max: number } }) {
  const props = { value, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value), className: "mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm font-normal text-gray-900", ...(numericBounds ? { type: "number", step: 1, ...numericBounds } : {}) };
  return <label className="block text-xs font-semibold text-gray-600">{label}{multiline ? <textarea {...props} rows={3} /> : <input {...props} />}</label>;
}
