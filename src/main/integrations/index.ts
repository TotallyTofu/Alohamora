// integrations/index.ts
import type { Settings } from '@shared/types';
import { getCapabilities } from '../capabilities';
import { isLinux, isMac, isWin } from '../paths';
import { setContextMenu } from './contextMenu';                 // Windows (Task 11.3)
import { startGlobalDrag, stopGlobalDrag } from './globalDrag';  // Windows + Linux-X11 (Task 11.5; create a stub now)
import { setLinuxFileManagerMenus } from './linuxFileManagers'; // Linux (Task 11.9; create a stub now)
import { startMacDragHelper, stopMacDragHelper } from './macDragHelper'; // macOS (Task 11.7; create a stub now)
import { setLoginItem } from './loginItem';
import { setSendTo } from './sendTo';                            // Windows (Task 11.2)
import { setDockVisible } from './tray';

/** At startup (prev undefined) only turn ON what is enabled; afterwards apply differences. */
export function applyIntegrations(s: Settings, prev?: Settings): void {
  const changed = (k: keyof Settings): boolean => (prev ? s[k] !== prev[k] : s[k] === true);
  if (isWin && changed('sendToMenu')) setSendTo(s.sendToMenu);
  if (changed('contextMenu')) {
    if (isWin) void setContextMenu(s.contextMenu);
    if (isLinux) setLinuxFileManagerMenus(s.contextMenu);
  }
  if (changed('launchAtLogin')) setLoginItem(s.launchAtLogin);
  if (isMac && (!prev || s.showInDock !== prev.showInDock)) setDockVisible(s.showInDock);
  if (changed('globalDragWheel')) {
    const how = getCapabilities().globalDrag;
    if (how === 'mac-helper') { if (s.globalDragWheel) startMacDragHelper(); else stopMacDragHelper(); }
    if (how === 'hook') { if (s.globalDragWheel) startGlobalDrag(); else stopGlobalDrag(); }
  }
}
