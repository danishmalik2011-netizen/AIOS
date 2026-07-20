/* Shared IPC channel name constants — imported by both the main-process
   handlers and the preload bridge so the two never drift out of sync. */

export const CHANNELS = {
  dialogOpenFolder: 'dialog:openFolder',

  fsReadTree: 'fs:readTree',
  fsReadFile: 'fs:readFile',
  fsWriteFile: 'fs:writeFile',
  fsCreateEntry: 'fs:createEntry',
  fsSearch: 'fs:search',

  gitStatus: 'git:status',
  gitStage: 'git:stage',
  gitUnstage: 'git:unstage',
  gitStageAll: 'git:stageAll',
  gitUnstageAll: 'git:unstageAll',
  gitCommit: 'git:commit',
  gitLog: 'git:log',

  ptySpawn: 'pty:spawn',
  ptyAttach: 'pty:attach',
  ptyWrite: 'pty:write',
  ptyResize: 'pty:resize',
  ptyKill: 'pty:kill',
  ptyData: 'pty:data',
  ptyExit: 'pty:exit',

  shellExec: 'shell:exec',

  secretsGet: 'secrets:get',
  secretsSet: 'secrets:set',
  secretsClear: 'secrets:clear',
  secretsHas: 'secrets:has',

  webSearch: 'web:search',

  ttsSpeak: 'tts:speak',
  ttsCancel: 'tts:cancel',
  ttsEnd: 'tts:end',

  sttTranscribe: 'stt:transcribe',
} as const;
