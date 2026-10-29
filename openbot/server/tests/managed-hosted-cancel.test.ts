import {test,expect} from "bun:test";
import {assertCurrentRootForCancellation} from "../src/agents/managed-hosted-cancel";

const active={id:"turn_one",session_id:"sess_owner",subagent_id:null,status:"in_progress"};
const bounded={data:[active,{id:"turn_old",session_id:"sess_owner",subagent_id:null,status:"completed"}],has_more:false};

test("exact active original root may issue a cancellation only when unique",()=>{
 expect(()=>assertCurrentRootForCancellation("turn_one","sess_owner",active,bounded,"accepted")).not.toThrow();
});

test("never cancel a subagent, foreign session, completed root, or unverified original status",()=>{
 for(const root of [
  {...active,subagent_id:"subagent_1"},
  {...active,id:"turn_foreign"},
  {...active,session_id:"sess_other"},
  {...active,status:"completed"},
  {...active,status:"cancelled"}
 ])expect(()=>assertCurrentRootForCancellation("turn_one","sess_owner",root,bounded,"accepted")).toThrow();
 for(const state of ["queued","failed","sent"])
  expect(()=>assertCurrentRootForCancellation("turn_one","sess_owner",active,bounded,state)).toThrow();
});

test("reject session-wide cancellation if any second root is active, or history incomplete",()=>{
 expect(()=>assertCurrentRootForCancellation("turn_one","sess_owner",active,{
  data:[active,{id:"turn_other",session_id:"sess_owner",subagent_id:null,status:"in_progress"}],
  has_more:false},"accepted")).toThrow();
 expect(()=>assertCurrentRootForCancellation("turn_one","sess_owner",active,{
  data:[active],has_more:true},"accepted")).toThrow();
 expect(()=>assertCurrentRootForCancellation("turn_one","sess_owner",active,{
  data:[active],has_more:undefined},"accepted")).toThrow();
 expect(()=>assertCurrentRootForCancellation("turn_one","sess_owner",active,{
  data:[active,{id:"subagent_turn",session_id:"sess_owner",subagent_id:"sub_1",status:"in_progress"}],
  has_more:false},"running")).not.toThrow();
});
