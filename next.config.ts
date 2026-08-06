import type { NextConfig } from "next";
import path from "path";

/** Prefer *_DEV Clerk keys on localhost and Vercel Preview when both prod and dev keys live in `.env.local`. */
const vercelEnv = process.env.VERCEL_ENV?.trim();
const useDevClerkKeys =
  vercelEnv === "preview" ||
  vercelEnv === "development" ||
  (!vercelEnv && process.env.NODE_ENV !== "production");
if (useDevClerkKeys) {
  const devPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY_DEV?.trim();
  if (devPublishableKey) {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = devPublishableKey;
  }
  const devSecretKey = process.env.CLERK_SECRET_KEY_DEV?.trim();
  if (devSecretKey) {
    process.env.CLERK_SECRET_KEY = devSecretKey;
  }
}

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
