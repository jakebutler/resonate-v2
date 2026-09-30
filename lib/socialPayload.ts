/** Same exact LinkedIn assembly in the review surface and server dispatch. */
export function linkedInPayload(content:string,settings:unknown){
 const raw=settings&&typeof settings==="object"?(settings as {hashtags?:unknown}).hashtags:undefined;
 const tags=(Array.isArray(raw)?raw:[]).filter((x):x is string=>typeof x==="string").map(x=>x.trim()).filter(Boolean).map(x=>x.startsWith("#")?x:`#${x}`);
 return tags.length?`${content.trim()}\n\n${tags.join(" ")}`:content.trim();
}
export function socialReleaseVersion(post:{title:string;content:string;linkedinFirstComment?:string;platformSettings?:unknown}){return JSON.stringify([post.title,post.content,post.linkedinFirstComment??null,post.platformSettings??null]);}
export function postScheduleVersion(post:{scheduledDate?:string;scheduledTime?:string;timezone?:string}){return JSON.stringify([post.scheduledDate??null,post.scheduledTime??null,post.timezone??null]);}
