const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronEnv', {
  isElectron: true,
  platform: process.platform
});
