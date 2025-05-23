#!/bin/bash

LOG_FILE="/home/snublejuice/Documents/logs/restore-$(date +'%Y-%m-%d_%H-%M-%S').log"

log() {
    local message="$1"
    local level="${2:-1}"

    if [ "$level" = "0" ]; then
        echo "$(date +'%Y-%m-%d %H:%M:%S')   $message" | tee -a "$LOG_FILE"
    else
        echo "$(date +'%Y-%m-%d %H:%M:%S') ? $message" | tee -a "$LOG_FILE"
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

/home/snublejuice/.local/bin/uv sync || abort "Unable to sync python environment."

# 1. Restoring database
log "Restoring database"
if [ -n "$1" ]; then
    if [[ ! "$1" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
        echo "Error: Invalid date format for --date. Expected YYYY-MM-DD, got '$1'." >&2
        exit 1
    fi

    log "Running backup with input."
    # /home/snublejuice/.local/bin/uv run backups/operations.py restore --date "$1" 2>&1 | while IFS= read -r line; do log "$line" 0; done || abort "Something went wrong!"
else
    log "Running backup without input."
    # /home/snublejuice/.local/bin/uv run backups/operations.py restore 2>&1 | while IFS= read -r line; do log "$line" 0; done || abort "Something went wrong!"
fi

log "Backup saved."
