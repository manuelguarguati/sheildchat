# Shield Chat - Enterprise SaaS Private Messaging Platform

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start development server
npm start

# Access at http://localhost:3000
# Default login: admin / Admin123!
```

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Production Deployment](#-production-deployment)
- [Security](#-security)
- [API Documentation](#-api-documentation)
- [Mobile App](#-mobile-app)
- [Backup & Recovery](#-backup--recovery)
- [Scaling](#-scaling)

## ✨ Features

- **Multi-tenant Architecture** - Complete isolation between companies
- **Real-time Messaging** - Socket.io powered instant messaging
- **End-to-End Encryption** - AES-256 encryption for all messages
- **Enterprise Security** - JWT, rate limiting, CSRF protection
- **Admin Panel** - User management, audit logs, analytics
- **PWA Ready** - Installable, offline-capable web app
- **Mobile Support** - Convert to Android/iOS with Capacitor
- **Responsive Design** - Mobile-first, works on all devices

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Login   │  │   Chat   │  │  Admin   │  │   PWA    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API GATEWAY                             │
│  Express.js + Helmet + Rate Limiting + CORS + CSRF          │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
│  Socket.io   │    │   REST API      │    │  MySQL DB    │
│  (Real-time) │    │   (JSON)        │    │ (Sequelize)  │
└──────────────┘    └──────────────────┘    └──────────────┘
```

## 📦 Installation

### Prerequisites

- Node.js 18+
- MySQL 8.0+
- npm or yarn

### Setup

1. **Clone and install**
   ```bash
   cd Shield\ Chat
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   nano .env
   ```

3. **Required environment variables**
   ```env
   # Server
   PORT=3000
   NODE_ENV=development

   # Database
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=shieldchat

   # Security
   JWT_SECRET=your_super_secret_key_change_this
   JWT_EXPIRES_IN=1d
   ENCRYPTION_KEY=32_character_encryption_key

   # CORS
   FRONTEND_URL=http://localhost:3000
   ```

4. **Create database**
   ```sql
   CREATE DATABASE shieldchat CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

5. **Start server**
   ```bash
   npm start
   ```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | 3000 | No |
| `NODE_ENV` | Environment | development | No |
| `DB_HOST` | MySQL host | localhost | Yes |
| `DB_PORT` | MySQL port | 3306 | No |
| `DB_USER` | MySQL user | root | Yes |
| `DB_PASSWORD` | MySQL password | - | Yes |
| `DB_NAME` | Database name | shieldchat | Yes |
| `JWT_SECRET` | JWT signing key | - | Yes |
| `JWT_EXPIRES_IN` | Token expiration | 1d | No |
| `ENCRYPTION_KEY` | AES-256 key (32 chars) | - | Yes |
| `FRONTEND_URL` | CORS origin | - | No |

### Security Keys

Generate secure keys:

```bash
# JWT Secret (at least 32 characters)
openssl rand -base64 32

# Encryption Key (exactly 32 characters for AES-256)
openssl rand -hex 16
```

## 🚀 Production Deployment

### Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start server.js --name shield-chat

# Setup startup script
pm2 startup

# Save PM2 process list
pm2 save

# Monitor
pm2 monit
```

### Using Systemd

Create `/etc/systemd/system/shield-chat.service`:

