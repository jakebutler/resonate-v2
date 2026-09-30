"use client";
import { useState } from "react";
import Link from "next/link";
import { useConvexAuth, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { BRANDS, STATUS_LABELS, type PostStatus } from "@/lib/domain";

type Entry=Doc<"seriesEntries"> & {posts:{post:Doc<"v2Posts">;providerState:Doc<"v2ProviderStates">|null}[]};
export function SeriesWorkspace({initialSeriesId}:{initialSeriesId?:string}) {
  const {isAuthenticated}=useConvexAuth();const [selected,setSelected]=useState(initialSeriesId??"");const [title,setTitle]=useState("");const [brand,setBrand]=useState<Doc<"postSeries">["brandId"]>("corvo");const [message,setMessage]=useState("");
  const rows=useQuery(api.series.list,isAuthenticated?{}:"skip") as Doc<"postSeries">[]|undefined;
  const create=useMutation(api.series.create);
  async function onCreate(){try{setSelected(await create({brandId:brand,title}));setTitle("");}catch(e){setMessage(e instanceof Error?e.message:"Series creation failed");}}
  return <main className="mx-auto max-w-6xl space-y-6 p-6"><h1 className="text-2xl font-semibold">Publication series</h1><p>Organize existing articles and companions. Edit each post in its canonical composer.</p>
    <div className="flex flex-wrap gap-3"><label>Series<select className="ml-2 rounded border p-2" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select a series</option>{rows?.map(row=><option key={row._id} value={row._id}>{row.title}</option>)}</select></label>
    <label>New series title<input className="ml-2 rounded border p-2" value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Brand<select className="ml-2 rounded border p-2" value={brand} onChange={e=>setBrand(e.target.value as typeof brand)}>{BRANDS.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><button className="rounded border px-3" disabled={!isAuthenticated||!title.trim()} onClick={()=>void onCreate()}>Create series</button></div>
    {message&&<p role="alert">{message}</p>}{selected&&isAuthenticated&&<SeriesDetail key={selected} seriesId={selected as Id<"postSeries">}/>}
  </main>;
}
export function SeriesDetail({seriesId}:{seriesId:Id<"postSeries">}){
  const series=useQuery(api.series.get,{seriesId}) as Doc<"postSeries">|undefined;
  const entries=usePaginatedQuery(api.series.entries,{seriesId},{initialNumItems:25});
  const picker=usePaginatedQuery(api.series.picker,{seriesId},{initialNumItems:100});
  const attach=useMutation(api.series.attach);const addCompanions=useMutation(api.series.addCompanions);const detach=useMutation(api.series.detach);const move=useMutation(api.series.move);
  const [article,setArticle]=useState("");const [companions,setCompanions]=useState<string[]>([]);const [message,setMessage]=useState("");
  const posts=picker.results as Doc<"v2Posts">[];const loaded=entries.results as Entry[];const linked=loaded.flatMap(e=>e.posts);
  const progress={articles:loaded.length,companions:loaded.reduce((n,e)=>n+e.companionPostIds.length,0),approved:linked.filter(x=>x.post.approvalState==="approved").length,queued:linked.filter(x=>["queued","publishing","submitted"].includes(x.providerState?.status??"")).length,published:linked.filter(x=>x.providerState?.status==="published"||x.post.status==="published").length,held:linked.filter(x=>["needs-review","failed","unavailable"].includes(x.providerState?.status??"")).length};
  async function run(fn:()=>Promise<unknown>){try{await fn();setMessage("");}catch(e){setMessage(e instanceof Error?e.message:"Series change failed");}}
  return <section aria-label="Series detail" className="space-y-4"><h2 className="text-xl font-semibold">{series?.title}</h2><Link className="underline" href={`/?seriesId=${seriesId}`}>View series in calendar</Link> <Link className="underline" href={`/queue?seriesId=${seriesId}&brandId=${series?.brandId??"corvo"}`}>Plan companion queue</Link>
    <p aria-label="Series progress">{progress.articles} articles · {progress.companions} companions · {progress.approved} approved · {progress.queued} queued · {progress.published} published · {progress.held} held{entries.status!=="Exhausted"?" (loaded entries; more available)":""}</p>
    <fieldset className="space-y-3 rounded border p-4"><legend>Attach existing posts</legend><label>Article<select className="ml-2 rounded border p-2" value={article} onChange={e=>setArticle(e.target.value)}><option value="">Choose an existing article</option>{loaded.map(entry=><option key={entry._id} value={`entry:${entry._id}`}>Add companions to {entry.posts[0].post.title}</option>)}{posts.filter(p=>p.channelId==="corvo-blog").map(p=><option key={p._id} value={p._id}>{p.title} — {p.status}</option>)}</select></label>
      <div className="max-h-56 overflow-auto" aria-label="Companion picker">{posts.filter(p=>p.channelId!=="corvo-blog").map(p=><label key={p._id} className="block"><input type="checkbox" checked={companions.includes(p._id)} onChange={e=>setCompanions(current=>e.target.checked?[...current,p._id]:current.filter(id=>id!==p._id))}/> {p.title} — {p.channelId} · {p.status}</label>)}</div>
      {picker.status==="CanLoadMore"&&<button onClick={()=>picker.loadMore(100)}>Load more existing posts</button>}
      <button className="rounded border px-3 py-2" disabled={!article} onClick={()=>void run(async()=>{if(article.startsWith("entry:"))await addCompanions({seriesId,entryId:article.slice(6) as Id<"seriesEntries">,postIds:companions as Id<"v2Posts">[]});else await attach({seriesId,key:crypto.randomUUID(),articlePostId:article as Id<"v2Posts">,companionPostIds:companions as Id<"v2Posts">[]});setArticle("");setCompanions([]);})}>Attach selected posts</button>
    </fieldset>{message&&<p role="alert" tabIndex={-1}>{message}</p>}
    <ol className="space-y-4">{loaded.map(entry=><li className="rounded border bg-white p-4" key={entry._id}><div className="mb-3 flex gap-3"><span>Entry {entry.sequence}</span><button onClick={()=>void run(()=>move({seriesId,entryId:entry._id,direction:"up"}))}>Move up</button><button onClick={()=>void run(()=>move({seriesId,entryId:entry._id,direction:"down"}))}>Move down</button><button onClick={()=>void run(()=>detach({seriesId,entryId:entry._id}))}>Detach entry</button></div>
      <ul>{entry.posts.map(({post,providerState})=><li key={post._id} className="flex flex-wrap gap-3 py-2"><Link className="underline" href={`/?postId=${post._id}`}>{post.title}</Link><span>{post.channelId} · {post.approvalState} · {STATUS_LABELS[(providerState?.status??post.status) as PostStatus]??providerState?.status??post.status}</span><span>{post.scheduledDate??"Unscheduled"} {post.scheduledTime} {post.timezone}</span>{post._id!==entry.articlePostId&&<button onClick={()=>void run(()=>detach({seriesId,entryId:entry._id,postId:post._id}))}>Detach companion</button>}</li>)}</ul>
    </li>)}</ol>{entries.status==="CanLoadMore"&&<button onClick={()=>entries.loadMore(25)}>Load more entries</button>}
  </section>;
}
