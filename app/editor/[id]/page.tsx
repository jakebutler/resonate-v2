import { FullScreenEditor } from "@/components/FullScreenEditor/FullScreenEditor";

interface EditorPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string | string[] }>;
}

export default async function EditorPage({ params, searchParams }: EditorPageProps) {
  const { id } = await params;
  const { date: dateRaw } = await searchParams;
  const date = Array.isArray(dateRaw) ? dateRaw[0] : dateRaw;

  return (
    <FullScreenEditor
      postId={id}
      initialDate={date}
    />
  );
}
