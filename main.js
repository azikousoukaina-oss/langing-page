const { app, BrowserWindow, ipcMain, session, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

const DATA_FILE = path.join(app.getPath("userData"), "browser-data.json");
const HOME_URL = "https://www.google.com";

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { bookmarks: [], history: [] };
  }
}

function saveData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let data = { bookmarks: [], history: [] };

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 560,
    title: "Personal Browser",
    backgroundColor: "#202124",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  session.defaultSession.on("will-download", (_event, item) => {
    win.webContents.send("download-started", {
      filename: item.getFilename(),
      url: item.getURL(),
    });
    item.on("done", (_e, state) => {
      win.webContents.send("download-done", {
        filename: item.getFilename(),
        state,
      });
    });
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    win.webContents.send("open-url-in-tab", url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  data = loadData();
  Menu.setApplicationMenu(null);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("get-data", () => data);
ipcMain.handle("get-home", () => HOME_URL);

ipcMain.handle("add-bookmark", (_e, bookmark) => {
  if (!bookmark?.url) return data.bookmarks;
  data.bookmarks = data.bookmarks.filter((b) => b.url !== bookmark.url);
  data.bookmarks.unshift({
    title: bookmark.title || bookmark.url,
    url: bookmark.url,
  });
  saveData(data);
  return data.bookmarks;
});

ipcMain.handle("remove-bookmark", (_e, url) => {
  data.bookmarks = data.bookmarks.filter((b) => b.url !== url);
  saveData(data);
  return data.bookmarks;
});

ipcMain.handle("add-history", (_e, entry) => {
  if (!entry?.url || entry.url.startsWith("file:")) return data.history;
  data.history = data.history.filter((h) => h.url !== entry.url);
  data.history.unshift({
    title: entry.title || entry.url,
    url: entry.url,
    at: Date.now(),
  });
  data.history = data.history.slice(0, 300);
  saveData(data);
  return data.history;
});

ipcMain.handle("clear-history", () => {
  data.history = [];
  saveData(data);
  return data.history;
});

ipcMain.handle("open-external", (_e, url) => {
  if (typeof url === "string" && /^https?:/i.test(url)) shell.openExternal(url);
});
