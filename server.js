#!/usr/bin/env node

/**
 * Revision Remote Server
 *
 * Simple HTTP + WebSocket server for remote browser access
 * - Serves static files (index.html, control.html, assets)
 * - WebSocket bridge for communication between program and control
 *
 * Usage:
 *   node server.js [port]
 *
 * Then access:
 *   Program: http://[server-ip]:8080/
 *   Control: http://[server-ip]:8080/control.html
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.argv[2] || 2011; // Port 2011 - Tribute to the demoscene
const ROOT_DIR = __dirname;

// MIME types for common files
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

// HTTP Server - Serve static files
const httpServer = http.createServer((req, res) => {
    let filePath = path.join(ROOT_DIR, req.url === '/' ? 'index.html' : req.url);

    // Security: prevent directory traversal
    if (!filePath.startsWith(ROOT_DIR)) {
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

// WebSocket Server - Bridge between program and control
const wss = new WebSocketServer({ server: httpServer });

const clients = {
    program: new Set(),  // index.html clients
    control: new Set()   // control.html clients
};

wss.on('connection', (ws, req) => {
    console.log('[WebSocket] New connection from', req.socket.remoteAddress);

    // Determine client type from URL or first message
    let clientType = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());

            // Register client type on first message
            if (!clientType && data.type === 'register') {
                clientType = data.role; // 'program' or 'control'
                clients[clientType]?.add(ws);
                console.log(`[WebSocket] Registered ${clientType} client (${req.socket.remoteAddress})`);
                return;
            }

            // Forward messages to appropriate clients
            if (clientType === 'control') {
                // Control -> Program (commands)
                console.log(`[Control -> Program]`, data.command);
                clients.program.forEach(client => {
                    if (client.readyState === 1) { // OPEN
                        client.send(JSON.stringify(data));
                    }
                });
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

// Get local network IP
function getLocalIP() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip internal and non-IPv4 addresses
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

httpServer.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log('');
    console.log('='.repeat(60));
    console.log('  REVISION - Remote VJ Server');
    console.log('='.repeat(60));
    console.log('');
    console.log(`  Server running on port ${PORT}`);
    console.log('');
    console.log('  Access from this device:`);
    console.log(`    Program: http://localhost:${PORT}/`);
    console.log(`    Control: http://localhost:${PORT}/control.html`);
    console.log('');
    console.log('  Access from remote devices on same network:');
    console.log(`    Program: http://${localIP}:${PORT}/`);
    console.log(`    Control: http://${localIP}:${PORT}/control.html`);
    console.log('');
    console.log('  WebSocket server ready for remote control');
    console.log('');
    console.log('='.repeat(60));
    console.log('');
    console.log('  Press Ctrl+C to stop the server');
    console.log('');
});
