import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('kabooksEngine', { ping: () => 'pong' });
