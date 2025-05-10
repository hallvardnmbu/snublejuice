#!/bin/bash

LOG_FILE="/home/snublejuice/Documents/snublejuice/logs/update_$(date +'%Y-%m-%d').log"

log() {
    local level="$1"
    local message="$2"
    echo "$(date +'%Y-%m-%d %H:%M:%S') [$level] $message" | tee -a "$LOG_FILE"
}

abort() {
    log "ERROR" "$1"
    exit 1
}

cd /home/snublejuice/Documents/snublejuice || abort "Failed to change directory to project root."

# 1. Git pull
log "INFO" "Pulling latest changes..."
git reset --hard HEAD || abort "Failed to reset Git repository."
git pull || abort "Failed to pull latest changes from Git repository."

# 2. Make the scripts executable
log "INFO" "Making scripts executable..."
chmod +x ./fetch/monthly.sh || abort "Failed to make monthly.sh executable."
chmod +x ./fetch/stock.sh || abort "Failed to make stock.sh executable."
chmod +x ./fetch/ratings.sh || abort "Failed to make ratings.sh executable."
chmod +x ./fetch/update.sh || abort "Failed to make update.sh executable."

log "INFO" "Repository updated successfully."
