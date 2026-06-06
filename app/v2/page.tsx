import Link from "next/link";
import { PersistedPublishingPanel } from "@/components/PersistedPublishingPanel";

export const metadata = {
  title: "Resonate v2",
  description: "Postiz-based multi-brand content operations for Corvo Labs",
};

type V2PageProps = {
  searchParams: Promise<{ postId?: string | string[] }>;
};

export default async function V2Page({ searchParams }: V2PageProps) {
  const resolvedSearchParams = await searchParams;
  const postIdRaw = resolvedSearchParams.postId;
  const initialPostId = Array.isArray(postIdRaw) ? postIdRaw[0] : postIdRaw;

  return (
    <>
      <nav
        aria-label="v2 surfaces"
        className="flex items-center gap-4 border-b border-slate-200 bg-white px-6 py-3 text-sm dark:border-slate-800 dark:bg-slate-950"
      >
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          Resonate v2
        </span>
        <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
          <Link
            href="/v2"
            aria-current="page"
            className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100"
          >
            Calendar &amp; composer
          </Link>
          <Link
            href="/v2/research"
            className="rounded-md px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Research &amp; AI
          </Link>
        </div>
      </nav>
      <PersistedPublishingPanel initialPostId={initialPostId} />
    </>
  );
}
