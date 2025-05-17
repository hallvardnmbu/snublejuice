#!/bin/bash

LOG_FILE="/home/snublejuice/Documents/logs/update-$(date +'%Y-%m-%d_%H-%M-%S').log"

log() {
    local message="$1"
    echo "$(date +'%Y-%m-%d %H:%M:%S') [?] $message" | tee -a "$LOG_FILE"
}

abort() {
    log "$1"
    exit 1
}

cd /home/snublejuice/Documents/snublejuice || abort "Failed to change directory to project root."

# 1. Version control
log "Updating codebase wrt. remote changes"
git reset --hard HEAD 2>&1 | while IFS= read -r line; do log "$line"; done || abort "Failed to reset git repository."
git pull 2>&1 | while IFS= read -r line; do log "$line"; done || abort "Failed to pull latest changes from git repository."

# 2. Make the scripts executable
log "Making scripts executable"
chmod +x ./fetch/monthly.sh || abort "Failed to make monthly.sh executable."
chmod +x ./fetch/stock.sh || abort "Failed to make stock.sh executable."
chmod +x ./fetch/ratings.sh || abort "Failed to make ratings.sh executable."
chmod +x ./fetch/update.sh || abort "Failed to make update.sh executable."
chmod +x ./fetch/backup.sh || abort "Failed to make backup.sh executable."
chmod +x ./fetch/restore.sh || abort "Failed to make restore.sh executable."

log "Repository updated successfully."
