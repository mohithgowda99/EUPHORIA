import {argumentFingerprint} from './provider-arguments.mjs';
import {parseSSE} from './sse.mjs';

/** Server-side Agents API transport. No user authentication, tool execution, or retries here. */
export class AgentsClient {
  #apiKey;
  #fetch;
  #sessionSpendLimitCents;
  constructor({ apiKey, fetchImpl = globalThis.fetch, sessionSpendLimitCents = 50 }) {
    requireText(apiKey, 'server API key');
    // Managed Agents API spend_control is per session, in USD cents.
    // This deliberately avoids relying on our own usage-metering loop.
    if (!Number.isInteger(sessionSpendLimitCents) || sessionSpendLimitCents < 1 ||
        sessionSpendLimitCents > 500) throw new Error('Invalid per-session spending limit');
    this.#apiKey = apiKey;
    this.#fetch = fetchImpl;
    this.#sessionSpendLimitCents = sessionSpendLimitCents;
  }

  async createSession({model, instructions, input, tools = [], environment, multiAgent}, submissionKey) {
    requireText(model, 'model');
    requireText(instructions, 'instructions');
    requireText(input, 'input');
    if (!Array.isArray(tools)) throw new Error('Invalid tools');
    // Provider features remain opt-in and bound to the product's authoritative
    // Bot grants. Passing a config here is not permission to expose external
    // credentials, connected apps, unrestricted network, or device controls.
    const sandbox = checkedEnvironment(environment);
    const delegation = checkedDelegation(multiAgent);
    const agent = {model, instructions, tools};
    if (delegation) agent.multi_agent = delegation;
    return this.#request('POST', '', {agent,
      environment: sandbox, input, stream: false,
      spend_control: {limit: this.#sessionSpendLimitCents}}, submissionKey);
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

  async listItems(sessionID, {after, limit = 10, order = 'asc',signal} = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid item limit');
    if (!['asc','desc'].includes(order)) throw new Error('Invalid item order');
    const query = new URLSearchParams({order, limit: String(limit)});
    if (after !== undefined) query.set('after', identifier(after));
    return this.#request('GET', '/' + identifier(sessionID) + '/items?' + query,undefined,undefined,signal);
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
