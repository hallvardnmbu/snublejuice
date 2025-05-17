#!/bin/bash

LOG_FILE="/home/snublejuice/Documents/logs/backup-$(date +'%Y-%m-%d_%H-%M-%S').log"

log() {
    local message="$1"
    local level="${2:-1}"

    if [ "$level" = "0" ]; then
        echo "$(date +'%Y-%m-%d %H:%M:%S')     $message" | tee -a "$LOG_FILE"
    else
        echo "$(date +'%Y-%m-%d %H:%M:%S') [?] $message" | tee -a "$LOG_FILE"
    fi
}

abort() {
    log "$1"
    exit 1
}

cd /home/snublejuice/Documents/snublejuice || abort "Failed to change directory to project root."

# Load environment variables from .env
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# 1. Backing up database
log "Backing up database"
/home/snublejuice/.local/bin/uv sync || abort "Unable to sync python environment."
/home/snublejuice/.local/bin/uv run ./backups/operations.py backup 2>&1 | while IFS= read -r line; do log "$line" 0; done || abort "Something went wrong!"

log "Backup saved."
