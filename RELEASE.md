# Setup

# Compile and transfer

```bash
# Turn off app.
# snuble -> sudo systemctl stop snublejuice

cargo build --release --target x86_64-unknown-linux-musl
# alias deploy="scp target/x86_64-unknown-linux-musl/release/server {USERNAME}@{IP}:/home/snuble/snublejuice"
deploy

# Turn on new app.
# snuble -> sudo systemctl start snublejuice
```
# Refresh the app

```bash
sudo systemctl daemon-reload
sudo systemctl restart snublejuice
```

```bash
sudo systemctl status snublejuice
```

# First time

## 1.

```bash
sudo apt update
sudo apt install nginx
```

## 2.

```bash
sudo vim /etc/nginx/sites-available/snublejuice
```

```raw
# snublejuice.no
server {
	listen 80;
	server_name snublejuice.no;

	location / {
		proxy_pass http://localhost:3000;
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
		proxy_pass http://localhost:3000;
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
		proxy_pass http://localhost:3000;
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
		proxy_pass http://localhost:3000;
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
sudo mkdir -p /var/www/html/.well-known/acme-challenge
sudo chown -R www-data:www-data /var/www/html
```

## 5.

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
Description=snublejuice
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/home/snuble

Environment=ENVIRONMENT=production
Environment=COOKIE_DOMAIN=.snublejuice.no
Environment=PORT=3000

Environment=MONGODB=...
Environment=IMAGE_DIR=...

ExecStart=/home/snuble/snublejuice
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

## 6.

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d snublejuice.no
sudo certbot --nginx -d www.snublejuice.no
sudo certbot --nginx -d vinmonopolet.snublejuice.no
sudo certbot --nginx -d taxfree.snublejuice.no
sudo systemctl reload nginx
```
