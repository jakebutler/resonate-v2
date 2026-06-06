"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, Copy, CheckCheck, Check, ChevronUp } from "lucide-react";
import { MODELS, DEFAULT_MODEL, type ModelOption } from "@/lib/models";

type AssistantVariant = "blog" | "linkedin";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AIAssistantProps {
  onUsePost: (content: string) => void;
  models?: ModelOption[];
  variant?: AssistantVariant;
}

const ASSISTANT_COPY: Record<
  AssistantVariant,
  { greeting: string; headerTitle: string; inputPlaceholder: string }
> = {
  linkedin: {
    greeting:
      "Hi! I'm here to help you craft the perfect LinkedIn post. Tell me about what you'd like to share — a company update, industry insight, or perhaps a thought leadership piece?",
    headerTitle: "AI Writing Assistant",
    inputPlaceholder: "Describe what you want to post about...",
  },
  blog: {
    greeting:
      "Hi! I'm here to help you shape a strong blog post. Share the topic, angle, and any rough notes, and I can turn them into an outline or draft.",
    headerTitle: "AI Blog Copilot",
    inputPlaceholder: "Describe the blog post you want to write...",
  },
};

export function AIAssistant({
  onUsePost,
  models = MODELS,
  variant = "linkedin",
}: AIAssistantProps) {
  const copy = ASSISTANT_COPY[variant];
  const initialModel = models.find((model) => model.id === DEFAULT_MODEL.id) ?? models[0];
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: copy.greeting },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelOption>(initialModel);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    setMessages([{ role: "assistant", content: copy.greeting }]);
    setInput("");
    setStreaming(false);
    setCopied(null);
    setModelMenuOpen(false);
  }, [copy.greeting]);

  useEffect(() => {
    setSelectedModel((current) => {
      const stillAvailable = models.find((model) => model.id === current.id);
      if (stillAvailable) return stillAvailable;
      return models.find((model) => model.id === DEFAULT_MODEL.id) ?? models[0];
    });
  }, [models]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    function handleKeyOrClick(e: KeyboardEvent | MouseEvent) {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") {
          setModelMenuOpen(false);
          modelTriggerRef.current?.focus();
        }
        return;
      }
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleKeyOrClick);
    document.addEventListener("keydown", handleKeyOrClick);
    return () => {
      document.removeEventListener("mousedown", handleKeyOrClick);
      document.removeEventListener("keydown", handleKeyOrClick);
    };
  }, [modelMenuOpen]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    // Add empty assistant message to stream into
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages
            .filter((m) => m.role !== "assistant" || m.content !== copy.greeting)
            .map((m) => ({ role: m.role, content: m.content })),
          model: selectedModel.id,
          assistantType: variant,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Request failed (${res.status})`);
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const appendDelta = (delta: string) => {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: updated[updated.length - 1].content + delta,
          };
          return updated;
        });
      };

      const processEventBlock = (eventBlock: string): { done: boolean; error: Error | null } => {
        const lines = eventBlock.split("\n").filter((line) => line.startsWith("data: "));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") return { done: true, error: null };
          try {
            const json = JSON.parse(data);
            if (json.type === "response.completed") {
              return { done: true, error: null };
            }
            if (json.type === "response.failed") {
              return {
                done: true,
                error: new Error(json.response?.error ?? "response.failed"),
              };
            }

            const delta =
              json.type === "content_block_delta" && json.delta?.type === "text_delta"
                ? json.delta.text
                : json.type === "response.output_text.delta"
                ? json.delta
                : json.choices?.[0]?.delta?.content;
            if (delta) appendDelta(delta);
          } catch {
            // Ignore incomplete or non-JSON event data.
          }
        }

        return { done: false, error: null };
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

        while (true) {
          const boundary = buffer.indexOf("\n\n");
          if (boundary === -1) break;

          const eventBlock = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          const { done: eventDone, error } = processEventBlock(eventBlock);
          if (error) throw error;
          if (eventDone) return;
        }

        if (done) {
          const remainder = buffer.trim();
          if (remainder) {
            const { error } = processEventBlock(remainder);
            if (error) throw error;
          }
          break;
        }
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("AI Assistant error:", detail);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: detail || "Sorry, something went wrong. Please try again.",
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  };

  const handleCopy = (idx: number, content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#4f46e5] rounded-xl mb-4">
        <Sparkles size={18} className="text-white" />
        <span className="font-semibold text-white">{copy.headerTitle}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-[#4f46e5] flex items-center justify-center shrink-0 mr-2 mt-0.5">
                <Sparkles size={14} className="text-white" />
              </div>
            )}
            <div
              className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${
                msg.role === "user"
                  ? "bg-[#001524] text-white rounded-tr-sm"
                  : "bg-gray-100 text-[#001524] rounded-tl-sm"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.role === "assistant" && msg.content && i > 0 && (
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-200">
                  <button
                    onClick={() => handleCopy(i, msg.content)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    {copied === i ? <CheckCheck size={12} /> : <Copy size={12} />}
                    {copied === i ? "Copied" : "Copy"}
                  </button>
                  <button
                    onClick={() => onUsePost(msg.content)}
                    className="flex items-center gap-1 text-xs font-medium text-[#ff7d00] hover:text-[#e67200] transition-colors"
                  >
                    Use this post →
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {streaming && (
          <div className="flex justify-start">
            <div className="w-8 h-8 rounded-full bg-[#4f46e5] flex items-center justify-center shrink-0 mr-2">
              <Sparkles size={14} className="text-white" />
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder={copy.inputPlaceholder}
          disabled={streaming}
          rows={3}
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4f46e5] focus:border-transparent disabled:opacity-50 resize-none"
        />
        <div className="flex items-center justify-between mt-1.5">
          {/* Model selector */}
          <div className="relative pl-4" ref={modelMenuRef}>
            <button
              ref={modelTriggerRef}
              onClick={() => setModelMenuOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={modelMenuOpen}
              aria-label={`Select AI model. Current: ${selectedModel.label}`}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              {selectedModel.label}
              <ChevronUp
                size={13}
                aria-hidden="true"
                className={`transition-transform ${modelMenuOpen ? "" : "rotate-180"}`}
              />
            </button>
            {modelMenuOpen && (
              <div
                role="listbox"
                aria-label="AI model options"
                className="absolute bottom-full mb-2 left-0 bg-[#1a1a2e] rounded-xl shadow-xl py-1.5 z-10 min-w-[160px]"
              >
                {models.map((m) => (
                  <button
                    key={m.id}
                    role="option"
                    aria-selected={selectedModel.id === m.id}
                    onClick={() => {
                      setSelectedModel(m);
                      setModelMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none flex items-center justify-between transition-colors"
                  >
                    {m.label}
                    {selectedModel.id === m.id && (
                      <Check size={13} aria-hidden="true" className="text-[#4f46e5]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Send button */}
          <button
            onClick={sendMessage}
            disabled={!input.trim() || streaming}
            className="px-4 py-1.5 bg-[#4f46e5] text-white rounded-xl text-sm font-medium hover:bg-[#4338ca] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
