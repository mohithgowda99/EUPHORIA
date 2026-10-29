import {argumentFingerprint} from './provider-arguments.mjs';
import {parseSSE} from './sse.mjs';

/** Server-side Agents API transport. No user authentication, tool execution, or retries here. */
export class AgentsClient {
  #apiKey;
  #fetch;
  #sessionSpendLimitCents;
  constructor({ apiKey, fetchImpl = globalThis.fetch, sessionSpendLimitCents = 50, allowUncappedSession = false }) {
    requireText(apiKey, 'server API key');
    // Managed Agents API spend_control is per session, in USD cents.
    // This deliberately avoids relying on our own usage-metering loop.
    if (!(sessionSpendLimitCents === null && allowUncappedSession === true) &&
        (!Number.isInteger(sessionSpendLimitCents) || sessionSpendLimitCents < 1 ||
        sessionSpendLimitCents > 500)) throw new Error('Invalid per-session spending limit');
    this.#apiKey = apiKey;
    this.#fetch = fetchImpl;
    this.#sessionSpendLimitCents = sessionSpendLimitCents;
  }

  async createSession({model, instructions, input, tools = [], environment, multiAgent, reasoningEffort, verbosity}, submissionKey) {
    requireText(model, 'model');
    requireText(instructions, 'instructions');
    requireText(input, 'input');
    if (!Array.isArray(tools)) throw new Error('Invalid tools');
    // Provider features remain opt-in and bound to the product's authoritative
    // Bot grants. Passing a config here is not permission to expose external
    // credentials, connected apps, unrestricted network, or device controls.
    const sandbox = checkedEnvironment(environment);
    const delegation = checkedDelegation(multiAgent);
    const agent = configuredAgent({model,instructions,tools,reasoningEffort,verbosity});
    if (delegation) agent.multi_agent = delegation;
    return this.#request('POST', '', {agent,
      environment: sandbox, input, stream: false,
      ...(this.#sessionSpendLimitCents === null ? {} : {spend_control: {limit: this.#sessionSpendLimitCents}})}, submissionKey);
  }

  /** One authoritative initial submission AND its event stream.
   *
   * Unlike creating first and opening an SSE subscription afterward, this
   * stream contains the original session.created and root turn.created
   * events. A caller must persist original source identity BEFORE invoking
   * this method and bind both events before reporting an accepted source run.
   * HTTP interruption is UNCERTAIN; never replay under a new key.
   */
  async createSessionStream({model,instructions,input,tools=[],environment,multiAgent,reasoningEffort,verbosity},submissionKey,{signal}={}) {
    requireText(model,'model');requireText(instructions,'instructions');requireText(input,'input');
    if(!Array.isArray(tools))throw Error('Invalid tools');
    const agent=configuredAgent({model,instructions,tools,reasoningEffort,verbosity});
    const delegation=checkedDelegation(multiAgent);
    if(delegation)agent.multi_agent=delegation;
    const body=JSON.stringify({agent,environment:checkedEnvironment(environment),input,
      stream:true,...(this.#sessionSpendLimitCents === null ? {} : {spend_control:{limit:this.#sessionSpendLimitCents}})});
    const controller=new AbortController();
    let response;
    try {
      response=await this.#fetch('https://api.openai.com/v1/agents/sessions',{
        method:'POST',redirect:'error',body,
        headers:{Authorization:'Bearer '+this.#apiKey,'OpenAI-Beta':'agents=v1',
          'Idempotency-Key':key(submissionKey),'Content-Type':'application/json',Accept:'text/event-stream'},
        signal:AbortSignal.any([controller.signal,AbortSignal.timeout(60_000),...(signal?[signal]:[])])
      });
      if(!response.ok||response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='text/event-stream'||!response.body)
        throw Error('Invalid session stream');
    }catch{
      controller.abort();try{await response?.body?.cancel();}catch{}
      const error=Error('Agents session submission outcome unknown; reconcile original source before retry');
      error.outcomeUnknown=!response||response.status>=500||response.status===408||response.ok;error.failureStage='submission';
      if(response&&!response.ok){error.status=response.status;error.message='Agents session request rejected ('+response.status+')';}
      throw error;
    }
    return {close:()=>controller.abort(),events:(async function*(){
      try{
        for await(const frame of parseSSE(response.body)){
          const event=JSON.parse(frame.data);
          if(!event||typeof event.type!=='string'||typeof event.event_id!=='string'||
             event.type==='error')throw Error('Invalid provider event');
          yield event;
        }
        throw Error('Provider stream closed without established result');
      }catch{
        const error=Error('Agents initial stream interrupted; reconcile saved provider/source identity');
        error.outcomeUnknown=true;error.failureStage='stream';throw error;
      }finally{controller.abort();}
    })()};
  }

  async retrieveSession(sessionID,{signal}={}) {
    const session = await this.#request('GET', '/' + identifier(sessionID),undefined,undefined,signal);
    if (session?.id !== sessionID) throw new Error('Agents API session identity mismatch');
    return session;
  }

  async sendMessage(sessionID, text, submissionKey) {
    requireText(text, 'message');
    return this.#request('POST', '/' + identifier(sessionID) + '/events', {events: [{
      type: 'agent.session.input.message',
      input: [{role: 'user', content: [{type: 'input_text', text}]}],
    }]}, submissionKey);
  }

  /** Development single-writer continuation: subscribe BEFORE sending, exclude
   * every saved turn, and return the actual new root-created event. The source
   * queue must serialize inputs; this is not a general multi-writer correlator.
   */
  async sendMessageAndObserve(sessionID, text, submissionKey, onRoot) {
    const known=new Set();let after;
    for(let pageNumber=0;pageNumber<10;pageNumber++) {
      const page=await this.listTurns(sessionID,{limit:100,order:'desc',after});
      if(!Array.isArray(page.data))throw Error('Invalid prior turns');
      for(const turn of page.data){
        if(turn.subagent_id==null&&!['completed','failed','cancelled'].includes(turn.status))throw Error('Previous root is unresolved');
        known.add(turn.id);
      }
      if(!page.has_more)break;
      if(pageNumber===9||!page.last_id||page.last_id===after)throw Error('Cannot verify prior turns');
      after=page.last_id;
    }
    const stream=await this.openEventStream(sessionID);
    let sent=false;
    const observed=(async()=>{
      for await(const event of stream.events) {
        if(event.type==='agent.session.turn.created'&&event.turn?.subagent_id===null&&!known.has(event.turn_id)) {
          if(!sent)throw Error('Unexpected concurrent root');
          await onRoot(event);return;
        }
      }
      throw Error('No correlated continuation root');
    })();
    // Attach rejection handling immediately while the HTTP write is pending.
    observed.catch(()=>{});
    try {sent=true;await this.sendMessage(sessionID,text,submissionKey);await observed;}
    catch {const error=Error('Continuation outcome unknown; do not replay');error.outcomeUnknown=true;throw error;}
    finally {stream.close();}
  }

  async listItems(sessionID, {after, limit = 10, order = 'asc',signal} = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid item limit');
    if (!['asc','desc'].includes(order)) throw new Error('Invalid item order');
    const query = new URLSearchParams({order, limit: String(limit)});
    if (after !== undefined) query.set('after', identifier(after));
    return this.#request('GET', '/' + identifier(sessionID) + '/items?' + query,undefined,undefined,signal);
  }
  /** Read only the saved items for ONE specific root turn, not the last
   * 100 messages from an unrelated later turn in this persistent session.
   * A cursor is supplied verbatim from OpenAI's last_id, not inferred from
   * the last data element. The caller must read all pages before settling.
   */
  async retrieveTurn(sessionID,turnID,{signal}={}) {
    const turn=await this.#request('GET','/'+identifier(sessionID)+'/turns/'+identifier(turnID),
      undefined,undefined,signal);
    if(turn?.id!==turnID||turn?.session_id!==sessionID)
      throw Error('Agents root turn identity mismatch');
    return turn;
  }
  async listTurnItems(sessionID,turnID,{after,limit=100,order='asc',signal}={}) {
    if(!Number.isInteger(limit)||limit<1||limit>100||!['asc','desc'].includes(order))
      throw Error('Invalid turn items page');
    const query=new URLSearchParams({order,limit:String(limit)});
    if(after!==undefined)query.set('after',identifier(after));
    return this.#request('GET','/'+identifier(sessionID)+'/turns/'+identifier(turnID)+'/items?'+query,
      undefined,undefined,signal);
  }
  async listTurns(sessionID,{after,limit=20,order='desc'}={}) {
    if(!Number.isInteger(limit)||limit<1||limit>100||!['asc','desc'].includes(order))throw Error('Invalid turn page');
    const query=new URLSearchParams({order,limit:String(limit)});if(after!==undefined)query.set('after',identifier(after));
    return this.#request('GET','/'+identifier(sessionID)+'/turns?'+query);
  }
  /** Immutable files published by completed OpenAI-hosted turns. The source
   * PageStore and Bot/channel ownership must authorize access before a product
   * route exposes this read; do not give iOS raw provider credentials.
   */
  async listArtifacts(sessionID,{after,limit=20,order='desc',signal}={}) {
    if (!Number.isInteger(limit)||limit<1||limit>100||!['asc','desc'].includes(order))
      throw Error('Invalid artifact page');
    const query=new URLSearchParams({limit:String(limit),order});
    if(after!==undefined)query.set('after',identifier(after));
    return this.#request('GET','/'+identifier(sessionID)+'/artifacts?'+query,undefined,undefined,signal);
  }
  async retrieveArtifact(sessionID,artifactID,{signal}={}) {
    const artifact=await this.#request('GET','/'+identifier(sessionID)+'/artifacts/'+identifier(artifactID),
      undefined,undefined,signal);
    if(artifact?.id!==artifactID)throw Error('Agents artifact identity mismatch');
    return artifact;
  }

  async openEventStream(sessionID,{signal}={}) {
    identifier(sessionID);
    const controller=new AbortController();
    const combined=AbortSignal.any([controller.signal,AbortSignal.timeout(60_000),...(signal?[signal]:[])]);
    let response;
    try {
      response=await this.#fetch('https://api.openai.com/v1/agents/sessions/'+sessionID+'/events?stream=true',{
        method:'GET',headers:{Authorization:'Bearer '+this.#apiKey,'OpenAI-Beta':'agents=v1',Accept:'text/event-stream'},redirect:'error',signal:combined});
      if(!response.ok||response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='text/event-stream'||!response.body)throw Error('Invalid stream');
    }catch{
      controller.abort();try{await response?.body?.cancel();}catch{}
      throw Error('Agents event stream unavailable');
    }
    return {close:()=>controller.abort(),events:(async function*(){
      try{
        for await(const frame of parseSSE(response.body)){
          const event=JSON.parse(frame.data);
          if(!event||typeof event.type!=='string'||event.type==='error'||event.session_id!==sessionID)throw Error('Invalid event');
          yield event;
        }
      }catch{throw Error('Agents event stream interrupted; restore saved state');}
      finally{controller.abort();}
    })()};
  }
  async cancelTurn(sessionID, submissionKey) {
    return this.#request('POST', '/' + identifier(sessionID) + '/events',
      {events: [{type: 'agent.session.input.cancel'}]}, submissionKey);
  }

  /** A pending action, not a history item, authorizes this provider-level result. */
  async submitToolResult(sessionID, {turnID, callID, name, output}, submissionKey, {expectedArguments}={}) {
    try{
    identifier(turnID); identifier(callID); key(submissionKey);
    requireText(name, 'tool name');
    // Encode before any request; do not lose a result to a local serialization error after GET.
    const encoded = JSON.stringify(output);
    if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > 4_000_000)
      throw new Error('Invalid or oversized tool result');
    }catch{const e=Error('Invalid tool result; nothing was submitted');e.outcomeUnknown=false;e.failureStage='validation';throw e;}
    let pending;try{
    const session = await this.retrieveSession(sessionID);
    pending = session.required_actions?.find(action => action.type === 'function_call'
      && action.turn_id === turnID && action.call_id === callID && action.name === name);
    if (!pending||expectedArguments!==undefined&&argumentFingerprint(pending.arguments)!==argumentFingerprint(expectedArguments)) throw new Error('Tool call is not currently pending');
    }catch{const e=Error('Could not verify pending tool result; nothing was submitted');e.outcomeUnknown=false;e.failureStage='pending_lookup';throw e;}
    const encoded=JSON.stringify(output);
    return this.#request('POST', '/' + identifier(sessionID) + '/events', {events: [{
      type: 'agent.session.input.tool_result', turn_id: pending.turn_id,
      call_id: pending.call_id, success: true, output: encoded,
    }]}, submissionKey);
  }

  async rejectToolCall(sessionID,{turnID,callID,name,error},submissionKey,{expectedArguments}={}){
    try{
      identifier(turnID);identifier(callID);key(submissionKey);requireText(name,'tool name');
      if(typeof error!=='string'||!error||error.length>2000)throw Error('Invalid tool error');
    }catch{const e=Error('Invalid render refusal');e.outcomeUnknown=false;e.failureStage='validation';throw e;}
    let pending;
    try{
      const session=await this.retrieveSession(sessionID);
      pending=session.required_actions?.find(a=>a.type==='function_call'&&a.turn_id===turnID&&a.call_id===callID&&a.name===name);
      if(!pending||expectedArguments!==undefined&&argumentFingerprint(pending.arguments)!==argumentFingerprint(expectedArguments))throw Error('Tool call is not currently pending');
    }catch(error){
      const e=Error('Could not verify pending render call; nothing was submitted');
      e.outcomeUnknown=false;e.failureStage='pending_lookup';
      if(Number.isInteger(error.status)&&error.status>=400&&error.status<=599)e.status=error.status;
      throw e;
    }
    return this.#request('POST','/'+identifier(sessionID)+'/events',{events:[{
      type:'agent.session.input.tool_result',turn_id:pending.turn_id,call_id:pending.call_id,success:false,error
    }]},submissionKey);
  }

  /** Managed provider scheduling transport, NOT an owner/grant decision.
   * Only existing source-authorized sessions may be targeted by the caller.
   * Never equate invocation delivery with completed agent execution.
   */
  async createAutomation({name,sessionID,instructions,expression,timezone,runAt},submissionKey) {
    identifier(sessionID);key(submissionKey);
    if(typeof name!=='string'||!name.trim()||name.length>120||
       typeof instructions!=='string'||!instructions.trim()||instructions.length>4000)
      throw Error('Invalid automation name or instructions');
    const periodic=typeof expression==='string'&&expression.length<=80&&
      expression.trim().split(/\s+/).length===5&&
      /^([0-9]|[1-5][0-9])$/.test(expression.split(' ')[0]);
    const once=Number.isSafeInteger(runAt)&&runAt>Math.floor(Date.now()/1000)+60&&
      runAt<Math.floor(Date.now()/1000)+366*86400;
    if(periodic===once)throw Error('Specify exactly one bounded automation schedule');
    if(periodic){
      if(typeof timezone!=='string'||timezone.length>64)throw Error('Invalid automation timezone');
      try{new Intl.DateTimeFormat('en-US',{timeZone:timezone});}
      catch{throw Error('Unknown automation timezone');}
    }
    const body={type:periodic?'periodic':'once',name,
      ...(periodic?{expression,timezone}:{run_at:runAt}),
      target:{type:'existing_session',session_id:sessionID,instructions}};
    return this.#automationRequest('POST','',body,submissionKey);
  }
  async retrieveAutomation(id) {
    return this.#automationRequest('GET','/'+identifier(id));
  }
  async listAutomationInvocations(id) {
    const result=await this.#automationRequest('GET','/'+identifier(id)+'/invocations');
    if(!result||!Array.isArray(result.data))throw Error('Invalid automation invocation list');
    return result;
  }
  async pauseAutomation(id,submissionKey) {
    return this.#automationRequest('POST','/'+identifier(id)+'/pause',undefined,submissionKey);
  }
  async resumeAutomation(id,submissionKey) {
    return this.#automationRequest('POST','/'+identifier(id)+'/resume',undefined,submissionKey);
  }
  async deleteAutomation(id) {
    // DELETE is a consequential remote mutation. An unknown outcome is NOT
    // automatically retried, and an in-flight invocation may still deliver.
    return this.#automationRequest('DELETE','/'+identifier(id));
  }
  async #automationRequest(method,path,body,submissionKey) {
    const headers={Authorization:'Bearer '+this.#apiKey,
      'OpenAI-Beta':'agents=v1','Content-Type':'application/json'};
    if(method==='POST')headers['Idempotency-Key']=key(submissionKey);
    let response;
    try{
      response=await this.#fetch('https://api.openai.com/v1/agents/automations'+path,{
        method,headers,redirect:'error',signal:AbortSignal.timeout(30_000),
        ...(body===undefined?{}:{body:JSON.stringify(body)})
      });
    }catch{
      const error=Error('Automation request outcome unknown; inspect provider state before retry');
      error.outcomeUnknown=method!=='GET';throw error;
    }
    if(!response.ok){
      await response.body?.cancel().catch(()=>{});
      const error=Error('Automation API refused request ('+response.status+')');
      error.status=response.status;
      error.outcomeUnknown=method!=='GET'&&(response.status>=500||response.status===408);
      throw error;
    }
    if(response.status===204)return null;
    try{return await response.json();}
    catch{
      const error=Error('Automation response invalid; inspect provider state');
      error.outcomeUnknown=method!=='GET';throw error;
    }
  }

  async #request(method, path, body, submissionKey,signal) {
    const headers = {'Authorization': 'Bearer ' + this.#apiKey,
      'OpenAI-Beta': 'agents=v1', 'Content-Type': 'application/json'};
    if (method === 'POST') headers['Idempotency-Key'] = key(submissionKey);
    const encoded = body === undefined ? undefined : JSON.stringify(body);
    let response;
    try {
      response = await this.#fetch('https://api.openai.com/v1/agents/sessions' + path,
        {method, headers, body: encoded, redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(30_000),...(signal?[signal]:[])])});
    } catch {
      // Never expose a provider URL, body, credentials, or raw exception to the app/logs.
      const error = new Error(method === 'POST'
        ? 'Agents API request outcome unknown; reconcile before retrying'
        : 'Agents API request failed; retrieve session again');
      error.outcomeUnknown = method === 'POST';
      error.failureStage = method === 'POST' ? 'submission' : 'read';
      throw error;
    }
    if (!response.ok) {
      try { await response.body?.cancel(); } catch { /* Cleanup cannot expose provider errors. */ }
      const error = new Error(`Agents API request failed (${response.status})`);
      error.status = response.status;
      error.failureStage = method === 'POST' ? 'submission' : 'read';
      error.outcomeUnknown = method === 'POST' && (response.status >= 500 || response.status === 408);
      throw error;
    }
    // The events endpoint returns HTTP 202 with no body: accepted, not completed.
    if (path.endsWith('/events')) {
      if(response.status===202)return null;
      try{await response.body?.cancel();}catch{}
      const error=Error('Unverified Agents event response; reconcile before retrying');error.outcomeUnknown=true;error.failureStage='response';throw error;
    }
    if (response.status === 204) return null;
    try { return await response.json(); }
    catch {
      const error = new Error('Invalid Agents API response; reconcile before retrying');
      error.outcomeUnknown = method === 'POST';
      error.failureStage = 'response';
      throw error;
    }
  }
}

