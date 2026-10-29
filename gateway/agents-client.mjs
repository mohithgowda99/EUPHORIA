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
      if(!response.ok||response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='text/event-stream'||!response.body) {
        // The deployed API has rejected spend_control with unknown_parameter.
        // Reject clearly, rather than quietly creating an uncapped session.
        if(await recognizedSpendControlError(response)) {
          const budget=Error('Provider does not support required spend_control; no uncapped fallback');
          budget.code='PROVIDER_SPEND_CONTROL_UNSUPPORTED';
          budget.status=400;
          throw budget;
        }
        throw Error('Invalid session stream');
      }
    }catch(cause){
      controller.abort();try{await response?.body?.cancel();}catch{}
      if(cause?.code==='PROVIDER_SPEND_CONTROL_UNSUPPORTED'){
        cause.outcomeUnknown=false;cause.failureStage='spend_control';throw cause;
      }
      const error=Error('Agents session submission outcome unknown; reconcile original source before retry');
      error.outcomeUnknown=!response||response.status>=500||response.status===408||response.ok;error.failureStage='submission';
      if(response&&!response.ok){
        error.status=response.status;
        if(response.status===400&&response.headers.get('content-type')?.includes('application/json')) {
          // Response body may already have been consumed above. Error is deliberately generic.
          error.message='Agents session rejected (400); inspect budget compatibility before retry';
        }else error.message='Agents session request rejected ('+response.status+')';
      }
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


  /** Original source authorizes owner, Bot, session and file identity first.
   * This transport never decides which user may upload.
   */
  async retrieveEnvironment(environmentID) {
    const id=identifier(environmentID);
    return this.#environmentRequest('GET','/'+id);
  }
  /** Read-only reconciliation. An uncertain upload MUST NEVER be replayed.
   * The provider list exposes file path and byte length, not a content hash.
   */
  async listEnvironmentFiles(environmentID,{page,limit=100,path='/workspace'}={}){
    identifier(environmentID);
    if(!Number.isInteger(limit)||limit<1||limit>100||
       typeof path!=='string'||!/^\\/workspace(?:\\/[A-Za-z0-9._-]+)*$/.test(path)||
       page!==undefined&&(typeof page!=='string'||page.length>512||!page))
      throw Error('Invalid environment file listing');
    const query=new URLSearchParams({limit:String(limit),order:'desc',path});
    if(page!==undefined)query.set('page',page);
    const result=await this.#environmentRequest('GET','/'+environmentID+'/files?'+query);
    if(!result||!Array.isArray(result.data)||result.data.length>limit||
       typeof result.has_more!=='boolean')
      throw Error('Invalid environment file page');
    return result;
  }

  async createEnvironmentFile(environmentID,{path,data},submissionKey) {
    identifier(environmentID);key(submissionKey);
    if(typeof path!=='string'||!/^\/workspace\/[A-Za-z0-9._-]{1,160}$/.test(path)||
       path.includes('..')||typeof data!=='string'||data.length>1_400_000||
       !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data))
      throw Error('Invalid sandbox file upload');
    const bytes=Buffer.from(data,'base64');
    if(bytes.length===0||bytes.length>1024*1024||bytes.toString('base64')!==data)
      throw Error('Invalid sandbox file bytes');
    const result=await this.#environmentRequest('POST','/'+environmentID+'/files',
      {type:'inline',path,data},submissionKey);
    if(result?.environment_id!==environmentID||result?.path!==path||
       result?.size_bytes!==bytes.length)
      throw Error('Unverified hosted file receipt; do not retry automatically');
    return result;
  }
  async #environmentRequest(method,path,body,submissionKey) {
    const headers={Authorization:'Bearer '+this.#apiKey,
      'OpenAI-Beta':'agents=v1','Content-Type':'application/json'};
    if(method==='POST')headers['Idempotency-Key']=key(submissionKey);
    let response;
    try {
      response=await this.#fetch('https://api.openai.com/v1/agents/environments'+path,{
        method,headers,redirect:'error',signal:AbortSignal.timeout(30_000),
        ...(body===undefined?{}:{body:JSON.stringify(body)})
      });
    }catch{
      const error=Error('Hosted environment request uncertain; inspect before retry');
      error.outcomeUnknown=method==='POST';throw error;
    }
    if(!response.ok){
      try{await response.body?.cancel();}catch{}
      const error=Error('Hosted environment API refused request ('+response.status+')');
      error.status=response.status;
      error.outcomeUnknown=method==='POST'&&(response.status>=500||response.status===408);
      throw error;
    }
    try{return await response.json();}
    catch{
      const error=Error('Unverified hosted environment response');
      error.outcomeUnknown=method==='POST';throw error;
    }
  }

  /** Bounded binary read, never an untrusted redirect or a provider URL shared
   * with iOS. CALLER MUST FIRST AUTHORIZE THE SOURCE OWNER AND EXACT ROOT.
   * The provider's artifact-content endpoint is isolated here so a provider
   * 404/unsupported shape fails closed instead of reporting a phantom file.
   */
  async retrieveArtifactContent(sessionID,artifactID,{signal,maxBytes=8*1024*1024}={}) {
    identifier(sessionID);identifier(artifactID);
    if(!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>8*1024*1024)
      throw Error('Invalid hosted artifact limit');
    let response;
    try {
      response=await this.#fetch('https://api.openai.com/v1/agents/sessions/'+sessionID+
        '/artifacts/'+artifactID+'/content',{
        method:'GET',redirect:'error',
        headers:{Authorization:'Bearer '+this.#apiKey,'OpenAI-Beta':'agents=v1',Accept:'application/octet-stream'},
        signal:AbortSignal.any([AbortSignal.timeout(30_000),...(signal?[signal]:[])])
      });
      if(!response.ok||!response.body)throw Error('Hosted artifact content unavailable');
      const length=Number(response.headers.get('content-length'));
      if(response.headers.has('content-length')&&(!Number.isSafeInteger(length)||length<0||length>maxBytes))
        throw Error('Hosted artifact exceeds size limit');
      const reader=response.body.getReader();
      const chunks=[];let size=0;
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        size+=value.byteLength;
        if(size>maxBytes){await reader.cancel().catch(()=>{});throw Error('Hosted artifact exceeds size limit');}
        chunks.push(Buffer.from(value));
      }
      return{bytes:Buffer.concat(chunks,size),contentType:'application/octet-stream'};
    }catch{
      try{await response?.body?.cancel();}catch{}
      throw Error('Hosted artifact content unavailable or exceeded limit');
    }
  }

  /** Delegated workers already belong to the OpenAI session. This read does
   * not create another source Bot, task queue or agent execution manager.
   */
  async listSubagents(sessionID,{after,limit=50,order='desc',signal}={}) {
    if(!Number.isInteger(limit)||limit<1||limit>100||!['asc','desc'].includes(order))
      throw Error('Invalid managed subagent page');
    const query=new URLSearchParams({order,limit:String(limit)});
    if(after!==undefined)query.set('after',identifier(after));
    const result=await this.#request('GET','/'+identifier(sessionID)+'/subagents?'+query,undefined,undefined,signal);
    if(!Array.isArray(result?.data)||result.data.length>limit)
      throw Error('Invalid subagent listing');
    return result;
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
  /** OpenAI's native browser approval event. Source must verify exact owner,
   * session/root, current origin and request ID and persist a one-shot receipt.
   * Never retry a possibly accepted approval write automatically.
   */
  async respondBrowserApproval(sessionID,requestID,decision,submissionKey){
    identifier(sessionID);identifier(requestID);
    if(!['approve','deny','cancel'].includes(decision))
      throw Error('Unsupported browser origin decision');
    const session=await this.retrieveSession(sessionID);
    const present=(session.required_actions??[]).some(a=>
      a.type==='computer_use_approval_request'&&a.request_id===requestID&&
      a.request?.type==='browser_origin_access');
    if(!present)throw Error('Browser origin request is no longer pending');
    return this.#request('POST','/'+sessionID+'/events',{events:[{
      type:'agent.session.input.computer_use_approval_request_result',
      request_id:requestID,response:{type:'browser_origin_access',decision}
    }]},submissionKey);
  }

  async cancelBrowserAuthentication(sessionID,requestID,submissionKey){
    identifier(sessionID);identifier(requestID);
    const session=await this.retrieveSession(sessionID);
    const present=(session.required_actions??[]).some(a=>
      a.type==='computer_use_approval_request'&&a.request_id===requestID&&
      a.request?.type==='browser_authentication');
    if(!present)throw Error('Browser authentication request no longer pending');
    return this.#request('POST','/'+sessionID+'/events',{events:[{
      type:'agent.session.input.computer_use_approval_request_result',
      request_id:requestID,response:{type:'browser_authentication',action:'cancel'}
    }]},submissionKey);
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

  /** Provider transport only. The source owner, grants and spending policy must
   * be verified by the caller before any write. Invocation delivery != turn success.
   * Mutating requests are single-shot; ambiguous responses require reconciliation.
   */
  async createAutomation({name,sessionID,instructions,expression,timezone,runAt,target},submissionKey) {
    key(submissionKey);
    if(typeof name!=='string'||!name.trim()||name.length>120)
      throw Error('Invalid automation name');
    const scheduled=checkedAutomationSchedule({expression,timezone,runAt});
    const resolvedTarget=target===undefined
      ? {type:'existing_session',session_id:identifier(sessionID),instructions:automationInstruction(instructions)}
      : checkedAutomationTarget(target);
    return this.#automationRequest('POST','',{...scheduled,name,target:resolvedTarget},submissionKey);
  }
  async listAutomations({sessionID,after,limit=50}={}) {
    if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid automation page limit');
    const query=new URLSearchParams({limit:String(limit)});
    if(sessionID!==undefined)query.set('session_id',identifier(sessionID));
    if(after!==undefined)query.set('after',identifier(after));
    return checkedAutomationList(await this.#automationRequest('GET','?'+query));
  }
  async retrieveAutomation(id) {
    return this.#automationRequest('GET','/'+identifier(id));
  }
  async updateAutomation(id,patch,submissionKey) {
    key(submissionKey);
    if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('Invalid automation update');
    const unknown=Object.keys(patch).filter(k=>!['name','expression','timezone','runAt','instructions','target'].includes(k));
    if(unknown.length)throw Error('Unknown automation update property');
    const update={};
    if(patch.name!==undefined){
      if(typeof patch.name!=='string'||!patch.name.trim()||patch.name.length>120)throw Error('Invalid automation name');
      update.name=patch.name;
    }
    const changesSchedule=['expression','timezone','runAt'].some(k=>patch[k]!==undefined);
    if(changesSchedule)Object.assign(update,checkedAutomationSchedule(patch));
    if(patch.target!==undefined&&patch.instructions!==undefined)
      throw Error('Use either target or instructions, never both');
    if(patch.target!==undefined)update.target=checkedAutomationTarget(patch.target);
    if(patch.instructions!==undefined){
      // Target is replaced wholesale by the API. A session ID cannot be
      // inferred from a mutable automation name. Caller must pass full target.
      throw Error('Updating instructions requires complete target with original session identity');
    }
    if(!Object.keys(update).length)throw Error('Empty automation update');
    return this.#automationRequest('POST','/'+identifier(id),update,submissionKey);
  }
  async listAutomationInvocations(id,{after,limit=50}={}) {
    if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid invocation page limit');
    const query=new URLSearchParams({limit:String(limit)});
    if(after!==undefined)query.set('after',identifier(after));
    return checkedAutomationList(await this.#automationRequest('GET','/'+identifier(id)+'/invocations?'+query));
  }
  async retrieveAutomationInvocation(automationID,invocationID) {
    const result=await this.#automationRequest('GET','/'+identifier(automationID)+'/invocations/'+identifier(invocationID));
    if(result?.id!==invocationID)throw Error('Automation invocation identity mismatch');
    return result;
  }
  async invokeAutomation(id,submissionKey) {
    return this.#automationRequest('POST','/'+identifier(id)+'/invocations',undefined,key(submissionKey));
  }
  async pauseAutomation(id,submissionKey) {
    return this.#automationRequest('POST','/'+identifier(id)+'/pause',undefined,key(submissionKey));
  }
  async resumeAutomation(id,submissionKey) {
    return this.#automationRequest('POST','/'+identifier(id)+'/resume',undefined,key(submissionKey));
  }
  async deleteAutomation(id) {
    // DELETE has no idempotency key: unknown outcome must be reconciled.
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
      const unsupported=await recognizedSpendControlError(response);
      try { await response.body?.cancel(); } catch { /* Cleanup cannot expose provider errors. */ }
      const error = new Error(unsupported?
        'Provider does not support required spend_control; no uncapped fallback':
        `Agents API request failed (${response.status})`);
      if(unsupported)error.code='PROVIDER_SPEND_CONTROL_UNSUPPORTED';
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
  if (keys.some(k => !['type', 'container_size', 'network', 'skills', 'desktop'].includes(k))) throw Error('Unapproved Agents environment option');
  if (value.container_size !== undefined && value.container_size !== 'small') throw Error('Only small hosted sandbox is approved');
  const desktop=value.desktop;
  const browser=desktop!==undefined;
  if(browser&&(!desktop||typeof desktop!=='object'||Array.isArray(desktop)||
     Object.keys(desktop).length!==1||desktop.enabled!==true))
    throw Error('Invalid OpenAI hosted browser configuration');
  if (!value.network || typeof value.network !== 'object' || Array.isArray(value.network))
    throw Error('Explicit hosted network policy required');
  const policy=value.network;
  if(browser){
    if(Object.keys(policy).sort().join(',')!=='access,allowed_domains'||
      policy.access!=='restricted'||!Array.isArray(policy.allowed_domains)||
      policy.allowed_domains.length<1||policy.allowed_domains.length>12||
      policy.allowed_domains.some(host=>typeof host!=='string'||
       !['developers.openai.com','www.rfc-editor.org','www.w3.org'].includes(host))||
      value.skills!==undefined)
      throw Error('Browser may access only approved documentation hosts without skill bundles');
    return{type:'openai_hosted',container_size:'small',
      desktop:{enabled:true},network:{access:'restricted',
       allowed_domains:[...new Set(policy.allowed_domains)]}};
  }
  if(Object.keys(policy).length!==1||policy.access!=='disabled')
    throw Error('Hosted code sandbox network access must be disabled');
  const skills=value.skills===undefined?[]:value.skills;
  if(!Array.isArray(skills)||skills.length>4)throw Error('Unsupported hosted skill count');
  const seen=new Set();
  const pinned=skills.map(entry=>{
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||
       Object.keys(entry).sort().join(',')!=='skill_id,type,version'||
       entry.type!=='skill_reference'||
       typeof entry.skill_id!=='string'||!/^skill_[A-Za-z0-9_-]{4,56}$/.test(entry.skill_id)||
       typeof entry.version!=='string'||!/^[1-9][0-9]{0,8}$/.test(entry.version)||
       seen.has(entry.skill_id))
      throw Error('Unsupported hosted skill reference');
    seen.add(entry.skill_id);
    return{type:'skill_reference',skill_id:entry.skill_id,version:entry.version};
  });
  return {type:'openai_hosted',container_size:'small',network:{access:'disabled'},
    ...(pinned.length?{skills:pinned}:{})};
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

/** Safe error classification. Never emit provider body, secret or prompt. */
async function recognizedSpendControlError(response) {
  if(response.status!==400)return false;
  try {
    const value=await response.clone().json();
    return value?.error?.param==='spend_control' &&
      value?.error?.code==='unknown_parameter';
  }catch{return false;}
}


// Supported provider schedule, intentionally bounded at the transport edge.
// Product-specific cron minimum intervals are also checked by source RoutineStore.
function checkedAutomationSchedule({expression,timezone,runAt}) {
  const periodic=expression!==undefined,once=runAt!==undefined;
  if(periodic===once)throw Error('Specify exactly one automation schedule');
  if(once) {
    if(!Number.isSafeInteger(runAt)||runAt<=Math.floor(Date.now()/1000)+60||
       runAt>=Math.floor(Date.now()/1000)+366*86400)throw Error('Invalid one-time date');
    return {type:'once',run_at:runAt};
  }
  if(typeof expression!=='string'||expression.length>80)throw Error('Invalid cron');
  const parts=expression.trim().split(/\s+/);
  if(parts.length!==5||parts.some(p=>!/^[A-Za-z0-9*\/,-]+$/.test(p)))
    throw Error('Invalid five-field cron');
  // Conservatively require a minute-field separation of >=15 minutes.
  // Refuse minute ranges with arbitrary step until the source parser proves them safe.
  const minute=parts[0];
  const minutes=minute.split(',').flatMap(term=>{
    if(/^\d{1,2}$/.test(term))return [Number(term)];
    if(/^\*\/(15|20|30|60)$/.test(term)) {
      const step=Number(term.slice(2));return Array.from({length:Math.ceil(60/step)},(_,i)=>i*step);
    }
    return [NaN];
  }).sort((a,b)=>a-b);
  if(!minutes.length||minutes.some(v=>!Number.isInteger(v)||v<0||v>59))
    throw Error('Cron minute field requires bounded frequency');
  for(let i=0;i<minutes.length;i++)
    if((minutes[(i+1)%minutes.length]+(i===minutes.length-1?60:0)-minutes[i])<15)
      throw Error('Automations must run at most every 15 minutes');
  if(typeof timezone!=='string'||!timezone||timezone.length>64)
    throw Error('Invalid automation timezone');
  try{new Intl.DateTimeFormat('en-US',{timeZone:timezone});}
  catch{throw Error('Unknown automation timezone');}
  return {type:'periodic',expression:parts.join(' '),timezone};
}
function automationInstruction(value) {
  if(typeof value!=='string'||!value.trim()||value.length>4000)
    throw Error('Invalid automation instruction');
  return value;
}
function checkedAutomationTarget(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid automation target');
  if(value.type==='existing_session'){
    if(Object.keys(value).some(k=>!['type','session_id','instructions'].includes(k)))
      throw Error('Unknown existing-session target field');
    return {type:'existing_session',session_id:identifier(value.session_id),
      instructions:automationInstruction(value.instructions)};
  }
  if(value.type==='new_session'){
    // Caller MUST separately establish enforceable per-invocation budget.
    // No credentials can be sent through an arbitrary target object.
    if(Object.keys(value).some(k=>!['type','agent_id','input','environment'].includes(k))||
       !value.agent_id||!Array.isArray(value.input)||value.input.length<1||
       value.input.length>10||!value.input.every(m=>m&&m.role==='user'&&
       typeof m.content==='string'&&m.content.trim()&&m.content.length<=4000))
      throw Error('Unsupported new-session automation target');
    const result={type:'new_session',agent_id:identifier(value.agent_id),
      input:value.input.map(m=>({role:'user',content:m.content}))};
    if(value.environment!==undefined)result.environment=checkedEnvironment(value.environment);
    return result;
  }
  throw Error('Unknown automation target');
}
function checkedAutomationList(value) {
  if(!value||!Array.isArray(value.data)||value.data.length>100)
    throw Error('Invalid automation list response');
  return value;
}
