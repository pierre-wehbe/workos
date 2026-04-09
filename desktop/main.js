const { BrowserWindow, app, ipcMain, nativeTheme, session } = require("electron");
const path = require("node:path");
const { loadShellEnvironment } = require("./shell-env.js");

const rendererUrl = process.env.ELECTRON_RENDERER_URL;

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0f1512" : "#f8faf9",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  loadShellEnvironment();

  ipcMain.handle("app:get-config", () => ({
    setupComplete: false,
    activeWorkspaceId: null,
    appVersion: app.getVersion(),
  }));

  ipcMain.handle("theme:set", (_event, mode) => {
    nativeTheme.themeSource = mode;
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
