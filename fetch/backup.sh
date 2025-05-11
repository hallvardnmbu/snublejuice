#!/bin/bash

LOG_FILE="/home/snublejuice/Documents/logs/backup-$(date +'%Y-%m-%d_%H-%M-%S').log"

log() {
    local message="$1"
    echo "$(date +'%Y-%m-%d %H:%M:%S') [?] $message" | tee -a "$LOG_FILE"
}

abort() {
    log "$1"
    exit 1
}

cd /home/snublejuice/Documents/snublejuice || abort "Failed to change directory to project root."

# 1. Backing up database
log "Backing up database"
uv run backups/operations.py backup || abort "Something went wrong!"

log "Backup saved."
