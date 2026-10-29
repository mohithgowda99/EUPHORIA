/**
 * A provider artifact is visible ONLY if its immutable producing root turn
 * belongs to an ORIGINAL, successfully correlated source Inbox for this Bot.
 * Session-wide artifact lists alone are never authority.
 */
export type HostedArtifact={id:string;turnId:string;filename:string;mimeType:string;sizeBytes:number};
const safeID=(s:unknown):s is string=>typeof s==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(s);
export function projectHostedArtifact(raw:unknown,allowedRoots:ReadonlySet<string>):HostedArtifact|null {
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const v=raw as Record<string,unknown>;
 const turn=v.turn_id, id=v.id;
 if(!safeID(turn)||!safeID(id)||!allowedRoots.has(turn))return null;
 const name=typeof v.filename==="string"?v.filename:typeof v.name==="string"?v.name:"";
 // Treat names as display labels only. Never use a provider filename for paths.
 if(!name||name.length>180||/[\\/\x00-\x1f]/.test(name)||name==="."||name==="..")return null;
 const size=v.size_bytes??v.size;
 if(!Number.isSafeInteger(size)||Number(size)<0||Number(size)>8*1024*1024)return null;
 const mime=v.mime_type??v.content_type;
 if(typeof mime!=="string"||!/^[-\w.+]+\/[-\w.+]+$/.test(mime)||mime.length>100)return null;
 return{id,turnId:turn,filename:name,mimeType:mime,sizeBytes:Number(size)};
}
export function attachmentName(filename:string):string {
 return filename.replace(/[^A-Za-z0-9._-]/g,"_").slice(0,140)||"artifact";
}
