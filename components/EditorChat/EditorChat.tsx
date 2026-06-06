"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, Copy, CheckCheck, Check, ChevronUp, X, PanelRightClose } from "lucide-react";
import { MODELS, DEFAULT_MODEL, type ModelOption } from "@/lib/models";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface EditorChatProps {
  /** Currently selected text in the editor, if any */
  selectedText?: string;
  /** Called when the user dismisses the selection chip */
  onDismissSelection?: () => void;
  /** Called when the collapse toggle is clicked */
  onCollapse?: () => void;
  /** Called when the user accepts a suggestion (rewrite) */
  onAcceptSuggestion?: (suggestion: string, originalText: string) => void;
  models?: ModelOption[];
  focusRequestId?: number;
}

const GREETING =
  "Hi! I'm your Blog Copilot. I can help you refine your writing, suggest improvements, or answer questions about your draft. Highlight text in the editor and click Ask AI to get focused feedback on a specific passage.";

const SELECTION_TRUNCATE_LENGTH = 80;
const FALLBACK_ERROR_MESSAGE = "Something went wrong. Please try again.";

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

function extractRewrite(content: string) {
  const match = content.match(/<rewrite>([\s\S]*?)<\/rewrite>/i);
  if (!match) {
    return {
      rewrite: null,
      message: content,
    };
  }

  const message = content.replace(match[0], "").trim();
  return {
    rewrite: match[1].trim(),
    message: message || "Suggested rewrite",
  };
}

function makeStream(chunks: string[]): ReadableStream {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
}
// Keep makeStream available for module-level use
void makeStream;

