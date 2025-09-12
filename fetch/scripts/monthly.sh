#!/bin/bash

# docker exec playground-javascript bash /home/snublejuice/fetch/scripts/monthly.sh

LOG_FILE="$HOME/snublejuice/logs/monthly-$(date +'%Y-%m-%d_%H-%M-%S').log"

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

log "Installing dependencies"
bun install
bun update

# Load environment variables from .env
if [ -f .env ]; then
    log "Loading environment"
    export $(grep -v '^#' .env | xargs)
fi

# 1. Backup
log "Creating a backup before beginning"
bun run ./backups/backup.mjs 2>&1 | while IFS= read -r line; do log "$line" 0; done || abort "Failed to run backups/backup.mjs"

# 2. Update prices
log "Updating prices"
bun run ./fetch/vinmonopolet/price.mjs 2>&1 | while IFS= read -r line; do log "$line" 0; done || abort "Failed to run fetch/vinmonopolet/price.mjs"
bun run ./fetch/taxfree/price.mjs 2>&1 | while IFS= read -r line; do log "$line" 0; done || abort "Failed to run fetch/taxfree/price.mjs"

# 3. Update stock
log "Updating stock"
bun run ./fetch/vinmonopolet/detailed.mjs 2>&1 | while IFS= read -r line; do log "$line" 0; done || abort "Failed to run fetch/vinmonopolet/detailed.mjs."
bun run ./fetch/vinmonopolet/popular.mjs 2>&1 | while IFS= read -r line; do log "$line" 0; done || abort "Failed to run fetch/vinmonopolet/popular.mjs."
bun run ./fetch/taxfree/stock.mjs 2>&1 | while IFS= read -r line; do log "$line" 0; done || abort "Failed to run fetch/taxfree/stock.mjs."

# 4. Send mails to subscribers
log "Mailing subscribers"
bun run ./fetch/email.mjs 2>&1 | while IFS= read -r line; do log "$line" 0; done || abort "Failed to run fetch/email.mjs"

log "Script completed successfully."
