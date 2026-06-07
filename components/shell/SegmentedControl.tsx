import { cn } from "@/lib/utils";
import { tokens } from "@/components/shell/tokens";

type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

type SegmentedControlProps<T extends string> = {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        "inline-grid rounded-md border bg-black/[0.03] p-1",
        tokens.border
      )}
      role="tablist"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            aria-pressed={active}
            aria-selected={active}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-semibold transition-colors",
              active
                ? "bg-white text-[#15616d] shadow-sm"
                : cn(tokens.textMuted, "hover:bg-white/70")
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="tab"
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
