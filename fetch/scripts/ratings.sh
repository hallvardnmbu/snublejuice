#!/bin/bash

# docker exec playground-javascript bash /home/snublejuice/fetch/scripts/ratings.sh

LOG_FILE="$HOME/snublejuice/logs/ratings-$(date +'%Y-%m-%d_%H-%M-%S').log"

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

cd "$HOME/snublejuice" || abort "Failed to change directory to project root."

# Load environment variables from .env
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# 1. Run the script
log "Updating ratings"
bun run ./fetch/vivino/rating.mjs 2>&1 | while IFS= read -r line; do log "$line" 0; done || abort "Failed to update ratings"

log "Script completed successfully."
