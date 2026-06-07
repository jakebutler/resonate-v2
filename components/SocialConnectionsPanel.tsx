"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Link2, CheckCircle2, XCircle } from "lucide-react";

type ValidationDiagnostics = {
  approvalFlagConfigured: boolean;
  bufferKeyConfigured: boolean;
  zernioKeyConfigured: boolean;
};

type PlatformValidation = {
  platform: string;
  providerId: string;
  ok: boolean;
  accountLabel?: string;
  reason?: string;
  sanitizedResponse: Record<string, unknown>;
  diagnostics?: ValidationDiagnostics;
};

type ValidationResponse = {
  checkedAt: string;
  diagnostics?: ValidationDiagnostics;
  platforms: PlatformValidation[];
};

function diagnosticHints(
  platform: PlatformValidation,
  diagnostics: ValidationDiagnostics | undefined
): string[] {
  const hints: string[] = [];
  const diag = diagnostics ?? platform.diagnostics;
  if (!diag) return hints;

  if (
    platform.reason?.includes("Live provider validation requires explicit approval") &&
    !diag.approvalFlagConfigured
  ) {
    hints.push("Set LIVE_PROVIDER_VALIDATION_APPROVED to approved, true, or 1 in server env.");
  } else if (
    platform.reason?.includes("Live provider validation requires explicit approval") &&
    diag.approvalFlagConfigured
  ) {
    hints.push(
      "LIVE_PROVIDER_VALIDATION_APPROVED is set but not recognized. Use approved, true, or 1."
    );
  }

  if (platform.providerId === "buffer" && !diag.bufferKeyConfigured) {
    hints.push("BUFFER_API_KEY is not configured in server env.");
  }
  if (platform.providerId === "zernio" && !diag.zernioKeyConfigured) {
    hints.push("ZERNIO_API_KEY is not configured in server env.");
  }

  return hints;
}

export function SocialConnectionsPanel() {
  const [data, setData] = useState<ValidationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/providers/validate");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Connection check failed.");
      }
      setData(payload as ValidationResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection check failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="rounded-lg border border-black/10 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#15616d]">
            <Link2 size={16} />
            Social connections
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Read-only checks against your configured Buffer (LinkedIn) and Zernio (Reddit)
            credentials. No posts are scheduled from this panel.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-60"
          disabled={loading}
          onClick={() => void refresh()}
          type="button"
        >
          <RefreshCw className={loading ? "animate-spin" : ""} size={14} />
          Refresh
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {(data?.platforms ?? []).map((platform) => {
          const hints = platform.ok
            ? []
            : diagnosticHints(platform, data?.diagnostics ?? platform.diagnostics);
          return (
            <div
              className="rounded-md border border-black/10 px-3 py-3"
              key={platform.providerId}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{platform.platform}</p>
                  <p className="text-sm text-gray-600">
                    {platform.ok
                      ? platform.accountLabel || "Connected"
                      : platform.reason || "Authentication failed"}
                  </p>
                  {!platform.ok && hints.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-gray-600">
                      {hints.map((hint) => (
                        <li key={hint}>{hint}</li>
                      ))}
                    </ul>
                  )}
                  {!platform.ok && (data?.diagnostics ?? platform.diagnostics) && (
                    <dl className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-gray-500 sm:grid-cols-3">
                      <div>
                        <dt>Approval flag</dt>
                        <dd>
                          {(data?.diagnostics ?? platform.diagnostics)?.approvalFlagConfigured
                            ? "configured"
                            : "missing"}
                        </dd>
                      </div>
                      <div>
                        <dt>Buffer key</dt>
                        <dd>
                          {(data?.diagnostics ?? platform.diagnostics)?.bufferKeyConfigured
                            ? "configured"
                            : "missing"}
                        </dd>
                      </div>
                      <div>
                        <dt>Zernio key</dt>
                        <dd>
                          {(data?.diagnostics ?? platform.diagnostics)?.zernioKeyConfigured
                            ? "configured"
                            : "missing"}
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>
                {platform.ok ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                    <CheckCircle2 size={14} />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                    <XCircle size={14} />
                    Failed
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {!loading && !data?.platforms?.length && !error && (
          <p className="text-sm text-gray-500">No connection results yet.</p>
        )}
      </div>

      {data?.checkedAt && (
        <p className="mt-3 text-xs text-gray-500">
          Last checked {new Date(data.checkedAt).toLocaleString()}
        </p>
      )}
    </section>
  );
}
