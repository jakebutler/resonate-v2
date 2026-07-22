import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Resonate",
  description: "Publishing schedule manager for Corvo Labs",
};

/** Matches CI so preview/branch builds can prerender without Vercel env injection. */
const CLERK_BUILD_PLACEHOLDER_KEY = "pk_test_Y2xlcmsuYWNjb3VudHMuZGV2JA==";
const CONVEX_BUILD_PLACEHOLDER_URL = "https://convex.test";

const configuredClerkPublishableKey =
  (process.env.VERCEL_ENV === "production"
    ? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    : process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY_DEV ??
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  )?.trim() || undefined;
const clerkPublishableKey =
  configuredClerkPublishableKey ??
  (process.env.VERCEL_ENV === "production" ? undefined : CLERK_BUILD_PLACEHOLDER_KEY);
const configuredConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim() || undefined;
const convexUrl =
  configuredConvexUrl ??
  (process.env.VERCEL_ENV === "production" ? undefined : CONVEX_BUILD_PLACEHOLDER_URL);
const bypassAuthForE2E = process.env.E2E_BYPASS_AUTH === "1";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const app = (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className={`${inter.variable} antialiased`}>
        <ConvexClientProvider url={convexUrl} bypassAuth={bypassAuthForE2E}>
          {children}
        </ConvexClientProvider>
      </body>
    </html>
  );

  if (bypassAuthForE2E) {
    return app;
  }

  if (!clerkPublishableKey) {
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
    );
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      {app}
    </ClerkProvider>
  );
}
