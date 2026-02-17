/**
 * Vercel Serverless Function Entry Point
 * ========================================
 * This file is the main entry point for Vercel serverless deployment.
 * 
 * IMPORTANT NOTES:
 * - Socket.io is NOT compatible with Vercel (requires WebSockets)
 * - Uses serverless-http to convert Express app to Lambda-compatible format
 * - Lazy initialization for Sequelize to avoid connection issues during cold starts
 * 
 * Environment Variables Required:
 * - DATABASE_URL: PostgreSQL connection string from Supabase
 * - JWT_SECRET: Secret key for JWT token generation
 * - ENCRYPTION_KEY: 32-character key for AES-256 encryption
 * - FRONTEND_URL: Allowed origin for CORS
 */

const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Import database (lazy connection for serverless)
const { connectDB, getSequelize } = require('../config/database');

// Import models (lazy initialization)
require('../models');

// Import routers
const authRoutes = require('../routers/auth');
const messageRoutes = require('../routers/messages');
const userRoutes = require('../routers/users');
const adminRoutes = require('../routers/admin');
const friendsRoutes = require('../routers/friends');

// Create Express app
const app = express();

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

// =====================
// DATABASE CONNECTION MIDDLEWARE (for Serverless)
// =====================

// Lazy connect to database on each request
app.use(async (req, res, next) => {
  // Skip DB connection for health check, root, and static files
  const staticExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.css', '.js', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.webp'];
  const isStaticFile = staticExtensions.some(ext => req.path.endsWith(ext));
  const isStaticRoute = req.path.startsWith('/css/') || req.path.startsWith('/js/') || req.path.startsWith('/icons/') || req.path.startsWith('/scripts/') || req.path.startsWith('/sounds/') || req.path.startsWith('/uploads/');
  
  if (req.path === '/api/health' || req.path === '/' || req.path === '/favicon.png' || req.path === '/favicon.ico' || isStaticFile || isStaticRoute) {
    return next();
  }
  
  try {
    const db = getSequelize();
    if (!db) {
      console.error('⚠️ DATABASE_URL no configurada en Vercel');
      return res.status(503).json({
        success: false,
        message: 'Database not configured. Please set DATABASE_URL in Vercel Environment Variables.',
        hint: 'Go to Vercel Dashboard > Settings > Environment Variables'
      });
    }
    await db.authenticate();
    next();
  } catch (error) {
    console.error('Database connection error:', error.message);
    res.status(503).json({
      success: false,
      message: 'Database unavailable'
    });
  }
});

// ======================
// STATIC FILES & PWA (Vercel serves these from /public)
// ======================

app.use(express.static(path.join(__dirname, '../public')));

// ======================
// API ROUTES
// =====================

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
    environment: process.env.NODE_ENV || 'production',
    serverless: true
  });
});

// Root endpoint - Returns JSON for Vercel serverless
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'SecureCorp Chat API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      messages: '/api/messages',
      users: '/api/users',
      friends: '/api/friends',
      admin: '/api/admin'
    },
    timestamp: new Date().toISOString()
  });
});

// ======================
// FRONTEND ROUTES (Serve HTML for SPA)
// ======================

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/chat.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
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
// EXPORT FOR VERCEL
// =====================

// Export the Express app wrapped with serverless-http
// This converts the Express app to a format compatible with Vercel's serverless functions
module.exports = serverless(app, {
  binary: ['application/octet-stream']
});
