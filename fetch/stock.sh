#!/bin/bash

cd /home/snublejuice/Documents/snublejuice

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
bun run ./fetch/vinmonopolet/detailed.mjs || {
    echo "Failed to run fetch/vinmonopolet/detailed.mjs";
    nordvpn disconnect;
    exit 1
}
bun run ./fetch/vinmonopolet/popular.mjs || {
    echo "Failed to run fetch/vinmonopolet/popular.mjs";
    nordvpn disconnect;
    exit 1
}
bun run ./fetch/taxfree/stock.mjs || {
    echo "Failed to run fetch/taxfree/stock.mjs";
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
