import { ipcMain, dialog, type BrowserWindow } from 'electron';
import { CHANNELS } from './channels.js';

export function registerDialogHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(CHANNELS.dialogOpenFolder, async () => {
    const win = getWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}
