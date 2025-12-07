const { app, BrowserWindow, Menu, nativeTheme } = require('electron');
const path = require('path');

// Force sRGB color space for accurate color rendering
app.commandLine.appendSwitch('force-color-profile', 'srgb');

// Force dark theme globally
nativeTheme.themeSource = 'dark';

let mainWindow;

function createWindow() {
  // Remove menu bar completely
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // Enable Web MIDI API in Electron
      enableBlinkFeatures: 'WebMIDIAPI'
    },
    backgroundColor: '#000000',
    title: 'Revision - Audio-Reactive VJ Tool',
    autoHideMenuBar: true,
    frame: true,
    darkTheme: true
  });

  mainWindow.loadFile('index.html');

  // Open DevTools in development mode
  if (process.argv.includes('--enable-logging')) {
    mainWindow.webContents.openDevTools();
  }

  // Keyboard shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      // F11 - Toggle fullscreen
      if (input.key === 'F11') {
        const isFullScreen = mainWindow.isFullScreen();
        mainWindow.setFullScreen(!isFullScreen);
        console.log(`[Revision] Fullscreen: ${!isFullScreen}`);
      }

      // F12 - Toggle DevTools
      if (input.key === 'F12') {
        mainWindow.webContents.toggleDevTools();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked and no windows are open
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
