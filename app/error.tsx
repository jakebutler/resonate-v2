"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-xl font-semibold">Something went wrong.</h1>
      <p className="mt-2 text-sm text-gray-600">
        The surface failed to render. The error details are below — retry first;
        if it persists, note the message before reloading.
      </p>
      <pre className="mt-4 overflow-auto rounded-lg bg-[#f6f2ea] p-3 text-xs text-[#5c2a1a]">
        {error.message}
        {error.digest ? `\n\ndigest: ${error.digest}` : ""}
      </pre>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg bg-[#15616d] px-4 py-2 text-sm font-medium text-white"
      >
        Try again
      </button>
    </main>
  );
}
