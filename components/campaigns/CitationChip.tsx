"use client";

import { useState } from "react";

type CitationChipProps = {
  seq: number;
  provenance: string;
  text: string;
  uri: string;
};

export function CitationChip({ seq, provenance, text, uri }: CitationChipProps) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 rounded-[5px] bg-[#e2eff1] px-2 py-0.5 text-[11px] font-normal text-[#0e4a54] underline decoration-dotted decoration-[#15616d] underline-offset-2"
        aria-expanded={open}
      >
        ①{seq} · {provenance.split("·")[0].trim()}
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute bottom-[calc(100%+8px)] left-0 z-40 block w-80 rounded-lg bg-[#001524] px-3.5 py-3 text-[12px] leading-relaxed text-[#ffecd1] shadow-xl"
        >
          {text}
          <span className="mt-2 block break-all font-mono text-[10px] text-[#9fc3cb]">
            {uri}
          </span>
        </span>
      ) : null}
    </span>
  );
}
