import test from 'node:test';
import assert from 'node:assert/strict';
import {taskStatus} from '../../openbot/server/src/openduet/task-status.ts';

// These cases are the source OpenDuet rule, not a second implementation.
// gateway/tasks.mjs imports the same function in its authenticated task route.
test('OpenDuet task status precedence remains source-equivalent under managed Agents turns', () => {
  assert.equal(taskStatus({needsInput:true,working:true,resolved:true,failed:true}),'needs_input');
  assert.equal(taskStatus({needsInput:false,working:true,resolved:true,failed:true}),'working');
  assert.equal(taskStatus({needsInput:false,working:false,resolved:true,failed:true}),'resolved');
  assert.equal(taskStatus({needsInput:false,working:false,resolved:false,failed:true}),'failed');
  assert.equal(taskStatus({needsInput:false,working:false,resolved:false,failed:false}),'ready_for_review');
});

// Provider transport events and saved assistant output determine these booleans.
// A session showing idle without a completed root reply cannot yield success.
test('source status refuses to infer success from idle alone', () => {
  assert.equal(taskStatus({needsInput:false,working:false,resolved:false,failed:true}), 'failed');
  assert.equal(taskStatus({needsInput:false,working:true,resolved:false,failed:true}), 'working');
});
