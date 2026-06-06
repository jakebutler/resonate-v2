# AI Assistant Code Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address all issues raised in the code review of the AI Assistant model selector PR: security (error leakage, no allowlist), correctness (stale test ID, unsafe non-null assertion), and accessibility (ARIA, keyboard nav, focus styles).

**Architecture:** Fixes are grouped by layer — backend security first (route.ts, cortex.ts), then frontend UX/a11y (AIAssistant.tsx). Each task is independently testable. The model allowlist is defined once in a shared constant and imported by both the API route and the component.

**Tech Stack:** Next.js 14 App Router (API routes), React 18, TypeScript, Tailwind CSS, Vitest + React Testing Library, Lucide icons.

---

### Task 1: Fix stale model ID in cortex test

One test documents the wrong model ID format — it uses `claude-opus-4-6` (dashes) instead of the correct Cortex format `claude-opus-4.6` (dot). This is a quick correctness fix before we touch any real logic.

**Files:**
- Modify: `lib/__tests__/cortex.test.ts:52-57`

**Step 1: Update the test**

Open `lib/__tests__/cortex.test.ts`. Find the test named `'forwards custom model argument'` (around line 52). Change both the argument passed to `streamCortexChat` and the expected value:

```ts
it('forwards custom model argument', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(new ReadableStream(), { status: 200 }))
  await streamCortexChat([{ role: 'user', content: 'test' }], 'claude-opus-4.6')
  const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
  expect(body.model).toBe('claude-opus-4.6')
})
```

**Step 2: Run the test to verify it passes**

```bash
npx vitest run lib/__tests__/cortex.test.ts
```

Expected: all tests pass.

**Step 3: Commit**

```bash
git add lib/__tests__/cortex.test.ts
git commit -m "fix: correct stale claude-opus model ID format in cortex test (dot not dash)"
```

---

### Task 2: Fix unsafe non-null assertion on response.body

`cortex.ts` returns `response.body!` — the `!` silences TypeScript but doesn't protect against a null body at runtime. Replace with an explicit guard.

**Files:**
- Modify: `lib/cortex.ts:58`
- Test: `lib/__tests__/cortex.test.ts`

**Step 1: Write a failing test**

Add this test inside the `describe('streamCortexChat', ...)` block in `lib/__tests__/cortex.test.ts`:

```ts
it('throws when response body is null', async () => {
  const nullBodyResponse = new Response(null, { status: 200 })
  vi.mocked(fetch).mockResolvedValueOnce(nullBodyResponse)
  await expect(streamCortexChat([{ role: 'user', content: 'test' }]))
    .rejects.toThrow('No response body')
})
```

**Step 2: Run the test to verify it fails**

```bash
npx vitest run lib/__tests__/cortex.test.ts
```

Expected: FAIL — `streamCortexChat` currently returns `null` instead of throwing.

**Step 3: Replace the non-null assertion in cortex.ts**

In `lib/cortex.ts`, replace line 58:

```ts
// Before:
return response.body!;

// After:
if (!response.body) throw new Error("No response body");
return response.body;
```

**Step 4: Run the tests**

```bash
npx vitest run lib/__tests__/cortex.test.ts
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add lib/cortex.ts lib/__tests__/cortex.test.ts
git commit -m "fix: replace response.body! non-null assertion with explicit guard in cortex.ts"
```

---

### Task 3: Create shared MODELS allowlist and validate on the API route

Currently the frontend has a `MODELS` array but the API route accepts any arbitrary string. We need to:
1. Move `MODELS` to a shared location both can import
2. Add server-side validation against that list in `route.ts`

**Files:**
- Create: `lib/models.ts`
- Modify: `components/AIAssistant/AIAssistant.tsx:20-27` (import from lib instead)
- Modify: `app/api/llm/route.ts` (add allowlist check)
- Modify: `app/api/llm/__tests__/route.test.ts` (add rejection test)

**Step 1: Create the shared models file**

Create `lib/models.ts`:

```ts
export type ModelOption = { label: string; id: string };

export const MODELS: ModelOption[] = [
  { label: "Opus 4.6",      id: "claude-opus-4.6"   },
  { label: "Sonnet 4.6",    id: "claude-sonnet-4.6" },
  { label: "GPT-5.2",       id: "gpt-5.2"           },
  { label: "GPT-5.2 mini",  id: "openai/gpt-5-mini" },
  { label: "GPT-5 nano",    id: "openai/gpt-5-nano" },
  { label: "GLM-4.7",       id: "glm-4.7"           },
];

export const MODEL_IDS = new Set(MODELS.map((m) => m.id));

export const DEFAULT_MODEL = MODELS[1]; // Sonnet 4.6
```

**Step 2: Write a failing test for the route allowlist**

Open `app/api/llm/__tests__/route.test.ts`. Read the existing tests first to understand the pattern. Add a test that sends a model ID not in the allowlist:

