/**
 * SecureCorp Chat - Main Server Entry Point
 * ==========================================
 * This file is used for LOCAL DEVELOPMENT and traditional server deployment.
 * 
 * For VERCEL deployment, use api/index.js instead.
 * 
 * IMPORTANT NOTES:
 * - Socket.io is NOT compatible with Vercel (requires WebSockets)
 * - This file runs Socket.io for real-time features in local development
 * - Uses dotenv for local environment configuration
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Import database
const { connectDB, getSequelize } = require('./config/database');

// Import models
require('./models');

// Import routers
const authRoutes = require('./routers/auth');
const messageRoutes = require('./routers/messages');
const userRoutes = require('./routers/users');
const adminRoutes = require('./routers/admin');
const friendsRoutes = require('./routers/friends');

// Import Socket.io configuration
const socketConfig = require('./config/socket');

const app = express();
const server = http.createServer(app);

// Socket.io setup with CORS
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Trust proxy for ngrok and other reverse proxies
app.set('trust proxy', 1);

// ======================
// MIDDLEWARE CONFIGURATION
// ======================

// Helmet - Security headers
app.use(helmet({
  contentSecurityPolicy: false
}));

// CORS - Cross-origin resource sharing
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Too many requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Stricter rate limit for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again in 15 minutes.'
  }
});

app.use('/api/auth/login', loginLimiter);
app.use('/api', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ======================
// STATIC FILES & PWA
// ======================

app.use(express.static(path.join(__dirname, 'public')));

// ======================
// API ROUTES
// ======================

app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/friends', friendsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Shield Chat API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint - Serve frontend (SPA fallback)
// Note: The catch-all route at the end handles this now

// ======================
// FRONTEND ROUTES
// ======================

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Catch-all route for SPA - Serve index.html for non-API routes
// This must be AFTER all API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler - Only reached if file not found
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// ======================
// SOCKET.IO CONFIGURATION
// ======================

// Configure Socket.io with the Express app
socketConfig(io);

// Store io instance for use in routes
app.set('io', io);

console.log('🔌 Socket.io enabled for real-time messaging');

// =====================
// SERVER INITIALIZATION (Local Development)
// =====================

async function startServer() {
  try {
    await connectDB();
    
    // Get the sequelize instance after DB is connected
    const sequelize = getSequelize();
    
    // Sync all models with database
    await sequelize.sync();
    console.log('✅ Tablas sincronizadas correctamente');
    
    // Start HTTP server (NO app.listen - using http.createServer instead)
    const PORT = process.env.PORT || 10000;
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
      console.log(`📱 Accede a: http://localhost:${PORT}`);
      console.log(`🔌 Socket.io habilitado para comunicación en tiempo real`);
    });
  } catch (error) {
    console.error('❌ Error inicializando el servidor:', error);
    process.exit(1);
  }
}

startServer();

// ======================
// GRACEFUL SHUTDOWN
// ======================

async function gracefulShutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  
  try {
    const sequelize = getSequelize();
    server.close(async () => {
      console.log('HTTP server closed');
      if (sequelize) {
        await sequelize.close();
      }
      console.log('Graceful shutdown complete');
      process.exit(0);
    });
    
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } catch (error) {
    console.error('Error during shutdown:', error.message);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Export app for testing purposes (NOT for Vercel - use api/index.js)
module.exports = app;