```ini
[Unit]
Description=Shield Chat Server
After=network.target mysql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/path/to/shield-chat
ExecStart=/usr/bin/node server.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Using NGINX

```nginx
server {
    listen 80;
    server_name chat.yourdomain.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name chat.yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/chat.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chat.yourdomain.com/privkey.pem;
    
    # SSL configuration
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_protocols TLSv1.2 TLSv1.3;
    
    # Node.js app
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # WebSocket support
    location /socket.io {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Database Setup (Production)

```bash
# Create production database
mysql -u root -p -e "CREATE DATABASE shieldchat_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Create limited user
mysql -u root -p -e "CREATE USER 'shieldchat'@'localhost' IDENTIFIED BY 'strong_password';"
mysql -u root -p -e "GRANT ALL PRIVILEGES ON shieldchat_prod.* TO 'shieldchat'@'localhost';"
mysql -u root -p -e "FLUSH PRIVILEGES;"
```

## 🔐 Security

### Implemented Security Features

| Feature | Description |
|---------|-------------|
| **JWT Authentication** | Token-based stateless authentication |
| **bcrypt Hashing** | Password hashing with salt rounds |
| **AES-256 Encryption** | Message content encryption |
| **Rate Limiting** | 100 requests per 15 minutes |
| **CORS** | Cross-origin resource sharing control |
| **Helmet** | Security headers middleware |
| **CSRF** | Cross-site request forgery protection |
| **Account Locking** | 5 failed attempts = 15 min lock |
| **Audit Logging** | All actions are logged |

### Security Recommendations

1. **Use HTTPS in production**
   ```env
   # Behind reverse proxy with SSL
   NODE_ENV=production
   ```

2. **Strong secrets**
   ```env
   JWT_SECRET=$(openssl rand -base64 64)
   ENCRYPTION_KEY=$(openssl rand -hex 32)
   ```

3. **Database security**
   - Use dedicated database user
   - Regular password rotation
   - Enable SSL for database connections

4. **Network security**
   - Firewall only necessary ports
   - Use VPN for admin access
   - Consider VPC for database

## 📡 API Documentation

### Authentication

```
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "Admin123!",
  "company_domain": "optional"
}

Response:
{
  "success": true,
  "data": {
    "token": "eyJhbG...",
    "user": { ... }
  }
}
```

### Messages

```
GET /api/messages/users
Authorization: Bearer <token>

GET /api/messages/conversation/:userId
Authorization: Bearer <token>

POST /api/messages/send/:userId
Authorization: Bearer <token>
Content-Type: application/json
{
  "content": "Hello!",
  "message_type": "text"
}
```

### Admin

```
GET /api/admin/stats
Authorization: Bearer <token> (admin only)

GET /api/admin/users
Authorization: Bearer <token> (admin only)

POST /api/admin/users
Authorization: Bearer <token> (admin only)
```

## 📱 Mobile App

### Using Capacitor

```bash
# Install Capacitor
npm install @capacitor/core @capacitor/cli

# Initialize Android
npx cap init --android

# Add Android platform
npx cap add android

# Open Android Studio
npx cap open android

# Build and run from Android Studio
```

### Using Cordova (Alternative)

```bash
# Install Cordova
npm install -g cordova

# Add platforms
cordova platform add android
cordova platform add ios

# Build
cordova build android
cordova build ios
```

### PWA Installation

The app is already configured as a PWA:

1. Open in Chrome/Edge
2. Click install icon in address bar
3. Or menu → "Install Shield Chat"

## 💾 Backup & Recovery

### Automated Backups

```bash
# Make script executable
chmod +x scripts/backup.sh

# Test backup
./scripts/backup.sh

# Setup cron job (daily at 2 AM)
crontab -e

# Add line:
0 2 * * * /path/to/shield-chat/scripts/backup.sh >> /var/log/backup.log 2>&1
```

### Manual Backup

```bash
# Backup database
mysqldump -u root -p shieldchat > backup_$(date +%Y%m%d).sql

# Restore database
mysql -u root -p shieldchat < backup_20240101.sql
```

### Recovery Steps

1. Stop the server
2. Restore database backup
3. Verify connection settings
4. Restart server
5. Test functionality

## 📈 Scaling

### Horizontal Scaling

```nginx
# Load balancer configuration
upstream shield_chat {
    server 10.0.0.1:3000;
    server 10.0.0.2:3000;
    server 10.0.0.3:3000;
}
```

### Redis for Sessions (Advanced)

```javascript
// config/database.js
const sequelize = new Sequelize({...});

// For scaling Socket.io, consider using Redis adapter
// https://socket.io/docs/v4/redis-adapter/
```

### Database Read Replicas

```javascript
// config/database.js
const sequelize = new Sequelize({
  // Write replica
  write: {...},
  // Read replicas
  read: [
    {...},
    {...}
  ]
});
```

## 📁 Project Structure

```
shield-chat/
├── config/
│   ├── database.js      # Sequelize configuration
│   ├── encryption.js    # AES-256 encryption
│   └── socket.js        # Socket.io configuration
├── controllers/
│   ├── adminController.js
│   ├── authController.js
│   ├── messageController.js
│   └── userController.js
├── middleware/
│   └── auth.js          # JWT & authorization
├── models/
│   ├── Company.js       # Multi-tenant model
│   ├── User.js
│   ├── Message.js
│   ├── AuditLog.js
│   └── index.js         # Relationships
├── public/
│   ├── css/styles.css
│   ├── js/
│   │   ├── api.js
│   │   ├── auth.js
│   │   ├── chat.js
│   │   ├── admin.js
│   │   └── service-worker.js
│   ├── login.html
│   ├── chat.html
│   ├── admin.html
│   └── manifest.json
├── routers/
│   ├── admin.js
│   ├── auth.js
│   ├── messages.js
│   └── users.js
├── scripts/
│   └── backup.sh
├── server.js            # Main entry point
├── package.json
├── capacitor.config.json
└── README.md
```

## 🐛 Troubleshooting

### Common Issues

**Connection refused**
- Check MySQL is running
- Verify credentials in .env
- Check firewall rules

**Token expired**
- Login again to get new token
- Check JWT_EXPIRES_IN setting

**CORS errors**
- Configure FRONTEND_URL
- Check browser console

**Socket.io not connecting**
- Check WebSocket proxy configuration
- Verify CORS settings

### Logs

```bash
# PM2 logs
pm2 logs shield-chat

# System logs
tail -f /var/log/syslog
```

## 📄 License

ISC License - See LICENSE file for details.

## 🤝 Support

For enterprise support or custom development, contact the development team.

---

**Shield Chat v1.0.0** - Built with ❤️ for enterprise secure communication
