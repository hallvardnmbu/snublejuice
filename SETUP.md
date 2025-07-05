# Refresh the app

```bash
cd /var/www/snublejuice
git pull

# To fetch the ord and elektron apps, run:
# git submodule update --init --recursive
git submodule update --remote --merge

sudo systemctl daemon-reload
sudo systemctl restart snublejuice
```

```bash
cd /var/www/snublejuice/src/other/elektron
git pull
cargo build --release
sudo systemctl daemon-reload
sudo systemctl restart elektron
```

```bash
sudo systemctl status snublejuice
sudo systemctl status elektron
```

# Set up the app

## 1.

```bash
sudo apt update
sudo apt install nginx
sudo apt install unzip
curl -fsSL https://bun.sh/install | bash
```

## 2.

```bash
sudo mkdir -p /var/www/snublejuice
cd /var/www/snublejuice
sudo git clone https://github.com/hallvardnmbu/snublejuice.git .
sudo git submodule update --init --recursive
sudo chown -R $USER:$USER /var/www/snublejuice
```

## 3.

```bash
sudo vim /etc/nginx/sites-available/snublejuice
```

```raw
# snublejuice.no
server {
	listen 80;
	server_name snublejuice.no;
	
	location / {
		proxy_pass http://localhost:8080;
		proxy_http_version 1.1;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection 'upgrade';
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
		proxy_cache_bypass $http_upgrade;
	}
}

# www.snublejuice.no
server {
	listen 80;
	server_name www.snublejuice.no;
	
	location / {
		proxy_pass http://localhost:8080;
		proxy_http_version 1.1;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection 'upgrade';
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
		proxy_cache_bypass $http_upgrade;
	}
}

# vinmonopolet.snublejuice.no
server {
	listen 80;
	server_name vinmonopolet.snublejuice.no;
	
	location / {
		proxy_pass http://localhost:8080;
		proxy_http_version 1.1;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection 'upgrade';
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
		proxy_cache_bypass $http_upgrade;
	}
}

# taxfree.snublejuice.no
server {
	listen 80;
	server_name taxfree.snublejuice.no;
	
	location / {
		proxy_pass http://localhost:8080;
		proxy_http_version 1.1;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection 'upgrade';
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
		proxy_cache_bypass $http_upgrade;
	}
}

# dagsord.no
server {
	listen 80;
	server_name dagsord.no;
	
	location / {
		proxy_pass http://localhost:8080;
		proxy_http_version 1.1;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection 'upgrade';
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
		proxy_cache_bypass $http_upgrade;
	}
}

# www.dagsord.no
server {
	listen 80;
	server_name www.dagsord.no;
	
	location / {
		proxy_pass http://localhost:8080;
		proxy_http_version 1.1;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection 'upgrade';
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
		proxy_cache_bypass $http_upgrade;
	}
}

# elektron.dagsord.no
server {
	listen 80;
	server_name elektron.dagsord.no;
	
	location / {
		proxy_pass http://localhost:8080;
		proxy_http_version 1.1;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection 'upgrade';
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
		proxy_cache_bypass $http_upgrade;
	}
}
```

## 4.

```bash
sudo ln -s /etc/nginx/sites-available/snublejuice /etc/nginx/sites-enabled/
sudo nginx -t  # Test config
sudo systemctl reload nginx
```

## 5.

```bash
sudo vim /etc/systemd/system/snublejuice.service
```

```raw
[Unit]
Description=Snuble-app
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/snublejuice
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=MONGO_USR=...
Environment=MONGO_PWD=...
Environment=JWT_KEY=...
ExecStart=/root/.bun/bin/bun run server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable snublejuice
sudo systemctl start snublejuice
sudo systemctl status snublejuice
```

## 6. Elektron Setup

For the elektron submodule (Rust app):

```bash
# Navigate to the elektron submodule
cd /var/www/snublejuice/src/other/elektron

# Install Rust if not already installed
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Build the Rust app
cargo build --release

# Create a systemd service for the Rust app
sudo vim /etc/systemd/system/elektron.service
```

```raw
[Unit]
Description=Elektron Rust App
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/snublejuice/src/other/elektron
Environment=RUST_LOG=info
ExecStart=/var/www/snublejuice/src/other/elektron/target/release/elektron
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable elektron
sudo systemctl start elektron
sudo systemctl status elektron
```