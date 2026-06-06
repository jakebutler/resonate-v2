"use client";

import { FileText, Linkedin } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

interface CreatePostModalProps {
  open: boolean;
  date: string | null;
  onClose: () => void;
  onSelect: (type: "blog" | "linkedin") => void;
}

function formatDisplayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function CreatePostModal({ open, date, onClose, onSelect }: CreatePostModalProps) {
  const title = date
    ? `Create Post — ${formatDisplayDate(date)}`
    : "Create Post";

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onSelect("blog")}
          className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-gray-200 hover:border-[#ff7d00] hover:bg-[#ffecd1]/20 transition-all group"
        >
          <div className="w-14 h-14 rounded-xl bg-[#ffecd1] flex items-center justify-center group-hover:bg-[#ffecd1]">
            <FileText size={28} className="text-[#78290f]" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-[#001524]">Blog Post</p>
            <p className="text-sm text-gray-500 mt-0.5">Markdown + Images</p>
          </div>
        </button>

        <button
          onClick={() => onSelect("linkedin")}
          className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-gray-200 hover:border-[#ff7d00] hover:bg-[#ffecd1]/20 transition-all group"
        >
          <div className="w-14 h-14 rounded-xl bg-[#15616d]/10 flex items-center justify-center group-hover:bg-[#15616d]/15">
            <Linkedin size={28} className="text-[#15616d]" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-[#001524]">LinkedIn Post</p>
            <p className="text-sm text-gray-500 mt-0.5">Text + Links</p>
          </div>
        </button>
      </div>
    </Modal>
  );
}
