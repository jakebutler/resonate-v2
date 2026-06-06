"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, FileText, Linkedin } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";

interface Post {
  _id: Id<"posts">;
  type: "blog" | "linkedin";
  title?: string;
  content: string;
  status: string;
  scheduledDate?: string;
}

interface CalendarProps {
  posts: Post[];
  filter: "all" | "blog" | "linkedin";
  onCreatePost: (date: string) => void;
  onEditPost: (post: Post) => void;
}

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayYMD(): string {
  return formatYMD(new Date());
}

export function Calendar({ posts, filter, onCreatePost, onEditPost }: CalendarProps) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const prevMonth = () =>
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () =>
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  // Build calendar grid (pad with nulls)
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full grid rows
  while (cells.length % 7 !== 0) cells.push(null);

  const postsByDate: Record<string, Post[]> = {};
  const todayStr = todayYMD();
  for (const p of posts) {
    if (!p.scheduledDate) continue;
    if (filter !== "all" && p.type !== filter) continue;
    if (!postsByDate[p.scheduledDate]) postsByDate[p.scheduledDate] = [];
    postsByDate[p.scheduledDate].push(p);
  }

  const monthLabel = currentMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={prevMonth}
          aria-label="Previous month"
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="font-semibold text-[#001524]">{monthLabel}</span>
        <button
          onClick={nextMonth}
          aria-label="Next month"
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Grid */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-7 bg-[#001524]">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2.5 text-center text-xs font-semibold text-white/70 tracking-widest">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) {
              return (
                <div key={`empty-${i}`} className="min-h-[110px] bg-gray-50 border-t border-r border-gray-100" />
              );
            }

            const dateStr = formatYMD(new Date(year, month, day));
            const isToday = dateStr === todayStr;
            const dayPosts = postsByDate[dateStr] || [];

            // First cell of the month gets the "MAR 1, 2026" style label
            const isFirst = day === 1;

            return (
              <div
                key={dateStr}
                className={`min-h-[110px] border-t border-r border-gray-100 p-1.5 flex flex-col group ${
                  isToday ? "bg-[#ffecd1]/30" : "bg-white hover:bg-gray-50/50"
                }`}
              >
                {/* Day number */}
                <div className="flex items-center justify-between mb-1 px-0.5">
                  {isFirst ? (
                    <span className="text-xs font-bold text-white bg-[#15616d] rounded px-1.5 py-0.5 uppercase tracking-wide">
                      {currentMonth.toLocaleDateString("en-US", { month: "short" }).toUpperCase()} {day}, {year}
                    </span>
                  ) : (
                    <span
                      className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${
                        isToday
                          ? "bg-[#ff7d00] text-white"
                          : "text-gray-700"
                      }`}
                    >
                      {day}
                    </span>
                  )}
                  <button
                    onClick={() => onCreatePost(dateStr)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-[#ff7d00] transition-all p-0.5 rounded"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {/* Posts */}
                <div className="flex flex-col gap-0.5 flex-1">
                  {dayPosts.slice(0, 3).map((p) => (
                    <button
                      key={p._id}
                      onClick={() => onEditPost(p)}
                      className={`w-full text-left flex items-center gap-1 px-1.5 py-0.5 rounded text-xs truncate transition-colors ${
                        p.type === "blog"
                          ? "bg-[#ffecd1]/60 text-[#78290f] hover:bg-[#ffecd1]"
                          : "bg-[#15616d]/10 text-[#15616d] hover:bg-[#15616d]/20"
                      }`}
                    >
                      {p.type === "blog" ? (
                        <FileText size={10} className="shrink-0" />
                      ) : (
                        <Linkedin size={10} className="shrink-0" />
                      )}
                      <span className="truncate">
                        {p.type === "blog" ? p.title || "Untitled" : p.content}
                      </span>
                    </button>
                  ))}
                  {dayPosts.length > 3 && (
                    <span className="text-xs text-gray-400 px-1">+{dayPosts.length - 3} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
