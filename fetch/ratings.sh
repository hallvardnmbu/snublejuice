#!/bin/bash

LOG_FILE="/home/snublejuice/Documents/logs/ratings-$(date +'%Y-%m-%d_%H-%M-%S').log"

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

# 2. Run the script
log "Updating ratings"
bun run ./fetch/vivino/rating.mjs >> "$LOG_FILE" 2>&1 || abort "Failed to update ratings"

# 3. Disconnect from NordVPN
log "Disconnecting from internet"
nordvpn disconnect || abort "Failed to disconnect from VPN."

log "Script completed successfully."
