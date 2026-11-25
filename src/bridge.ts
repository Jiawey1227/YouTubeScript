import type { ScriptResult } from './engine';

export const SCRIPT_URL = 'http://127.0.0.1:17321';
export const SCRIPT_SWITCH = 'scriptSearch';
export const SCRIPT_TAB = 'scriptTabId';
export const SCRIPT_ALARM = 'script-poll';

export type PollReply =
  | { action: 'search'; id: string; name: string }
  | { action: 'wait'; reason: string }
  | { action: 'none' };

async function post(path: string, body: unknown) {
  const response = await fetch(`${SCRIPT_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`本机脚本返回 ${response.status}`);
  return (await response.json()) as unknown;
}

export async function pollScript(input: {
  manual: boolean;
  busy: boolean;
}): Promise<PollReply> {
  const reply = (await post('/poll', input)) as PollReply;
  if (reply?.action === 'search' && reply.id && reply.name) return reply;
  if (reply?.action === 'wait') return { action: 'wait', reason: reply.reason };
  return { action: 'none' };
}

export async function sendScriptResult(result: ScriptResult) {
  await post('/result', result);
}
