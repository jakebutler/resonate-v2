"use client";

import { Switch } from "@/components/ui/switch";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <Switch
      checked={checked}
      className="data-checked:bg-[var(--ink-black)] data-unchecked:bg-gray-300"
      onCheckedChange={onChange}
    />
  );
}