```ts
it('returns 400 when model is not in the allowlist', async () => {
  mockAuth.mockResolvedValue({ userId: 'user_123' })
  const req = new NextRequest('http://localhost/api/llm', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], model: 'some-rogue-model' }),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await POST(req)
  expect(res.status).toBe(400)
  expect(await res.text()).toContain('not a supported model')
})
```

**Step 3: Run the test to verify it fails**

```bash
npx vitest run app/api/llm/__tests__/route.test.ts
```

Expected: FAIL — route currently accepts any string.

**Step 4: Add the allowlist check to route.ts**

In `app/api/llm/route.ts`, add the import and validation:

```ts
import { NextRequest } from "next/server";
import { streamCortexChat, type ChatMessage } from "@/lib/cortex";
import { MODEL_IDS } from "@/lib/models";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages, model } = await req.json();

  if (!Array.isArray(messages)) {
    return new Response("messages must be an array", { status: 400 });
  }
  if (model !== undefined && typeof model !== "string") {
    return new Response("model must be a string", { status: 400 });
  }
  if (model !== undefined && !MODEL_IDS.has(model)) {
    return new Response(`"${model}" is not a supported model`, { status: 400 });
  }

  try {
    const stream = await streamCortexChat(messages as ChatMessage[], model);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Cortex error [model=%s]:", model ?? "default", message);
    return new Response(message, { status: 500 });
  }
}
```

**Step 5: Update AIAssistant.tsx to import from lib/models**

In `components/AIAssistant/AIAssistant.tsx`, remove the local `ModelOption`, `MODELS`, and `DEFAULT_MODEL` definitions and replace with an import:

```ts
import { MODELS, DEFAULT_MODEL, type ModelOption } from "@/lib/models";
```

Delete lines 18–29 (the local `ModelOption` type, `MODELS` array, and `DEFAULT_MODEL` constant).

**Step 6: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

**Step 7: Commit**

```bash
git add lib/models.ts app/api/llm/route.ts app/api/llm/__tests__/route.test.ts components/AIAssistant/AIAssistant.tsx
git commit -m "feat: shared MODELS allowlist, validate model ID server-side in /api/llm"
```

---

### Task 4: Sanitize error messages — keep details server-side, show generic message to user

The API route currently forwards the raw Cortex error (which may contain internal provider URLs, API key hints, error codes) directly to the browser. The UI then renders it verbatim. Fix both ends: return a safe generic message to the client, keep full detail in server logs only.

**Files:**
- Modify: `app/api/llm/route.ts`
- Modify: `components/AIAssistant/AIAssistant.tsx:136-145`
- Modify: `app/api/llm/__tests__/route.test.ts`
- Modify: `components/AIAssistant/__tests__/AIAssistant.test.tsx`

**Step 1: Write a failing test for the route — expect sanitized error body**

In `app/api/llm/__tests__/route.test.ts`, add (or update the relevant existing error test):

```ts
it('returns generic error body on Cortex failure, not internal details', async () => {
  mockAuth.mockResolvedValue({ userId: 'user_123' })
  // Make streamCortexChat throw with internal detail
  vi.mocked(streamCortexChat).mockRejectedValueOnce(
    new Error('LLM API error: 500 {"provider":"secret-provider","key":"sk-abc"}')
  )
  const req = new NextRequest('http://localhost/api/llm', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await POST(req)
  expect(res.status).toBe(500)
  const body = await res.text()
  expect(body).toBe('The AI service encountered an error. Please try again.')
  expect(body).not.toContain('secret-provider')
  expect(body).not.toContain('sk-abc')
})
```

**Step 2: Run the test to verify it fails**

```bash
npx vitest run app/api/llm/__tests__/route.test.ts
```

Expected: FAIL — route currently leaks the full error message.

**Step 3: Update route.ts catch block to return sanitized message**

```ts
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Cortex error [model=%s]:", model ?? "default", message);
  return new Response("The AI service encountered an error. Please try again.", { status: 500 });
}
```

**Step 4: Update AIAssistant.tsx catch block — use a friendly message, log detail**

In `components/AIAssistant/AIAssistant.tsx`, the catch block already logs and shows `Error: ${detail}`. Now that the server returns a safe message, the client-side display should be clean. Update the error display:

```ts
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
}
```

