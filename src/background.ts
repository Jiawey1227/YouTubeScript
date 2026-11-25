import {
  pollScript,
  SCRIPT_ALARM,
  SCRIPT_SWITCH,
  SCRIPT_TAB,
  sendScriptResult,
} from './bridge';
import { Engine, type Driver } from './engine';
import { interactiveBlockReason, samePage, type PageResult } from './model';
import { IndexedJobStore } from './store';
let timer: ReturnType<typeof setTimeout> | undefined;
async function storedTab(): Promise<number | undefined> {
  const data = await chrome.storage.local.get(SCRIPT_TAB);
  return typeof data[SCRIPT_TAB] === 'number' ? data[SCRIPT_TAB] : undefined;
}
const driver: Driver = {
  async createTab() {
    const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
    if (tab.id === undefined) throw new Error('无法创建标签页');
    return tab.id;
  },
  async navigate(id, url) {
    await chrome.tabs.update(id, { url, muted: true, active: false });
  },
  async scriptTab() {
    const id = await storedTab();
    if (id === undefined) return undefined;
    try {
      await chrome.tabs.get(id);
      return id;
    } catch {
      await chrome.storage.local.remove(SCRIPT_TAB);
      return undefined;
    }
  },
  async rememberScriptTab(id) {
    if (id === undefined) await chrome.storage.local.remove(SCRIPT_TAB);
    else await chrome.storage.local.set({ [SCRIPT_TAB]: id });
  },
  async schedule(at) {
    clearTimeout(timer);
    await chrome.alarms.create('collector', {
      when: Math.max(Date.now() + 30000, at),
    });
    const delay = Math.max(0, at - Date.now());
    if (delay < 30000)
      timer = setTimeout(() => {
        void engine.tick().catch(report);
      }, delay);
  },
  async cancel() {
    clearTimeout(timer);
    await chrome.alarms.clear('collector');
  },
};
const engine = new Engine(new IndexedJobStore(), driver);
const ready = engine.startup();
async function setScriptSwitch(on: boolean) {
  await chrome.storage.local.set({ [SCRIPT_SWITCH]: on });
  if (on) {
    await chrome.alarms.create(SCRIPT_ALARM, {
      periodInMinutes: 0.5,
      when: Date.now() + 30000,
    });
  } else {
    await chrome.alarms.clear(SCRIPT_ALARM);
  }
}
async function resumeScriptAlarm() {
  const data = await chrome.storage.local.get(SCRIPT_SWITCH);
  if (data[SCRIPT_SWITCH] === true) await setScriptSwitch(true);
}
function report(error: unknown) {
  console.error(
    '剧名搜索：',
    error instanceof Error ? error.message : '未知错误',
  );
}
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'collector')
    void ready
      .then(() => engine.tick())
      .then(() => reportScriptResult())
      .catch(report);
});
chrome.runtime.onStartup.addListener(() => {
  void ready
    .then(() => engine.startup())
    .then(() => resumeScriptAlarm())
    .catch(report);
});
chrome.runtime.onConnect.addListener((port) => {
  if (
    port.name !== 'control' ||
    port.sender?.url !== chrome.runtime.getURL('index.html')
  )
    return;
  port.onDisconnect.addListener(() => {
    void ready.then(() => engine.clearManual()).catch(report);
  });
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void ready
    .then(async () => {
      if ((await storedTab()) === tabId)
        await chrome.storage.local.remove(SCRIPT_TAB);
      await engine.failCurrent(tabId, '搜索标签页已关闭', true);
    })
    .catch(report);
});

async function scriptCycle() {
  await reportScriptResult();
  const data = await chrome.storage.local.get(SCRIPT_SWITCH);
  if (data[SCRIPT_SWITCH] !== true) return;
  const { scriptRunning, manualRunning } = await engine.snapshot();
  let reply;
  try {
    reply = await pollScript({
      manual: manualRunning,
      busy: scriptRunning,
    });
  } catch {
    return;
  }
  if (reply.action !== 'search' || scriptRunning) return;
  try {
    await engine.startScript(reply.name, reply.id);
  } catch (error) {
    report(error);
  }
}

