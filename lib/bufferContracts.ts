export type Capability = {value:"supported"|"unsupported"|"unknown";source:"provider-observation"|"operator-confirmed"|"unknown";checkedAt:number;evidence:string};
export type BufferDestination = {channelId:string;organizationId:string;displayName:string;handle:string;accountType:string;profileUrl?:string;disconnected:boolean;locked:boolean;queuePaused:boolean;flagsVerified:boolean;checkedAt:number;firstComment:Capability};
export const DESTINATION_MAX_AGE_MS=15*60*1000;
export const CAPABILITY_MAX_AGE_MS=24*60*60*1000;
export function destinationIdentity(d:Pick<BufferDestination,"channelId"|"organizationId">){return JSON.stringify([d.organizationId,d.channelId]);}
export function destinationHold(d:BufferDestination|null|undefined,requiresComment:boolean,now=Date.now()):string|null{
  if(!d)return "Destination is unverified; refresh Connections.";
  if(now-d.checkedAt>DESTINATION_MAX_AGE_MS||d.checkedAt>now+60000)return "Destination verification is stale; refresh Connections.";
  if(!d.flagsVerified)return "Destination connection flags are unknown.";
  if(d.disconnected)return "Reconnect the destination in Buffer.";
  if(d.locked)return "Destination is locked in Buffer.";
  if(d.queuePaused)return "Destination queue is paused in Buffer.";
  if(requiresComment&&(d.firstComment.value!=="supported"||now-d.firstComment.checkedAt>CAPABILITY_MAX_AGE_MS))return `First-comment entitlement is ${d.firstComment.value}; explicitly review a body-link alternative or confirm entitlement.`;
  return null;
}
export function safeLinkedInUrl(value:unknown):string|undefined {try{const url=new URL(String(value));if(url.protocol==="https:"&&["linkedin.com","www.linkedin.com"].includes(url.hostname)&&!url.username&&!url.password)return url.href;}catch{/* unknown URL omitted */}return undefined;}
export const ACTIVE_BUFFER_STATES=["submitted","queued","publishing","cancel-requested","cancel-intent-recorded","provider-draft","needs-review"] as const;
export const TERMINAL_BUFFER_STATES=["published","cancelled","removed"] as const;
export function mayApplyDelivery(current:string,next:string):boolean{
  if(current==="removed"||current==="cancelled")return next===current;
  if(current==="published")return next==="published"||next==="removed";
  if(current==="publishing"&&["queued","submitted","provider-draft"].includes(next))return false;
  return true;
}
export class BufferRequestBudgetError extends Error {constructor(public backoffUntil?:number){super("Buffer read budget exhausted; wait for the next explicit check.");}}
export type BufferRequestBudget={remaining:number;backoffUntil?:number;observedWindows?:{policy:string;remaining:number;resetsAt:number}[]};
export function observeBufferRateLimit(response:Response,budget:BufferRequestBudget,now=Date.now()){
  const headers=response.headers;const retry=headers?.get?.("retry-after");
  const seconds=Number(retry);const date=retry?Date.parse(retry):NaN;
  if(retry&&((seconds>0)||Number.isFinite(date)))budget.backoffUntil=Math.max(budget.backoffUntil??0,seconds>0?now+seconds*1000:date);
  budget.observedWindows=[];
  for(const policy of (headers?.get?.("ratelimit")??"").split(/,\s*(?=")/)){const remaining=policy.match(/(?:^|;)\s*r\s*=\s*(\d+)/);const reset=policy.match(/(?:^|;)\s*t\s*=\s*(\d+)/);if(remaining){budget.observedWindows.push({policy:policy.match(/"([^"]+)"/)?.[1]??"unknown",remaining:Number(remaining[1]),resetsAt:now+Number(reset?.[1]??0)*1000});budget.remaining=Math.min(budget.remaining,Number(remaining[1]));if(Number(remaining[1])===0&&reset)budget.backoffUntil=Math.max(budget.backoffUntil??0,now+Number(reset[1])*1000);}}
  if(response.status===429){budget.remaining=0;budget.backoffUntil=Math.max(budget.backoffUntil??0,now+60000);}
}
