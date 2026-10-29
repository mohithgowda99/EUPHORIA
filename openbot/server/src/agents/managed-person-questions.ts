/** Bound, source-owned bridge for managed agent questions.
 * Original OpenDuet person.question/person.response and WorkQueue remain
 * authoritative. This module has no persistence or inference of its own.
 */
export const MANAGED_ASK_PERSON_TOOL = {
  type: "function" as const,
  name: "euphoria_ask_person",
  description: "Ask the person a question and wait for an authorized answer. Never assume an answer or perform a write while waiting.",
  parameters: {
    type: "object",
    properties: {
      question: { type: "string", minLength: 1, maxLength: 6000 },
      why: { type: "string", maxLength: 6000 },
    },
    required: ["question"],
    additionalProperties: false,
  },
};

export type ManagedQuestionCall = {
  type: "function_call";
  name: "euphoria_ask_person";
  turn_id: string;
  call_id: string;
  arguments: unknown;
};
export type ManagedQuestionCorrelation = {
  sessionID: string;
  call: ManagedQuestionCall;
  scope: {ownerUserId:string; channelId:string; agentId:string; threadId:string};
};

const validID=(id: unknown): id is string =>
  typeof id==="string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id);
const record=(value:unknown): value is Record<string,unknown> =>
  value!==null && typeof value==="object" && !Array.isArray(value);
export function parseManagedQuestion(input:unknown):{question:string;why?:string} {
  if (!record(input) || Object.keys(input).some(k=>k!=="question" && k!=="why") ||
      typeof input.question!=="string" || input.question.trim().length<1 ||
      input.question.length>6000 ||
      (input.why!==undefined && (typeof input.why!=="string" || input.why.length>6000)))
    throw new Error("Invalid managed question arguments");
  return {question:input.question.trim(),...(typeof input.why==="string"?{why:input.why}:{})};
}
export function parseManagedQuestionCall(input:unknown):ManagedQuestionCall {
  if(!record(input)||input.type!=="function_call"||input.name!=="euphoria_ask_person"||
    !validID(input.turn_id)||!validID(input.call_id))
    throw new Error("Uncorrelated managed question");
  const args=typeof input.arguments==="string"?JSON.parse(input.arguments):input.arguments;
  parseManagedQuestion(args);
  return {type:"function_call",name:"euphoria_ask_person",
    turn_id:input.turn_id,call_id:input.call_id,arguments:args};
}
export function parseManagedCorrelation(input:unknown):ManagedQuestionCorrelation {
  if (!record(input)||!validID(input.sessionID)||!record(input.scope))
    throw new Error("Missing saved managed question correlation");
  const scope=input.scope;
  if (![scope.ownerUserId,scope.channelId,scope.agentId,scope.threadId]
      .every(v=>typeof v==="string" && v.length>0))
    throw new Error("Invalid managed question ownership");
  return {sessionID:input.sessionID,call:parseManagedQuestionCall(input.call),
    scope:{ownerUserId:scope.ownerUserId as string,channelId:scope.channelId as string,agentId:scope.agentId as string,threadId:scope.threadId as string}};
}
/** A retrieved required_action, never a historical item, proves a call is live. */
export function pendingManagedQuestion(actions:unknown, correlation:ManagedQuestionCorrelation):
  "pending"|"closed"|"changed" {
  if (!Array.isArray(actions))throw Error("Unverified provider required actions");
  const found=actions.find(action=>record(action) &&
    action.turn_id===correlation.call.turn_id && action.call_id===correlation.call.call_id);
  if(!found)return "closed";
  if(!record(found)||found.name!=="euphoria_ask_person"||found.type!=="function_call")
    return "changed";
  const current=parseManagedQuestionCall(found);
  // Keys are fixed by parseManagedQuestion; equality is order independent.
  const a=parseManagedQuestion(current.arguments),b=parseManagedQuestion(correlation.call.arguments);
  return a.question===b.question&&a.why===b.why?"pending":"changed";
}
