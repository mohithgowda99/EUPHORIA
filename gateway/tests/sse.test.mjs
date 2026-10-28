import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSSE} from '../sse.mjs';
async function* chunks(...strings){for(const value of strings)yield new TextEncoder().encode(value);}
test('SSE framing handles split UTF8 CRLF multiline data comments and ignored fields',async()=>{
  const bytes=new TextEncoder().encode(': heartbeat\r\nevent: update\r\ndata: {"text":"é",\r\ndata: "count":2}\r\nid: ignored\r\n\r\n');
  const source=(async function*(){for(const byte of bytes)yield Uint8Array.of(byte);})();
  const out=[];for await(const frame of parseSSE(source))out.push(frame);
  assert.deepEqual(out,[{event:'update',data:'{"text":"é",\n"count":2}'}]);
});
test('SSE rejects oversized and invalid UTF8 frames and ignores truncated EOF',async()=>{
  await assert.rejects(async()=>{for await(const frame of parseSSE(chunks('data: '+ 'x'.repeat(50)+'\n\n'),{maxBytes:20}))void frame;});
  await assert.rejects(async()=>{for await(const frame of parseSSE((async function*(){yield Uint8Array.of(255);})()))void frame;});
  const out=[];for await(const frame of parseSSE(chunks('data: not complete')))out.push(frame);assert.deepEqual(out,[]);
});
