#!/bin/bash

# ============================================================================
# Shield Chat - Database Backup Script
# ============================================================================
# This script creates automatic backups of the Shield Chat MySQL database
# ============================================================================

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-shieldchat}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${DATE}.sql.gz"
RETENTION_DAYS=${BACKUP_RETENTION:-30}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create backup directory if not exists
mkdir -p "$BACKUP_DIR"

# Log function
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Start backup
log "Starting database backup..."

# Check if mysqldump is available
if ! command -v mysqldump &> /dev/null; then
    error "mysqldump command not found. Please install MySQL client tools."
fi

# Create backup with compression
if [ -n "$DB_PASS" ]; then
    mysqldump -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" | gzip > "$BACKUP_FILE"
else
    mysqldump -h "$DB_HOST" -u "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"
fi

# Check if backup was successful
if [ $? -eq 0 ]; then
    log "Backup created successfully: $BACKUP_FILE"
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log "Backup size: $BACKUP_SIZE"
else
    error "Backup failed!"
fi

# Remove old backups
log "Removing backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete

if [ $? -eq 0 ]; then
    log "Old backups cleaned up successfully"
else
    warn "Failed to clean up old backups"
fi

# List current backups
log "Current backups:"
ls -lh "$BACKUP_DIR"/"${DB_NAME}_"*.sql.gz 2>/dev/null | tail -5

log "Backup completed successfully!"
exit 0
