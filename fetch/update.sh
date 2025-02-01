#!/bin/bash

cd /home/snublejuice/Documents/snublejuice

# 1. Git pull
echo "Pulling latest changes..."
git reset --hard HEAD
git pull

# 2. Make the scripts executable
echo "Making scripts executable..."
chmod +x ./fetch/monthly.sh
chmod +x ./fetch/stock.sh
chmod +x ./fetch/update.sh

echo "Repository updated"