async function reportScriptResult() {
  const result = await engine.takeScriptResult();
  if (!result) return;
  try {
    await sendScriptResult(result);
  } catch (error) {
    report(error);
    return;
  }
  await engine.clear();
}
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SCRIPT_ALARM)
    void ready.then(() => scriptCycle()).catch(report);
});

async function pageReady(tabId: number, tab: chrome.tabs.Tab) {
  await ready;
  const { job } = await engine.snapshot();
  if (!job || job.tabId !== tabId || job.status !== 'running' || !job.step)
    return;
  const url = tab.url ?? '';
  const blocked = interactiveBlockReason(url);
  if (blocked) {
    await engine.failCurrent(tabId, blocked);
    return;
  }
  if (url && !samePage(url, job.step.url)) {
    if (url !== 'about:blank')
      await engine.failCurrent(tabId, '搜索页已离开预期地址');
    return;
  }
  if (
    tab.status !== 'complete' ||
    !samePage(url, job.step.url) ||
    job.step.phase === 'reading'
  )
    return;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
    const documentId = results[0]?.documentId;
    if (!documentId) return;
    const claim = await engine.claim(tabId, documentId);
    if (!claim) return;
    await chrome.tabs.sendMessage(
      tabId,
      {
        type: 'collect',
        jobId: claim.jobId,
        stepId: claim.step.id,
        url: claim.step.url,
        name: claim.step.name,
      },
      { documentId },
    );
  } catch {
    /* Persisted deadline fails this drama and continues with the next name. */
  }
}
chrome.tabs.onUpdated.addListener((id, change, tab) => {
  if (change.status || change.url) void pageReady(id, tab).catch(report);
});
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  const msg = message as Record<string, unknown>;
  if (!msg || typeof msg.type !== 'string') return;
  if (msg.type === 'page-result') {
    if (
      sender.id !== chrome.runtime.id ||
      sender.tab?.id === undefined ||
      !sender.documentId ||
      sender.frameId !== 0
    )
      return;
    void (async () => {
      await ready;
      const { job } = await engine.snapshot();
      if (
        !job?.step ||
        typeof msg.url !== 'string' ||
        !samePage(msg.url, job.step.url)
      )
        return;
      const result = msg.result as PageResult;
      if (!result || !['search', 'error'].includes(result.kind)) return;
      await engine.receive(
        String(msg.jobId),
        String(msg.stepId),
        sender.tab!.id!,
        sender.documentId!,
        result,
      );
      await reportScriptResult();
    })().catch(report);
    return;
  }
  if (
    sender.id !== chrome.runtime.id ||
    sender.url !== chrome.runtime.getURL('index.html')
  )
    return;
  const work = async () => {
    await ready;
    switch (msg.type) {
      case 'snapshot':
        await engine.tick();
        break;
      case 'start': {
        if (
          !Array.isArray(msg.names) ||
          !msg.names.every((name) => typeof name === 'string')
        )
          throw new Error('剧名名单无效');
        await engine.start(msg.names as string[]);
        break;
      }
      case 'clear':
        await engine.clear();
        break;
      case 'switch':
        await setScriptSwitch(msg.on === true);
        break;
      default:
        throw new Error('未知操作');
    }
    const snapshot = await engine.snapshot();
    const stored = await chrome.storage.local.get(SCRIPT_SWITCH);
    return { ...snapshot, scriptOn: stored[SCRIPT_SWITCH] === true };
  };
  void work()
    .then((data) => respond({ ok: true, ...data }))
    .catch((error) =>
      respond({
        ok: false,
        error: error instanceof Error ? error.message : '操作失败',
      }),
    );
  return true;
});
