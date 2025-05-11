#!/bin/bash

LOG_FILE="/home/snublejuice/Documents/logs/restore-$(date +'%Y-%m-%d_%H-%M-%S').log"

log() {
    local message="$1"
    echo "$(date +'%Y-%m-%d %H:%M:%S') [?] $message" | tee -a "$LOG_FILE"
}

abort() {
    log "$1"
    exit 1
}

cd /home/snublejuice/Documents/snublejuice || abort "Failed to change directory to project root."

# 1. Restoring database
log "Restoring database"
if [ -n "$1" ]; then
    uv run backups/operations.py restore --date "$1" || abort "Something went wrong!"
else
    uv run backups/operations.py restore || abort "Something went wrong!"
fi

log "Backup saved."
