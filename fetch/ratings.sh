#!/bin/bash

source ~/.profile
cd /home/snublejuice/Documents/snublejuice

# Load environment variables from .env
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Echo current timestamp
echo "Starting script at $(date)"

# Include Bun
export PATH=$PATH:/home/snublejuice/.bun/bin

# 1. Connect to NordVPN and ensure connection is established
echo "Connecting to NordVPN..."
nordvpn connect || {
    echo "Failed to connect to VPN";
    exit 1
}
sleep 10
if ! nordvpn status | grep -i "connected"; then
    echo "Failed to connect to VPN";
    exit 1
fi

# 2. Run the script
echo "Running script..."
bun run ./fetch/vivino/rating.mjs || {
    echo "Failed to run fetch/vivino/rating.mjs";
    nordvpn disconnect;
    exit 1
}

# 3. Disconnect from NordVPN
echo "Disconnecting from NordVPN..."
nordvpn disconnect || {
    echo "Failed to disconnect from VPN";
    exit 1
}

echo "Script completed successfully"
