import { UserButton } from "@clerk/nextjs";
import { AudioWaveform, Settings } from "lucide-react";
import Link from "next/link";
import { IdeasPage } from "@/components/IdeasPage/IdeasPage";

function HeaderUserControl() {
  if (process.env.E2E_BYPASS_AUTH === "1") {
    return (
      <div className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-500">
        Auth bypass
      </div>
    );
  }

  return <UserButton afterSignOutUrl="/sign-in" />;
}

export default function IdeasRoute() {
  if (process.env.E2E_BYPASS_AUTH === "1") {
    return (
      <div className="min-h-screen bg-[#fafafa]">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-3">
          <div className="flex items-center gap-2">
            <AudioWaveform size={20} className="text-[#001524]" />
            <span className="font-forum text-lg font-semibold text-[#001524]">Resonate</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/v2"
              className="flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-[#001524]"
            >
              v2 workspace
            </Link>
            <HeaderUserControl />
          </div>
        </header>
        <main className="mx-auto flex max-w-[960px] flex-col gap-4 px-5 py-10 md:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
            Local verification shell
          </p>
          <h1 className="font-forum text-[2.5rem] leading-none text-[#001524] md:text-[3rem]">
            Legacy ideas route is still mounted.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-gray-600">
            The authenticated Convex ideas experience remains active in production. This bypass
            route exists only so local side-by-side builds can verify the legacy URL while v2 runs
            without live auth credentials.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <AudioWaveform size={20} className="text-[#001524]" />
          <span className="font-forum text-lg font-semibold text-[#001524]">Resonate</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/setup"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#001524] transition-colors"
          >
            <Settings size={15} />
            Reconfigure
          </Link>
          <HeaderUserControl />
        </div>
      </header>
      <IdeasPage />
    </div>
  );
}
