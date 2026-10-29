import {test,expect} from "bun:test";
import {browserEnvironment,parsePublicBrowserHosts,pendingPublicOrigin} from "../src/agents/managed-hosted-browser";
test("public browser allows only vetted exact documentation hosts",()=>{
 expect(parsePublicBrowserHosts("developers.openai.com,www.rfc-editor.org")).toEqual(["developers.openai.com","www.rfc-editor.org"]);
 expect(browserEnvironment(["developers.openai.com"])).toEqual({
  type:"openai_hosted",container_size:"small",desktop:{enabled:true},
  network:{access:"restricted",allowed_domains:["developers.openai.com"]}
 });
 for(const s of ["localhost","10.0.0.1","internal.local","evil.com","developers.openai.com.evil.com","https://developers.openai.com"])
  expect(()=>parsePublicBrowserHosts(s)).toThrow();
});
test("provider origin approval requires exact request id and operator origin",()=>{
 const actions=[
  {type:"computer_use_approval_request",request_id:"req_ok",request:{type:"browser_origin_access",origin:"https://developers.openai.com",reason:"Read docs"}},
  {type:"computer_use_approval_request",request_id:"req_bad",request:{type:"browser_origin_access",origin:"http://developers.openai.com"}},
  {type:"computer_use_approval_request",request_id:"req_unknown",request:{type:"browser_origin_access",origin:"https://evil.com"}}
 ];
 const found=pendingPublicOrigin(actions,["developers.openai.com"]);
 expect(found.map(x=>x.allowed)).toEqual([true,false,false]);
 expect(found[0]?.request.reason).toBe("Read docs");
});
