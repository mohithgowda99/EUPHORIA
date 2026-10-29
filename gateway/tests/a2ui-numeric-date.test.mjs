import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateGraph,graphResult} from '../a2ui-graph.mjs';
const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/a2ui-numeric-date-v09.json',import.meta.url)));
test('numeric and date bindings submit exact bounded source events',()=>{
 const d=fixture();validateGraph(d);
 const v={'$button':'submit','context:confidence':75,'context:date':'2026-11-02T08:00:00Z'};
 assert.deepEqual(graphResult(d,v).userAction.context,{confidence:75,date:'2026-11-02T08:00:00Z'});
 for(const change of [{'context:confidence':101},{'context:confidence':-1},{'context:confidence':'75'},{'context:confidence':Infinity},{'context:date':'2027-01-01T00:00:00Z'},{'context:date':'2026-11-31T08:00:00Z'},{'context:date':'tomorrow'}])assert.throws(()=>graphResult(d,{...v,...change}));
});
test('invalid range date flags and initial values never reach native controls',()=>{
 for(const mutate of [d=>d.components[1].max=0,d=>d.components[1].min=101,d=>d.dataModel.decision.confidence=101,d=>d.components[2].max='2026-09-01T00:00:00Z',d=>d.components[2].enableDate='true',d=>{d.components[2].enableDate=false;d.components[2].enableTime=false;},d=>d.dataModel.decision.date='invalid']){const d=fixture();mutate(d);assert.throws(()=>validateGraph(d));}
});
