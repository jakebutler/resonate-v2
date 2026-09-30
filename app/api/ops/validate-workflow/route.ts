import {NextRequest, NextResponse} from "next/server";
import {secretsMatch} from "@/lib/opsSecret";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const supplied = req.headers.get("x-resonate-v2-ops-secret") || req.headers.get("x-v2-ops-secret") || "";
  if (!process.env.V2_OPS_SECRET || !secretsMatch(supplied, process.env.V2_OPS_SECRET))
    return NextResponse.json({error:"Unauthorized"},{status:401});
  return NextResponse.json({ok:false, error:"This legacy synthetic publishing smoke is retired. Save, prepare and approve a canonical blog post in the composer before exporting its reviewed article and hero.", route:"/api/publish"},{status:410});
}