/**
 * A small fail-closed policy at the existing transport boundary. The caller
 * must separately authorize which original OpenDuet Bot may use these options.
 * Restricted/allowed network, self-hosted executors, vaults and service tools
 * are intentionally not accepted by this minimal provider transport.
 */
function checkedEnvironment(value) {
  if (value === undefined) return {type: 'none'};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid Agents environment');
  if (value.type === 'none' && Object.keys(value).length === 1) return {type: 'none'};
  if (value.type !== 'openai_hosted') throw Error('Unsupported Agents environment');
  const keys = Object.keys(value);
  if (keys.some(k => !['type', 'container_size', 'network'].includes(k))) throw Error('Unapproved Agents environment option');
  if (value.container_size !== undefined && value.container_size !== 'small') throw Error('Only small hosted sandbox is approved');
  if (!value.network || typeof value.network !== 'object' || Array.isArray(value.network) ||
      Object.keys(value.network).length !== 1 || value.network.access !== 'disabled')
    throw Error('Hosted sandbox network access must be disabled');
  return {type:'openai_hosted',container_size:'small',network:{access:'disabled'}};
}
function checkedDelegation(value) {
  if (value === undefined || value === null || value === false) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(k => !['enabled', 'max_concurrent_subagents'].includes(k)) ||
      value.enabled !== true ||
      !Number.isInteger(value.max_concurrent_subagents) ||
      value.max_concurrent_subagents < 1 || value.max_concurrent_subagents > 3)
    throw Error('Unsupported Agents multi-agent configuration');
  return {enabled:true,max_concurrent_subagents:value.max_concurrent_subagents};
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${label}`);
  return value;
}
function identifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value))
    throw new Error('Invalid Agents API identifier');
  return value;
}
function key(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/.test(value))
    throw new Error('Invalid submission key');
  return value;
}

function configuredAgent({model,instructions,tools,reasoningEffort,verbosity}) {
 const agent={model,instructions,tools};
 if(reasoningEffort!==undefined){
  if(!['none','low','medium','high','xhigh','max'].includes(reasoningEffort))throw Error('Unsupported reasoning effort');
  agent.reasoning={effort:reasoningEffort};
 }
 if(verbosity!==undefined){
  if(!['low','medium','high'].includes(verbosity))throw Error('Unsupported verbosity');
  agent.text={verbosity};
 }
 return agent;
}
