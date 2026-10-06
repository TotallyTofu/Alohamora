import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('kabooks', { ping: () => 'pong' });
