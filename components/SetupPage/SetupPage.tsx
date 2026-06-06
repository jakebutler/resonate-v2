"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Toggle } from "@/components/ui/Toggle";
import { FileText, Linkedin, ChevronRight, AudioWaveform } from "lucide-react";

const FREQUENCIES = [
  { value: "1x", label: "1× per week" },
  { value: "2x", label: "2× per week" },
  { value: "3x", label: "3× per week" },
  { value: "4x", label: "4× per week" },
  { value: "5x", label: "5× per week" },
  { value: "6x", label: "6× per week" },
  { value: "daily", label: "Daily" },
];

export function SetupPage() {
  const router = useRouter();
  const settings = useQuery(api.settings.get);
  const upsert = useMutation(api.settings.upsert);

  const [blogEnabled, setBlogEnabled] = useState<boolean | null>(null);
  const [blogFrequency, setBlogFrequency] = useState<string | null>(null);
  const [linkedinEnabled, setLinkedinEnabled] = useState<boolean | null>(null);
  const [linkedinFrequency, setLinkedinFrequency] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Derive current values: user-controlled state overrides defaults from DB
  const resolvedBlogEnabled = blogEnabled ?? settings?.blogEnabled ?? true;
  const resolvedBlogFrequency = blogFrequency ?? settings?.blogFrequency ?? "1x";
  const resolvedLinkedinEnabled = linkedinEnabled ?? settings?.linkedinEnabled ?? false;
  const resolvedLinkedinFrequency = linkedinFrequency ?? settings?.linkedinFrequency ?? "3x";

  const canContinue = resolvedBlogEnabled || resolvedLinkedinEnabled;

  const handleContinue = async () => {
    setSaving(true);
    await upsert({
      blogEnabled: resolvedBlogEnabled,
      blogFrequency: resolvedBlogFrequency,
      linkedinEnabled: resolvedLinkedinEnabled,
      linkedinFrequency: resolvedLinkedinFrequency,
    });
    setSaving(false);
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-white px-6 py-12 max-w-2xl mx-auto">
      {/* Wordmark */}
      <div className="flex items-center gap-2 mb-10">
        <AudioWaveform size={22} className="text-[#001524]" />
        <span className="font-forum text-xl font-semibold text-[#001524]">Resonate</span>
      </div>

      {/* Headline */}
      <h1 className="font-forum text-5xl text-[#001524] mb-2">
        Set up your publishing schedule
      </h1>
      <p className="text-gray-500 mb-10">Choose your channels and how often you want to post.</p>

      {/* Blog Posts card */}
      <div
        className={`rounded-2xl border-2 p-6 mb-4 transition-colors ${
          resolvedBlogEnabled ? "border-[#ff7d00]" : "border-gray-200"
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${resolvedBlogEnabled ? "bg-[#ffecd1]" : "bg-gray-100"}`}>
              <FileText size={20} className={resolvedBlogEnabled ? "text-[#78290f]" : "text-gray-400"} />
            </div>
            <div>
              <p className="font-semibold text-[#001524]">Blog Posts</p>
              <p className="text-sm text-gray-500">Company website content</p>
            </div>
          </div>
          <Toggle checked={resolvedBlogEnabled} onChange={setBlogEnabled} />
        </div>

        {resolvedBlogEnabled && (
          <div className="flex items-start justify-between pt-4 border-t border-gray-100">
            <div>
              <p className="font-medium text-[#001524] text-sm">Publishing frequency</p>
              <p className="text-xs text-gray-500 mt-0.5">1–2×/week is ideal for SEO</p>
            </div>
            <select
              value={resolvedBlogFrequency}
              onChange={(e) => setBlogFrequency(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#ff7d00] focus:border-transparent bg-[#ffecd1]/50"
            >
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* LinkedIn card */}
      <div
        className={`rounded-2xl border-2 p-6 mb-10 transition-colors ${
          resolvedLinkedinEnabled ? "border-[#15616d]" : "border-gray-200"
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${resolvedLinkedinEnabled ? "bg-[#15616d]/10" : "bg-gray-100"}`}>
              <Linkedin size={20} className={resolvedLinkedinEnabled ? "text-[#15616d]" : "text-gray-400"} />
            </div>
            <div>
              <p className="font-semibold text-[#001524]">LinkedIn</p>
              <p className="text-sm text-gray-500">Professional network posts</p>
            </div>
          </div>
          <Toggle checked={resolvedLinkedinEnabled} onChange={setLinkedinEnabled} />
        </div>

        {resolvedLinkedinEnabled && (
          <div className="flex items-start justify-between pt-4 border-t border-gray-100">
            <div>
              <p className="font-medium text-[#001524] text-sm">Publishing frequency</p>
              <p className="text-xs text-gray-500 mt-0.5">3–5×/week maximizes reach</p>
            </div>
            <select
              value={resolvedLinkedinFrequency}
              onChange={(e) => setLinkedinFrequency(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#15616d] focus:border-transparent bg-[#15616d]/5"
            >
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* CTA */}
      <button
        onClick={handleContinue}
        disabled={!canContinue || saving}
        className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-medium transition-colors ${
          canContinue
            ? "bg-[#ff7d00] text-white hover:bg-[#e67200]"
            : "bg-gray-100 text-gray-400 cursor-not-allowed"
        }`}
      >
        {saving ? "Saving…" : "Continue to Calendar"}
        {canContinue && <ChevronRight size={16} />}
      </button>
    </div>
  );
}
