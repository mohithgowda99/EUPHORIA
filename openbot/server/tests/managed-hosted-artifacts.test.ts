import {test,expect} from "bun:test";
import {projectHostedArtifact,attachmentName} from "../src/agents/managed-hosted-artifacts";
test("artifacts require exact original-root correlation and bounded safe metadata",()=>{
 const roots=new Set(["turn_owner"]);
 const good={id:"art_1",turn_id:"turn_owner",filename:"analysis.csv",mime_type:"text/csv",size_bytes:99};
 expect(projectHostedArtifact(good,roots)?.filename).toBe("analysis.csv");
 for(const invalid of [
  {...good,turn_id:"turn_foreign"}, {...good,id:"../art"},
  {...good,filename:"../../secret"}, {...good,size_bytes:100_000_000},
  {...good,mime_type:"text/html; charset=utf-8"}, {...good,size_bytes:-1},
  {...good,turn_id:null}, {...good,filename:"a\\b"}
 ])expect(projectHostedArtifact(invalid,roots)).toBeNull();
 expect(attachmentName("report final.pdf")).toBe("report_final.pdf");
});
