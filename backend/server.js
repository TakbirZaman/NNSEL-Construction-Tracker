import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { runMigrations } from './db/index.js';
import { logger, errorHandler, notFound } from './middleware/middleware.js';

import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import projectsRoutes from './routes/projects.js';
import tasksRoutes from './routes/tasks.js';
import dashboardRoutes from './routes/dashboard.js';

dotenv.config();

const app = express();
const server = createServer(app);

// ─── WebSocket Server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`🔌 WebSocket client connected (total: ${clients.size})`);

  ws.send(JSON.stringify({ type: 'connected', message: 'Connected to ConstructTrack real-time server', timestamp: new Date().toISOString() }));

  // Heartbeat
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      }
    } catch {}
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`🔌 WebSocket client disconnected (total: ${clients.size})`);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    clients.delete(ws);
  });
});

// Heartbeat interval
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Handle server shutdown gracefully
const shutdown = () => {
  console.log('\n🛑 Shutting down gracefully...');
  clearInterval(heartbeat);
  wss.close(() => {
    console.log('🔌 WebSocket server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

wss.on('close', () => clearInterval(heartbeat));

// Broadcast utility
export const broadcast = (event, data) => {
  const message = JSON.stringify({ type: event, data, timestamp: new Date().toISOString() });
  clients.forEach((client) => {
    if (client.readyState === 1) client.send(message);
  });
};

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

// ─── Middleware ───────────────────────────────────────────────────────────────
const corsOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
];
if (process.env.CORS_ORIGIN) {
  corsOrigins.push(process.env.CORS_ORIGIN);
}

app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(logger);

// Rate limiting
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), clients: clients.size });
});

// ─── Serve Frontend (Production) ──────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = (() => {
  const candidates = [
    process.env.PUBLIC_DIR,
    path.join(__dirname, 'public'),
    path.join(__dirname, '..', 'frontend', 'dist'),
  ];
  for (const dir of candidates) {
    if (dir && fs.existsSync(dir)) return dir;
  }
  return candidates[1];
})();

if (process.env.NODE_ENV === 'production' && fs.existsSync(publicDir)) {
  console.log(`📁 Serving frontend from ${publicDir}`);
  app.use(express.static(publicDir));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(publicDir, 'index.html'));
    }
  });
}

// ─── Error Handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Startup ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await runMigrations();
    server.listen(PORT, () => {
      console.log(`\n🚀 ConstructTrack API running on http://localhost:${PORT}`);
      console.log(`🔌 WebSocket server ready`);
      console.log(`📊 Dashboard: http://localhost:${PORT}/api/health\n`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

start();