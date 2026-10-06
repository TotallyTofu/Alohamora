import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type EngineApi, type EngineCall, type EngineResult } from '@shared/ipc';

const api: EngineApi = {
  onCall: (cb) => { ipcRenderer.on(IPC.engineCall, (_e, call: EngineCall) => cb(call)); },
  sendResult: (r: EngineResult) => ipcRenderer.send(IPC.engineResult, r),
  ready: () => ipcRenderer.send(IPC.engineReady)
};

contextBridge.exposeInMainWorld('kabooksEngine', api);
