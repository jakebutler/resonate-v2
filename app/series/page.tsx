import { Shell } from "@/components/shell/Shell";
import { SeriesWorkspace } from "@/components/SeriesWorkspace";
export default async function SeriesPage({searchParams}:{searchParams:Promise<{seriesId?:string}>}) {
  const {seriesId}=await searchParams;
  return <Shell activeSurface="series"><SeriesWorkspace initialSeriesId={seriesId}/></Shell>;
}
