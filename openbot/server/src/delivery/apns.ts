import {createPrivateKey,randomUUID,sign} from "node:crypto";
import {connect} from "node:http2";
import {DELIVERY_REQUEST_TIMEOUT_MS} from "../timeouts";
import {DeliveryProviderError} from "./types";

/** Native Apple Push Notification service transport for original delivery.outbox.
 * APNs' 200 acknowledges Apple's acceptance, NOT device presentation.
 * Do not fabricate a delivered receipt (APNs has no delivery receipt API).
 * The server alone owns the .p8 signing key; no mobile secrets. */
export type ApnsConfiguration={
 teamId:string;keyId:string;bundleId:string;privateKey:string;
 environment:"sandbox"|"production";
};
export function createApnsPushTransport(configuration:ApnsConfiguration) {
 const {teamId,keyId,bundleId,privateKey,environment}=configuration;
 if(!/^[A-Z0-9]{10}$/.test(teamId)||!/^[A-Z0-9]{10}$/.test(keyId)||
    !/^[A-Za-z0-9.-]{3,180}$/.test(bundleId)||
    !["sandbox","production"].includes(environment))
  throw new Error("Invalid APNs configuration");
 const key=createPrivateKey(privateKey);
 if(key.asymmetricKeyType!=="ec"||
   key.asymmetricKeyDetails?.namedCurve!=="prime256v1")
  throw new Error("APNs requires an ES256 .p8 private key");
 const host=environment==="sandbox"?"api.sandbox.push.apple.com":"api.push.apple.com";
 const bearer=()=>{
  const header=Buffer.from(JSON.stringify({alg:"ES256",kid:keyId})).toString("base64url");
  const payload=Buffer.from(JSON.stringify({iss:teamId,iat:Math.floor(Date.now()/1000)})).toString("base64url");
  const data=header+"."+payload;
  return data+"."+sign("sha256",Buffer.from(data),{key,dsaEncoding:"ieee-p1363"}).toString("base64url");
 };
 return {
  // APNs exposes no device delivery receipt endpoint.
  receipt: undefined as undefined,
  async send(input:{token:string;title:string;body:string;channelId:string;
    kind:"reply"|"question"|"approval";requestId?:string|null}) {
   if(!/^[a-fA-F0-9]{64}$/.test(input.token))
    throw new DeliveryProviderError("APNs","BadDeviceToken");
   const id=randomUUID();
   const query=new URLSearchParams({channelId:input.channelId,
    ...(input.requestId?{requestId:input.requestId}:{})});
   const path=input.kind==="reply"?"conversation":"approvals";
   const payload=JSON.stringify({
    aps:{alert:{title:input.title.slice(0,100),
     body:Array.from(input.body).slice(0,200).join("")},sound:"default"},
    channelId:input.channelId,kind:input.kind,
    ...(input.requestId?{requestId:input.requestId}:{}),
    url:`openbotmobile://${path}?${query}`
   });
   const client=connect("https://"+host,{timeout:DELIVERY_REQUEST_TIMEOUT_MS});
   return await new Promise<{id:string;status:"sent"}>((resolve,reject)=>{
    let finished=false;
    const done=(error?:Error)=>{
     if(finished)return;
     finished=true;client.close();
     if(error)reject(error);
    };
    const timer=setTimeout(()=>{
     done(new DeliveryProviderError("APNs","timeout",true));
    },DELIVERY_REQUEST_TIMEOUT_MS);
    client.on("error",()=>{
     clearTimeout(timer);done(new DeliveryProviderError("APNs","network_error",true));
    });
    const request=client.request({
     ":method":"POST",":path":"/3/device/"+input.token,
     "authorization":"bearer "+bearer(),"apns-topic":bundleId,
     "apns-push-type":"alert","apns-priority":"10","apns-id":id,
     "content-type":"application/json"
    });
    let code=0,reason="";
    request.on("response",headers=>{code=Number(headers[":status"]??0);});
    request.on("data",chunk=>{if(reason.length<2048)reason+=String(chunk).slice(0,2048);});
    request.on("error",()=>{
     clearTimeout(timer);done(new DeliveryProviderError("APNs","transport_error",true));
    });
    request.on("end",()=>{
     clearTimeout(timer);
     if(code===200){if(!finished){done();resolve({id,status:"sent"});}return;}
     let detail="HTTP_"+code;
     try{const parsed=JSON.parse(reason);if(typeof parsed.reason==="string")detail=parsed.reason;}catch{}
     done(new DeliveryProviderError("APNs",detail,code>=500||code===429));
    });
    request.end(payload);
   });
  }
 };
}
export type ApnsPushTransport=ReturnType<typeof createApnsPushTransport>;
