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

# 2. Run the scripts
echo "Running scripts..."
bun run ./fetch/vinmonopolet/price.mjs || {
    echo "Failed to run fetch/vinmonopolet/price.mjs";
    nordvpn disconnect;
    exit 1
}
bun run ./fetch/taxfree/price.mjs || {
    echo "Failed to run fetch/taxfree/price.mjs";
    nordvpn disconnect
    exit 1
}
bun run ./fetch/email.mjs || {
    echo "Failed to run fetch/email.mjs";
    nordvpn disconnect
    exit 1
}

# 3. Disconnect from NordVPN
echo "Disconnecting from NordVPN..."
nordvpn disconnect || {
    echo "Failed to disconnect from VPN";
    exit 1
}

echo "Script completed successfully"
