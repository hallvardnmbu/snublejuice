#!/bin/bash

LOG_FILE="/home/snublejuice/Documents/snublejuice/logs/ratings_$(date +'%Y-%m-%d').log"

log() {
    local level="$1"
    local message="$2"
    echo "$(date +'%Y-%m-%d %H:%M:%S') [$level] $message" | tee -a "$LOG_FILE"
}

abort() {
    log "ERROR" "$1"
    exit 1
}

source ~/.profile
cd /home/snublejuice/Documents/snublejuice || abort "Failed to change directory to project root."

# Load environment variables from .env
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

log "INFO" "Starting script."

# Include Bun
export PATH=$PATH:/home/snublejuice/.bun/bin

# 1. Connect to NordVPN and ensure connection is established
log "INFO" "Connecting to NordVPN..."
nordvpn connect || abort "Failed to connect to VPN."
sleep 5
if ! nordvpn status | grep -i "connected"; then
    abort "Failed to establish VPN connection."
fi

# 2. Run the script
log "INFO" "Running fetch/vivino/rating.mjs..."
bun run ./fetch/vivino/rating.mjs || abort "Failed to run fetch/vivino/rating.mjs."

# 3. Disconnect from NordVPN
log "INFO" "Disconnecting from NordVPN..."
nordvpn disconnect || abort "Failed to disconnect from VPN."

log "INFO" "Script completed successfully."
