const { app, BrowserWindow, Menu, nativeTheme } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { WebSocketServer } = require('ws');

// Force sRGB color space for accurate color rendering
app.commandLine.appendSwitch('force-color-profile', 'srgb');

// Force dark theme globally
nativeTheme.themeSource = 'dark';

let mainWindow;
let httpServer;
let wss;
const PORT = 2005; // Port 2005 - Tribute to the demoscene

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

// HTTP Server - Serve static files for remote browsers
function startHTTPServer() {
  const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.webmanifest': 'application/manifest+json',
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.ts': 'video/mp2t'
  };

  httpServer = http.createServer((req, res) => {
    // Default to control.html for root, since Electron shows index.html
    let filePath = path.join(__dirname, req.url === '/' ? 'control.html' : req.url);

    // Security: prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404);
          res.end('404 Not Found');
        } else {
          res.writeHead(500);
          res.end('Server Error');
        }
        return;
      }

      const ext = path.extname(filePath);
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(data);
    });
  });

  // WebSocket Server - Bridge between Electron and remote browsers
  wss = new WebSocketServer({ server: httpServer });

  const clients = {
    program: new Set(),  // Electron's index.html
    control: new Set()   // Remote browsers with control.html
  };

  wss.on('connection', (ws, req) => {
    console.log('[WebSocket] New connection from', req.socket.remoteAddress);

    let clientType = null;

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());

        // Register client type on first message
        if (!clientType && data.type === 'register') {
          clientType = data.role; // 'program' or 'control'
          clients[clientType]?.add(ws);
          console.log(`[WebSocket] Registered ${clientType} client`);
          return;
        }

        // Forward messages to appropriate clients
        if (clientType === 'control') {
          // Control -> Program (commands)
          clients.program.forEach(client => {
            if (client.readyState === 1) { // OPEN
              client.send(JSON.stringify(data));
            }
          });

          // Also send to Electron main window
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('remote-control-message', data);
          }
        } else if (clientType === 'program') {
          // Program -> Control (state updates)
          clients.control.forEach(client => {
            if (client.readyState === 1) { // OPEN
              client.send(JSON.stringify(data));
            }
          });
        }
      } catch (error) {
        console.error('[WebSocket] Error processing message:', error);
      }
    });

    ws.on('close', () => {
      if (clientType) {
        clients[clientType]?.delete(ws);
        console.log(`[WebSocket] ${clientType} client disconnected`);
      }
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log('');
    console.log('='.repeat(60));
    console.log('  REVISION - Electron + Remote Control Server');
    console.log('='.repeat(60));
    console.log('');
    console.log('  Program Display: Running in Electron window');
    console.log('');
    console.log('  Remote Control Access:');
    console.log(`    Local:   http://localhost:${PORT}/`);
    console.log(`    Network: http://${localIP}:${PORT}/`);
    console.log('');
    console.log('  Open the URL above on any device (tablet, phone, etc.)');
    console.log('  to control this Electron window remotely.');
    console.log('');
    console.log('='.repeat(60));
    console.log('');
  });
}

// Get local network IP
function getLocalIP() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

app.whenReady().then(() => {
  createWindow();
  startHTTPServer();
});

app.on('window-all-closed', () => {
  // Close HTTP server when app quits
  if (httpServer) {
    httpServer.close();
  }
  if (wss) {
    wss.close();
  }

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