export function EditorChat({
  selectedText = "",
  onDismissSelection,
  onCollapse,
  onAcceptSuggestion,
  models = MODELS,
  focusRequestId = 0,
}: EditorChatProps) {
  const initialModel = models.find((m) => m.id === DEFAULT_MODEL.id) ?? models[0] ?? null;
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(initialModel);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<number[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (focusRequestId > 0) {
      inputRef.current?.focus();
    }
  }, [focusRequestId]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [modelMenuOpen]);

  useEffect(() => {
    if (models.length === 0) {
      setSelectedModel(null);
      setModelMenuOpen(false);
      return;
    }

    setSelectedModel((current) => {
      if (current && models.some((model) => model.id === current.id)) {
        return current;
      }
      return models.find((model) => model.id === DEFAULT_MODEL.id) ?? models[0];
    });
  }, [models]);

  const buildUserContent = (text: string): string => {
    if (!selectedText) return text;
    return [
      `> "${selectedText}"`,
      "",
      text,
      "",
      "If you're proposing replacement copy for the selected text, wrap only the rewrite in <rewrite>...</rewrite>.",
    ].join("\n");
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming || !selectedModel) return;

    const userContent = buildUserContent(text);
    const userMsg: Message = { role: "user", content: userContent };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages
            .filter((m) => !(m.role === "assistant" && m.content === GREETING))
            .map((m) => ({ role: m.role, content: m.content })),
          model: selectedModel.id,
          assistantType: "blog",
        }),
      });

      if (!res.ok) {
        const detail = await res.text();
        console.error("EditorChat request failed", {
          status: res.status,
          detail,
        });
        throw new Error(FALLBACK_ERROR_MESSAGE);
      }
      if (!res.body) {
        console.error("EditorChat response missing body");
        throw new Error(FALLBACK_ERROR_MESSAGE);
      }

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

      const processBlock = (block: string): { done: boolean } => {
        const lines = block.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") return { done: true };
          try {
            const json = JSON.parse(data);
            if (json.type === "response.completed") return { done: true };
            if (json.type === "response.failed") return { done: true };
            const delta =
              json.type === "content_block_delta" && json.delta?.type === "text_delta"
                ? json.delta.text
                : json.type === "response.output_text.delta"
                ? json.delta
                : json.choices?.[0]?.delta?.content;
            if (delta) appendDelta(delta);
          } catch {
            // skip malformed
          }
        }
        return { done: false };
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

        while (true) {
          const boundary = buffer.indexOf("\n\n");
          if (boundary === -1) break;
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const { done: blockDone } = processBlock(block);
          if (blockDone) return;
        }

        if (done) {
          if (buffer.trim()) processBlock(buffer.trim());
          break;
        }
      }
    } catch (err) {
      console.error("EditorChat streaming failed", err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: FALLBACK_ERROR_MESSAGE,
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

  const handleAcceptSuggestion = (content: string) => {
    if (onAcceptSuggestion && selectedText) {
      onAcceptSuggestion(content, selectedText);
    }
  };

  const handleDismissSuggestion = (idx: number) => {
    setDismissedSuggestions((prev) =>
      prev.includes(idx) ? prev : [...prev, idx]
    );
  };

  const selectedModelLabel = selectedModel?.label ?? "No models available";
  const canSend = Boolean(input.trim() && !streaming && selectedModel);

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#4f46e5] flex items-center justify-center">
            <Sparkles size={14} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-[#001524]">Blog Copilot</span>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse sidebar"
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      {/* Selection chip */}
      {selectedText && (
        <div
          data-testid="selection-chip"
          className="mx-4 mt-3 flex items-start gap-2 px-3 py-2 bg-[#ffecd1] rounded-lg text-xs text-[#78290f]"
        >
          <span className="flex-1 min-w-0 break-words">
            <span className="font-medium">Selected: </span>
            {truncate(selectedText, SELECTION_TRUNCATE_LENGTH)}
          </span>
          <button
            type="button"
            onClick={onDismissSelection}
            aria-label="Dismiss selection"
            className="shrink-0 p-0.5 rounded hover:bg-[#ffd9b0] transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => {
          const { rewrite, message } =
            msg.role === "assistant"
              ? extractRewrite(msg.content)
              : { rewrite: null, message: msg.content };
          const suggestionDismissed = dismissedSuggestions.includes(i);

          return (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-[#4f46e5] flex items-center justify-center shrink-0 mr-2 mt-0.5">
                  <Sparkles size={13} className="text-white" />
                </div>
              )}
              <div
                className={`max-w-[85%] px-3 py-2.5 rounded-2xl text-sm ${
                  msg.role === "user"
                    ? "bg-[#001524] text-white rounded-tr-sm"
                    : "bg-gray-100 text-[#001524] rounded-tl-sm"
                }`}
              >
                <p className="whitespace-pre-wrap">{message}</p>
                {rewrite && !suggestionDismissed ? (
                  <div
                    data-testid={`suggestion-card-${i}`}
                    className="mt-3 rounded-xl border border-[#c7d2fe] bg-white px-3 py-3 text-[#001524]"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4f46e5]">
                      Suggested rewrite
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{rewrite}</p>
                    <div className="mt-3 flex items-center gap-2">
                      {selectedText && onAcceptSuggestion ? (
                        <button
                          onClick={() => handleAcceptSuggestion(rewrite)}
                          className="rounded-full bg-[#4f46e5] px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-[#4338ca]"
                        >
                          Accept
                        </button>
                      ) : null}
                      <button
                        onClick={() => handleDismissSuggestion(i)}
                        className="text-xs text-gray-500 transition-colors hover:text-gray-700"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ) : null}
                {rewrite && suggestionDismissed ? (
                  <p className="mt-3 text-xs text-gray-500">Suggestion dismissed.</p>
                ) : null}
                {msg.role === "assistant" && msg.content && i > 0 ? (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
                    <button
                      onClick={() => handleCopy(i, msg.content)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      {copied === i ? <CheckCheck size={11} /> : <Copy size={11} />}
                      {copied === i ? "Copied" : "Copy"}
                    </button>
                    {selectedText && onAcceptSuggestion && !rewrite ? (
                      <button
                        onClick={() => handleAcceptSuggestion(msg.content)}
                        className="flex items-center gap-1 text-xs font-medium text-[#ff7d00] hover:text-[#e67200] transition-colors"
                      >
                        Accept →
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        {streaming && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-[#4f46e5] flex items-center justify-center shrink-0 mr-2">
              <Sparkles size={13} className="text-white" />
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2.5">
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

      {/* Input area */}
      <div className="px-4 pb-4 pt-2 shrink-0">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            const nativeEvent = e.nativeEvent as KeyboardEvent & {
              isComposing?: boolean;
              keyCode?: number;
            };
            if (nativeEvent.isComposing || nativeEvent.keyCode === 229) {
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder={
            selectedText
              ? "Ask about the selected text..."
              : "Ask your Blog Copilot..."
          }
          disabled={streaming}
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4f46e5] focus:border-transparent disabled:opacity-50 resize-none"
        />
        <div className="flex items-center justify-between mt-1.5">
          {/* Model selector */}
          <div className="relative" ref={modelMenuRef}>
            <button
              ref={modelTriggerRef}
              onClick={() => {
                if (!selectedModel) return;
                setModelMenuOpen((o) => !o);
              }}
              aria-haspopup="listbox"
              aria-expanded={modelMenuOpen}
              aria-label={`Select AI model. Current: ${selectedModelLabel}`}
              disabled={!selectedModel}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors disabled:cursor-not-allowed disabled:text-gray-400"
            >
              {selectedModelLabel}
              <ChevronUp
                size={12}
                className={`transition-transform ${modelMenuOpen ? "" : "rotate-180"}`}
              />
            </button>
            {modelMenuOpen && selectedModel ? (
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
                    className="w-full text-left px-3 py-2 text-xs text-white hover:bg-white/10 transition-colors flex items-center justify-between"
                  >
                    {m.label}
                    {selectedModel.id === m.id && <Check size={11} className="text-[#4f46e5]" />}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button
            onClick={sendMessage}
            disabled={!canSend}
            aria-label="Send message"
            className="px-3 py-1.5 bg-[#4f46e5] text-white rounded-xl text-xs font-medium hover:bg-[#4338ca] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
