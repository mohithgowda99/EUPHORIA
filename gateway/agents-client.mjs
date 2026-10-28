/** Server-side Agents API transport. No user authentication, tool execution, or retries here. */
export class AgentsClient {
  #apiKey;
  #fetch;
  constructor({ apiKey, fetchImpl = globalThis.fetch }) {
    requireText(apiKey, 'server API key');
    this.#apiKey = apiKey;
    this.#fetch = fetchImpl;
  }

  async createSession({model, instructions, input, tools = []}, submissionKey) {
    requireText(model, 'model');
    requireText(instructions, 'instructions');
    requireText(input, 'input');
    if (!Array.isArray(tools)) throw new Error('Invalid tools');
    return this.#request('POST', '', {agent: {model, instructions, tools},
      environment: {type: 'none'}, input, stream: false}, submissionKey);
  }

  async retrieveSession(sessionID) {
    const session = await this.#request('GET', '/' + identifier(sessionID));
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

  async listItems(sessionID, {after, limit = 10, order = 'asc'} = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid item limit');
    if (!['asc','desc'].includes(order)) throw new Error('Invalid item order');
    const query = new URLSearchParams({order, limit: String(limit)});
    if (after !== undefined) query.set('after', identifier(after));
    return this.#request('GET', '/' + identifier(sessionID) + '/items?' + query);
  }
  async cancelTurn(sessionID, submissionKey) {
    return this.#request('POST', '/' + identifier(sessionID) + '/events',
      {events: [{type: 'agent.session.input.cancel'}]}, submissionKey);
  }

  /** A pending action, not a history item, authorizes this provider-level result. */
  async submitToolResult(sessionID, {turnID, callID, name, output}, submissionKey) {
    identifier(turnID); identifier(callID); key(submissionKey);
    requireText(name, 'tool name');
    // Encode before any request; do not lose a result to a local serialization error after GET.
    const encoded = JSON.stringify(output);
    if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > 4_000_000)
      throw new Error('Invalid or oversized tool result');
    const session = await this.retrieveSession(sessionID);
    const pending = session.required_actions?.find(action => action.type === 'function_call'
      && action.turn_id === turnID && action.call_id === callID && action.name === name);
    if (!pending) throw new Error('Tool call is not currently pending');
    return this.#request('POST', '/' + identifier(sessionID) + '/events', {events: [{
      type: 'agent.session.input.tool_result', turn_id: pending.turn_id,
      call_id: pending.call_id, success: true, output: encoded,
    }]}, submissionKey);
  }

  async #request(method, path, body, submissionKey) {
    const headers = {'Authorization': 'Bearer ' + this.#apiKey,
      'OpenAI-Beta': 'agents=v1', 'Content-Type': 'application/json'};
    if (method === 'POST') headers['Idempotency-Key'] = key(submissionKey);
    const encoded = body === undefined ? undefined : JSON.stringify(body);
    let response;
    try {
      response = await this.#fetch('https://api.openai.com/v1/agents/sessions' + path,
        {method, headers, body: encoded, redirect: 'error', signal: AbortSignal.timeout(30_000)});
    } catch {
      // Never expose a provider URL, body, credentials, or raw exception to the app/logs.
      const error = new Error(method === 'POST'
        ? 'Agents API request outcome unknown; reconcile before retrying'
        : 'Agents API request failed; retrieve session again');
      error.outcomeUnknown = method === 'POST';
      throw error;
    }
    if (!response.ok) {
      try { await response.body?.cancel(); } catch { /* Cleanup cannot expose provider errors. */ }
      const error = new Error(`Agents API request failed (${response.status})`);
      error.status = response.status;
      error.outcomeUnknown = method === 'POST' && (response.status >= 500 || response.status === 408);
      throw error;
    }
    // The events endpoint returns HTTP 202 with no body: accepted, not completed.
    if (path.endsWith('/events') && response.status === 202) return null;
    if (response.status === 204) return null;
    try { return await response.json(); }
    catch {
      const error = new Error('Invalid Agents API response; reconcile before retrying');
      error.outcomeUnknown = method === 'POST';
      throw error;
    }
  }
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
