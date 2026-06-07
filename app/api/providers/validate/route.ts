import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  adapterForProvider,
  type ProviderValidationResult,
} from "@/lib/providerAdapters";

function isLiveProviderValidationApproved(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "approved" || normalized === "true" || normalized === "1";
}

function validationDiagnostics() {
  return {
    approvalFlagConfigured: Boolean(process.env.LIVE_PROVIDER_VALIDATION_APPROVED?.trim()),
    bufferKeyConfigured: Boolean(process.env.BUFFER_API_KEY?.trim()),
    zernioKeyConfigured: Boolean(process.env.ZERNIO_API_KEY?.trim()),
  };
}

function validationContext() {
  const approvalFlag = process.env.LIVE_PROVIDER_VALIDATION_APPROVED;
  return {
    env: {
      BUFFER_API_KEY: process.env.BUFFER_API_KEY,
      ZERNIO_API_KEY: process.env.ZERNIO_API_KEY,
      LIVE_PROVIDER_VALIDATION_APPROVED: approvalFlag,
    },
    liveProviderValidationApproved: isLiveProviderValidationApproved(approvalFlag),
  };
}

async function validateProvider(
  providerId: "buffer" | "zernio"
): Promise<ProviderValidationResult> {
  const adapter = adapterForProvider(providerId);
  return adapter.validateConnection(validationContext());
}

export async function GET() {
  if (process.env.E2E_BYPASS_AUTH !== "1") {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const diagnostics = validationDiagnostics();
  const [linkedin, reddit] = await Promise.all([
    validateProvider("buffer"),
    validateProvider("zernio"),
  ]);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    diagnostics,
    platforms: [
      {
        platform: "LinkedIn",
        ...linkedin,
        diagnostics,
      },
      {
        platform: "Reddit",
        ...reddit,
        diagnostics,
      },
    ],
  });
}
