import {test,expect} from "bun:test";
import {DENIED_HOSTED_CAPABILITIES,parseHostedCapabilities,hostedDefinition} from "../src/agents/managed-hosted-capabilities";
test("hosted sandbox and subagents are denied by default",()=>{
 expect(hostedDefinition(DENIED_HOSTED_CAPABILITIES)).toEqual({environment:undefined,multiAgent:undefined});
});
test("sandbox is network-disabled and delegation cannot exceed three",()=>{
 expect(hostedDefinition(parseHostedCapabilities({sandbox:true,webSearch:true,browser:false,delegation:true,maxConcurrentSubagents:2})))
 .toEqual({environment:{type:"openai_hosted",container_size:"small",network:{access:"disabled"}},
 multiAgent:{enabled:true,max_concurrent_subagents:2}});
 for(const bad of [
  {sandbox:true,webSearch:false,browser:false,delegation:true,maxConcurrentSubagents:9},
  {sandbox:false,webSearch:false,browser:false,delegation:true,maxConcurrentSubagents:0},
  {sandbox:false,webSearch:false,browser:false,delegation:false,maxConcurrentSubagents:2},
  {sandbox:true,webSearch:false,browser:false,delegation:false,maxConcurrentSubagents:1,network:"enabled"},
  {sandbox:"true",webSearch:false,browser:false,delegation:false,maxConcurrentSubagents:1}
 ])expect(()=>parseHostedCapabilities(bad)).toThrow();
});
