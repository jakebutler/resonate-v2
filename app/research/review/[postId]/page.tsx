import { Shell } from "@/components/shell/Shell";
import { VariantReviewPanel } from "@/components/shell/VariantReviewPanel";

export const metadata = {
  title: "Resonate — Variant review",
  description: "Review AI-generated draft variants before scheduling",
};

type VariantReviewPageProps = {
  params: Promise<{ postId: string }>;
};

export default async function VariantReviewPage({ params }: VariantReviewPageProps) {
  const { postId } = await params;

  return (
    <Shell activeSurface="research">
      <VariantReviewPanel postId={postId} />
    </Shell>
  );
}
