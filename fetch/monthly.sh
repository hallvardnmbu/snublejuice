#!/bin/bash

LOG_FILE="/home/snublejuice/Documents/logs/monthly-$(date +'%Y-%m-%d').log"

log() {
    local message="$1"
    echo "$(date +'%Y-%m-%d %H:%M:%S') [?] $message" | tee -a "$LOG_FILE"
}

abort() {
    log "$1"
    nordvpn disconnect
    exit 1
}

source ~/.profile
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
bun run ./fetch/vinmonopolet/price.mjs || abort "Failed to run fetch/vinmonopolet/price.mjs"
bun run ./fetch/taxfree/price.mjs || abort "Failed to run fetch/taxfree/price.mjs"

# 3. Update stock
log "Updating stock"
bun run ./fetch/vinmonopolet/detailed.mjs || abort "Failed to run fetch/vinmonopolet/detailed.mjs."
bun run ./fetch/vinmonopolet/popular.mjs || abort "Failed to run fetch/vinmonopolet/popular.mjs."
bun run ./fetch/taxfree/stock.mjs || abort "Failed to run fetch/taxfree/stock.mjs."

# 4. Send mails to subscribers
log "Mailing subscribers"
bun run ./fetch/email.mjs || abort "Failed to run fetch/email.mjs"

# 3. Disconnect from NordVPN
log "Disconnecting from internet"
nordvpn disconnect || abort "Failed to disconnect from VPN."

log "Script completed successfully."
