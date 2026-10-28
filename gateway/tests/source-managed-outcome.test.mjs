import test from 'node:test';
import assert from 'node:assert/strict';
import {managedTurnOutcome} from '../../openbot/server/src/agents/managed-source-outcome.ts';
const base={sessionStatus:'idle',turnID:'root_1',requiredActions:[],turns:{data:[]},items:{data:[]}};
const turn={id:'root_1',status:'completed',subagent_id:null};
const item={type:'message',role:'assistant',status:'completed',turn_id:'root_1',
  content:[{type:'output_text',text:'Actual saved answer'}]};
test('session idle is not proof of completed work',()=>{
 assert.deepEqual(managedTurnOutcome(base),{kind:'pending'});
 assert.deepEqual(managedTurnOutcome({...base,turns:{data:[{id:'other',status:'completed'}]}}),{kind:'pending'});
});
test('only exact root completed turn yields saved assistant text',()=>{
 const data={...base,turns:{data:[turn]},items:{data:[
   {...item,role:'user',content:[{type:'input_text',text:'Do not echo me'}]},
   {...item,turn_id:'other',content:[{type:'output_text',text:'Foreign'}]},
   {...item,content:[{type:'output_text',text:'Actual saved answer'},{type:'unknown',text:'Private tool output'}]},
 ]}};
 assert.deepEqual(managedTurnOutcome(data),{kind:'completed',replyText:'Actual saved answer'});
});
test('failed and cancelled root turns are never called successful',()=>{
 for(const reason of ['failed','cancelled']){
  assert.deepEqual(managedTurnOutcome({...base,turns:{data:[{...turn,status:reason}]}}),{kind:'failed',reason});
 }
});
test('required action is a human wait, not an implicit grant',()=>{
 assert.deepEqual(managedTurnOutcome({...base,turns:{data:[turn]},items:{data:[item]},
   requiredActions:[{type:'function_call',name:'dangerous-tool'}]}),{kind:'waiting_for_human'});
});
test('completed subagent cannot satisfy a root turn; unknown state stays pending',()=>{
 assert.deepEqual(managedTurnOutcome({...base,turns:{data:[{...turn,subagent_id:'worker_1'}]},
   items:{data:[item]}}),{kind:'pending'});
 assert.deepEqual(managedTurnOutcome({...base,turns:{data:[{...turn,status:'working'}]},
   items:{data:[item]}}),{kind:'pending'});
});
