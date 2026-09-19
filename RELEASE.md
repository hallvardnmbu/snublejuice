# Setup

## Refresh the app

```bash
# Turn off app.
# snuble -> sudo systemctl stop snublejuice

cargo build --release --target x86_64-unknown-linux-musl
# alias deploy="scp target/x86_64-unknown-linux-musl/release/server {USERNAME}@{IP}:/home/snuble/snublejuice"
deploy

# Turn on new app.
# snuble -> sudo systemctl start snublejuice
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart snublejuice
sudo systemctl status snublejuice
```

## First-time setup

### 1. Dependencies

```bash
sudo apt update
sudo apt install nginx python3-certbot-dns-cloudflare python3-certbot-nginx
```

### 2. Certificate (DNS-01 via Cloudflare)

```bash
sudo mkdir -p /etc/letsencrypt/cloudflare
sudo vim /etc/letsencrypt/cloudflare/credentials.ini
```

```ini
dns_cloudflare_api_token = your_scoped_token
```

```bash
sudo chmod 600 /etc/letsencrypt/cloudflare/credentials.ini

sudo cp /usr/lib/python3/dist-packages/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
  /etc/letsencrypt/options-ssl-nginx.conf
sudo openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048

sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare/credentials.ini \
  --dns-cloudflare-propagation-seconds 30 \
  --cert-name snublejuice \
  -d snublejuice.no -d "*.snublejuice.no" \
  -d snublejus.no -d "*.snublejus.no" \
  --deploy-hook "systemctl reload nginx"
```

### 3. nginx

```bash
sudo vim /etc/nginx/sites-available/snublejuice
```

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name snublejuice.no *.snublejuice.no snublejus.no *.snublejus.no;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name snublejuice.no *.snublejuice.no snublejus.no *.snublejus.no;

    ssl_certificate /etc/letsencrypt/live/snublejuice/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/snublejuice/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

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

```bash
sudo ln -s /etc/nginx/sites-available/snublejuice /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. systemd service

```bash
sudo vim /etc/systemd/system/snublejuice.service
```

```ini
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

### 5. Verify renewal works

```bash
sudo certbot renew --dry-run
```
