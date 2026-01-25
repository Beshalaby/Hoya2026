# Deploying TrafiQ to Vultr

This guide will walk you through deploying the TrafiQ application to a Vultr Cloud Compute instance.

## 1. Prerequisites (Vultr)

1.  Log in to your [Vultr Dashboard](https://my.vultr.com/).
2.  Click **Deploy +**.
3.  **Choose Server**: Cloud Compute (Shared CPU).
4.  **CPU & Storage**: AMD High Performance or Intel Regular (Standard is fine).
5.  **Location**: Choose a location near you (e.g., New York, Silicon Valley).
6.  **Server Image**: **Ubuntu 22.04 LTS**.
7.  **Server Size**: 25 GB SSD / 1 vCPU / 1 GB RAM (approx $5-6/mo).
8.  **Add SSH Key**: Upload your public SSH key for easy access.
9.  Click **Deploy Now**.

Wait for the server to provision and note the **IP Address**.

---

## 2. Server Setup

SSH into your new server:
```bash
ssh root@<YOUR_SERVER_IP>
```

Run the following commands to install Node.js, Nginx, and PM2:

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install Nginx
apt install -y nginx

# Install PM2 and Yarn (optional)
npm install -g pm2 yarn

# Allow Nginx through firewall
ufw allow 'Nginx Full'
```

---

## 3. Deployment

### Option A: Clone from Git (Recommended)
If your code is on GitHub/GitLab:
```bash
git clone <YOUR_REPO_URL> /var/www/traffiq
cd /var/www/traffiq
npm install
npm run build
```

### Option B: Upload via SCP (Manual)
From your *local* machine:
```bash
# Upload all files (excluding node_modules)
rsync -av --exclude 'node_modules' --exclude '.git' ./ root@<YOUR_SERVER_IP>:/var/www/traffiq
```
Then on the server:
```bash
cd /var/www/traffiq
npm install
npm run build
```

---

## 4. Process Management (PM2)

Start the production server:

```bash
pm2 start npm --name "traffiq" -- start
pm2 save
pm2 startup
```

This ensures the app runs on port `3001` and restarts automatically if the server reboots.

---

## 5. Nginx Configuration

Configure Nginx to act as a reverse proxy (Forwarding HTTP -> Node.js):

1.  Create config file:
    ```bash
    nano /etc/nginx/sites-available/traffiq
    ```

2.  Paste the following (Replace `YOUR_DOMAIN_OR_IP`):
    ```nginx
    server {
        listen 80;
        server_name YOUR_DOMAIN_OR_IP;

        location / {
            proxy_pass http://localhost:3001;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```

3.  Enable the site:
    ```bash
    ln -s /etc/nginx/sites-available/traffiq /etc/nginx/sites-enabled/
    rm /etc/nginx/sites-enabled/default
    nginx -t
    systemctl restart nginx
    ```

---

## 6. SSL / HTTPS (Mandatory for Camera/AI)

You **must** use HTTPS for the camera and AI features to work in Chrome/Safari.

1.  Point your domain (A Record) to the Server IP.
2.  Install Certbot:
    ```bash
    apt install -y certbot python3-certbot-nginx
    ```
3.  Request Certificate:
    ```bash
    certbot --nginx -d yourdomain.com
    ```

Your app is now live at `https://yourdomain.com`! 🚀
