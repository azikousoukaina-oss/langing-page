const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("browser", {
  getData: () => ipcRenderer.invoke("get-data"),
  getHome: () => ipcRenderer.invoke("get-home"),
  addBookmark: (bookmark) => ipcRenderer.invoke("add-bookmark", bookmark),
  removeBookmark: (url) => ipcRenderer.invoke("remove-bookmark", url),
  addHistory: (entry) => ipcRenderer.invoke("add-history", entry),
  clearHistory: () => ipcRenderer.invoke("clear-history"),
  onDownloadStarted: (fn) => ipcRenderer.on("download-started", (_e, info) => fn(info)),
  onDownloadDone: (fn) => ipcRenderer.on("download-done", (_e, info) => fn(info)),
  onOpenUrlInTab: (fn) => ipcRenderer.on("open-url-in-tab", (_e, url) => fn(url)),
});
