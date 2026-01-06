const express = require('express');
const cors = require('cors');
const path = require('path');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');
const http = require('http');
const apiRoutes = require('./src/api/routes');
const CaptureService = require('./src/camera/captureService');

const PORT = process.env.PORT || 3000;
const MEDIAMTX_CONFIG = path.join(__dirname, 'mediamtx.yml');

// MediaMTX restart configuration with exponential backoff
const MEDIAMTX_RESTART = {
  initialDelay: 2000,
  maxDelay: 60000,
  maxRestarts: 10,
  resetAfter: 300000
};

let restartState = {
  count: 0,
  delay: MEDIAMTX_RESTART.initialDelay,
  lastStableTime: null
};

// Initialize Express
const app = express();
const server = http.createServer(app);

// Initialize Capture Service
const captureService = new CaptureService();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api', apiRoutes);

// WebSocket for real-time updates
const wss = new WebSocketServer({ server, path: '/ws' });

const broadcast = (type, data) => {
  const message = JSON.stringify({ type, data, timestamp: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
};

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// MediaMTX process management
let mediamtxProcess = null;

const resetRestartState = () => {
  restartState = {
    count: 0,
    delay: MEDIAMTX_RESTART.initialDelay,
    lastStableTime: null
  };
};

const startMediaMTX = () => {
  console.log(`Starting MediaMTX... (attempt ${restartState.count + 1})`);

  mediamtxProcess = spawn('mediamtx', [MEDIAMTX_CONFIG], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  mediamtxProcess.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log('[MediaMTX]', msg);
  });

  mediamtxProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.error('[MediaMTX]', msg);
  });

  mediamtxProcess.on('error', (err) => {
    console.error('MediaMTX failed to start:', err.message);
    broadcast('streamError', { error: err.message });
  });

  mediamtxProcess.on('exit', (code) => {
    console.log(`MediaMTX exited with code ${code}`);
    broadcast('streamStopped', { code });

    if (code !== 0) {
      scheduleRestart();
    }
  });

  // Mark as stable after running for a while
  restartState.lastStableTime = Date.now();
  setTimeout(() => {
    if (mediamtxProcess && restartState.lastStableTime) {
      const runningTime = Date.now() - restartState.lastStableTime;
      if (runningTime >= MEDIAMTX_RESTART.resetAfter) {
        console.log('MediaMTX stable for 5 minutes, resetting restart counter');
        resetRestartState();
      }
    }
  }, MEDIAMTX_RESTART.resetAfter);
};

const scheduleRestart = () => {
  restartState.count++;

  if (restartState.count > MEDIAMTX_RESTART.maxRestarts) {
    console.error(`MediaMTX failed ${MEDIAMTX_RESTART.maxRestarts} times, giving up`);
    broadcast('streamError', { error: 'MediaMTX failed too many times' });
    return;
  }

  console.log(`Restarting MediaMTX in ${restartState.delay / 1000}s...`);
  setTimeout(startMediaMTX, restartState.delay);

  // Exponential backoff
  restartState.delay = Math.min(
    restartState.delay * 2,
    MEDIAMTX_RESTART.maxDelay
  );
};

const stopMediaMTX = () => {
  if (mediamtxProcess) {
    mediamtxProcess.kill('SIGTERM');
    mediamtxProcess = null;
  }
};

// Graceful shutdown
const shutdown = () => {
  console.log('\nShutting down...');
  stopMediaMTX();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`
  ====================================
  Telescope Camera System Started
  ====================================
  Web UI: http://192.168.4.1:${PORT}
  WebRTC Stream: http://192.168.4.1:8889/telescope
  API: http://192.168.4.1:${PORT}/api
  ====================================
  `);

  // Initialize capture service directories
  try {
    await captureService.initialize();
  } catch (err) {
    console.error('Failed to initialize CaptureService:', err.message);
  }

  // Start MediaMTX
  startMediaMTX();
});

module.exports = { app, broadcast };
