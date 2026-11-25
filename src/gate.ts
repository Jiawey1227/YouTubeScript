import type { Job } from './model';

export interface ControlInput {
  job: Job | null;
  scriptOn: boolean;
  scriptRunning: boolean;
  busy: boolean;
}

export function controlState(input: ControlInput) {
  const running = input.job?.status === 'running';
  const scriptJob = input.job?.origin === 'script';
  return {
    startDisabled: input.busy || !!running,
    namesDisabled: input.busy || !!running,
    clearDisabled: input.busy || input.scriptRunning,
    showJobPanel: !!input.job && !scriptJob,
    showResults: !!input.job && !scriptJob,
    summary: input.scriptRunning
      ? '正在由脚本搜索文件夹里的剧名，结束后才能手工搜索。'
      : '本次结果只保留在这个页面。关闭页面即停止搜索。',
    switchLabel: input.scriptOn ? '已打开' : '已关闭',
  };
}
