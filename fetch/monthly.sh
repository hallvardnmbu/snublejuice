#!/bin/bash

LOG_FILE="/home/snublejuice/Documents/logs/monthly-$(date +'%Y-%m-%d_%H-%M-%S').log"

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

# Include bun executable
export PATH=$PATH:/home/snublejuice/.bun/bin

# 1. Connect to internet and ensure connection is established
log "Connecting to internet"
nordvpn connect || abort "Failed to connect to VPN."
sleep 5
if ! nordvpn status | grep -i "connected"; then
    abort "Failed to establish VPN connection."
fi

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
