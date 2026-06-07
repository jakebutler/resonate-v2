"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { FullScreenEditor } from "@/components/FullScreenEditor/FullScreenEditor";

type EditorPageRouterProps = {
  postId: string;
  initialDate?: string;
};

export function EditorPageRouter({ postId, initialDate }: EditorPageRouterProps) {
  const router = useRouter();
  const v2Post = useQuery(api.publishing.getPostById, { postId });

  useEffect(() => {
    if (v2Post) {
      router.replace(`/?postId=${postId}`);
    }
  }, [postId, router, v2Post]);

  if (v2Post === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-600">
        Loading editor…
      </div>
    );
  }

  if (v2Post) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-600">
        Opening composer…
      </div>
    );
  }

  return <FullScreenEditor postId={postId} initialDate={initialDate} />;
}
