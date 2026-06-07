import { cn } from "@/lib/utils";
import { tokens } from "@/components/shell/tokens";

type FilterOption<T extends string> = {
  id: T;
  name?: string;
  label?: string;
};

type FilterGroupProps<T extends string> = {
  label: string;
  options: Array<FilterOption<T>>;
  mode?: "single" | "multiple";
  selected: T[] | T;
  onChange: (id: T) => void;
};

export function FilterGroup<T extends string>({
  label,
  options,
  mode = "multiple",
  selected,
  onChange,
}: FilterGroupProps<T>) {
  const isSelected = (id: T) =>
    mode === "single"
      ? selected === id
      : Array.isArray(selected) && selected.includes(id);

  return (
    <fieldset>
      <legend className={cn("text-xs font-semibold uppercase", tokens.textSubtle)}>
        {label}
      </legend>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((option) => {
          const checked = isSelected(option.id);
          return (
            <label
              className={cn(
                "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium",
                checked ? tokens.pillActive : tokens.pillIdle
              )}
              key={option.id}
            >
              <input
                checked={checked}
                className="sr-only"
                name={mode === "single" ? label : undefined}
                onChange={() => onChange(option.id)}
                type={mode === "single" ? "radio" : "checkbox"}
              />
              {option.name ?? option.label ?? option.id}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function toggleFilterSet<T extends string>(current: T[], value: T) {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}
