/**
 * A session-wide provider cancel event is only safe when the intended ORIGINAL
 * source Inbox owns the current, uniquely active root turn. The provider's
 * cancellation transport is not itself a source authorization decision.
 */
export type ProviderRoot={id?:unknown;session_id?:unknown;subagent_id?:unknown;status?:unknown};
const openStatuses=new Set(["in_progress","requires_action","queued","pending"]);
export function assertCurrentRootForCancellation(
  intendedRoot:string,sessionID:string,root:ProviderRoot,
  turns:{data?:unknown;has_more?:unknown},sourceState:string
):void {
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(intendedRoot)||
     !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(sessionID)||
     !["accepted","running"].includes(sourceState)||
     root.id!==intendedRoot||root.session_id!==sessionID||
     root.subagent_id!==null||!openStatuses.has(String(root.status)))
    throw Error("Original source root is no longer active or authorized to cancel");
  if(!turns||!Array.isArray(turns.data)||turns.has_more!==false)
    throw Error("Cannot prove the current provider root is unique");
  for(const entry of turns.data){
    if(!entry||typeof entry!=="object")throw Error("Invalid provider root history");
    const row=entry as ProviderRoot;
    if(row.subagent_id==null&&row.id!==intendedRoot&&
       openStatuses.has(String(row.status)))
      throw Error("Another provider root is active; session-wide cancel denied");
  }
}
