import {createHmac,timingSafeEqual} from "node:crypto";

/** Verify Standard Webhooks headers against the ORIGINAL raw JSON bytes.
 * Never authorize a provider effect from a webhook payload. */
export function verifyManagedSessionWebhook(input:{
  body:Uint8Array;headers:Headers;secret:string;now?:number;
}):{webhookId:string;eventId:string;eventType:string;sessionId:string} {
  const {body,headers,secret}=input;
  if(!secret.startsWith("whsec_")||secret.length<15||body.length>256*1024)
    throw new Error("Invalid webhook configuration or size");
  const id=headers.get("webhook-id")??"";
  const timestamp=headers.get("webhook-timestamp")??"";
  const sig=headers.get("webhook-signature")??"";
  if(!/^[A-Za-z0-9_-]{3,128}$/.test(id)||!/^\d{10}$/.test(timestamp)||
     Math.abs((input.now??Date.now())/1000-Number(timestamp))>300)
    throw new Error("Invalid webhook identity or timestamp");
  const key=Buffer.from(secret.slice(6),"base64");
  if(key.length<16)throw new Error("Webhook secret unavailable");
  const prefix=Buffer.from(id+"."+timestamp+".","utf8");
  const expected=createHmac("sha256",key)
    .update(prefix).update(body).digest();
  const accepted=sig.split(" ").some(token=>{
    if(!token.startsWith("v1,"))return false;
    const raw=token.slice(3);
    if(!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))return false;
    const actual=Buffer.from(raw,"base64");
    return actual.length===expected.length&&timingSafeEqual(expected,actual);
  });
  if(!accepted)throw new Error("Invalid webhook signature");
  let event:unknown;
  try{event=JSON.parse(Buffer.from(body).toString("utf8"));}
  catch{throw new Error("Invalid webhook JSON");}
  if(!event||typeof event!=="object"||Array.isArray(event))
    throw new Error("Invalid webhook payload");
  const e=event as {id?:unknown;type?:unknown;object?:unknown;data?:{id?:unknown}};
  if(e.object!=="event"||typeof e.id!=="string"||
     !/^[A-Za-z0-9_-]{3,128}$/.test(e.id)||
     typeof e.type!=="string"||![
       "agent.session.created","agent.session.action_required",
       "agent.session.in_progress","agent.session.idle","agent.session.failed"
     ].includes(e.type)||typeof e.data?.id!=="string"||
     !/^[A-Za-z0-9_-]{3,128}$/.test(e.data.id))
    throw new Error("Unsupported managed webhook event");
  return {webhookId:id,eventId:e.id,eventType:e.type,sessionId:e.data.id};
}
