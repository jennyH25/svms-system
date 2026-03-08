const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("svmsDesktop", {
  platform: process.platform,
});