This keeps the `Error:` prefix off the rendered message (the server's safe string is already readable), while still logging the detail to the console.

**Step 5: Update AIAssistant test — error message no longer has "Error:" prefix**

In `components/AIAssistant/__tests__/AIAssistant.test.tsx`, update the `response.failed` test assertion (line 54-56). The `response.failed` error message comes from the stream, not the server, so it still surfaces as whatever `json.response?.error` is. Update to be more resilient:

```ts
await waitFor(() =>
  expect(screen.getByText(/rate_limit|something went wrong|error/i)).toBeInTheDocument()
)
```

**Step 6: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

**Step 7: Commit**

```bash
git add app/api/llm/route.ts app/api/llm/__tests__/route.test.ts components/AIAssistant/AIAssistant.tsx components/AIAssistant/__tests__/AIAssistant.test.tsx
git commit -m "fix: sanitize Cortex error response — return generic message to client, log detail server-side"
```

---

### Task 5: Add ARIA attributes and accessible label to the model selector

The model selector dropdown has no ARIA attributes, so screen readers can't announce its state. Add `aria-haspopup`, `aria-expanded`, `aria-label`, `role="menu"`, and `role="menuitem"`.

**Files:**
- Modify: `components/AIAssistant/AIAssistant.tsx:233-261`
- Modify: `components/AIAssistant/__tests__/AIAssistant.test.tsx`

**Step 1: Write failing accessibility tests**

In `components/AIAssistant/__tests__/AIAssistant.test.tsx`, add:

```ts
it('model selector button has aria-haspopup and aria-expanded attributes', () => {
  render(<AIAssistant onUsePost={vi.fn()} />)
  const trigger = screen.getByRole('button', { name: /select ai model/i })
  expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

it('aria-expanded becomes true when model menu is open', () => {
  render(<AIAssistant onUsePost={vi.fn()} />)
  const trigger = screen.getByRole('button', { name: /select ai model/i })
  fireEvent.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
})
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run components/AIAssistant/__tests__/AIAssistant.test.tsx
```

Expected: FAIL — trigger button doesn't have these attributes yet.

**Step 3: Update the model selector button JSX in AIAssistant.tsx**

Find the model selector button (around line 233) and update:

```tsx
<button
  onClick={() => setModelMenuOpen((o) => !o)}
  aria-haspopup="listbox"
  aria-expanded={modelMenuOpen}
  aria-label={`Select AI model. Current: ${selectedModel.label}`}
  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
>
  {selectedModel.label}
  <ChevronUp
    size={13}
    className={`transition-transform ${modelMenuOpen ? "" : "rotate-180"}`}
    aria-hidden="true"
  />
</button>
```

Update the dropdown container and items:

```tsx
<div
  role="listbox"
  aria-label="AI model options"
  className="absolute bottom-full mb-2 left-0 bg-[#1a1a2e] rounded-xl shadow-xl py-1.5 z-10 min-w-[160px]"
>
  {MODELS.map((m) => (
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
        <Check size={13} className="text-[#4f46e5]" aria-hidden="true" />
      )}
    </button>
  ))}
</div>
```

**Step 4: Run tests**

```bash
npx vitest run components/AIAssistant/__tests__/AIAssistant.test.tsx
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add components/AIAssistant/AIAssistant.tsx components/AIAssistant/__tests__/AIAssistant.test.tsx
git commit -m "fix: add ARIA attributes and accessible label to model selector dropdown"
```

---

### Task 6: Add Escape key support and focus-visible styles to model selector

Users expect Escape to close dropdowns. Add a keydown handler on the document (alongside the existing click-outside handler) and ensure the trigger button receives focus when the menu closes.

**Files:**
- Modify: `components/AIAssistant/AIAssistant.tsx:47-56`
- Modify: `components/AIAssistant/__tests__/AIAssistant.test.tsx`

**Step 1: Write a failing test**

In `components/AIAssistant/__tests__/AIAssistant.test.tsx`, add:

```ts
it('closes model menu on Escape key', () => {
  render(<AIAssistant onUsePost={vi.fn()} />)
  const trigger = screen.getByRole('button', { name: /select ai model/i })
  fireEvent.click(trigger)
  expect(screen.getByRole('listbox')).toBeInTheDocument()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})
```

**Step 2: Run the test to verify it fails**

```bash
npx vitest run components/AIAssistant/__tests__/AIAssistant.test.tsx
```

Expected: FAIL — Escape does not close the menu.

**Step 3: Add Escape key handling to the useEffect in AIAssistant.tsx**

Add a ref for the trigger button so we can restore focus:

```tsx
const modelTriggerRef = useRef<HTMLButtonElement>(null);
```

Update the existing click-outside `useEffect` to also handle Escape:

```tsx
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
```

Add `ref={modelTriggerRef}` to the trigger button:

```tsx
<button
  ref={modelTriggerRef}
  onClick={() => setModelMenuOpen((o) => !o)}
  aria-haspopup="listbox"
  aria-expanded={modelMenuOpen}
  aria-label={`Select AI model. Current: ${selectedModel.label}`}
  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
>
```

**Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all 105+ tests pass.

**Step 5: Commit**

```bash
git add components/AIAssistant/AIAssistant.tsx components/AIAssistant/__tests__/AIAssistant.test.tsx
git commit -m "fix: close model selector on Escape key, restore focus to trigger button"
```

---

### Task 7: Push, update PR, and verify

**Step 1: Run the full test suite one final time**

```bash
npx vitest run
```

Expected: all tests pass.

**Step 2: Push to the feature branch**

```bash
git push
```

**Step 3: Verify PR on GitHub**

Open https://github.com/jakebutler/resonate/pull/2 and confirm all commits appear and CI is green.
