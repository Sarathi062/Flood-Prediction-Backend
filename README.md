* Migrating backend from Render → AWS Lightsail
* PM2 setup
* Nginx reverse proxy
* SSL for backend subdomain
* Environment variables
* Firewall setup
* Deployment workflow
* Networking concepts you asked about
* How to update backend after new commits
* `.well-known` challenge explanation
* Everything arranged cleanly for GitHub

---

# ✅ **FLOOD PREDICTION BACKEND — README.md**

```markdown
# 🌧️ Flood Prediction Backend (Node.js + Express)

This is the backend service for the **Flood Prediction System**.  
It provides APIs for flood prediction, rainfall data, user management, and secure communication with the React frontend.

The backend is deployed on **AWS Lightsail**, running on **Node.js**, **Express**, **MongoDB**, **PM2**, **Nginx**, and **Let's Encrypt SSL**.

---

## 🚀 Features

- REST API built with **Node.js + Express**
- Flood prediction algorithms (Machine Learning / Rules-based)
- Rainfall, water level & environmental data APIs
- Authentication & token-based access
- Rate limiting, CORS, and security middleware
- Centralized logging & error handling
- Deployed on **AWS Lightsail** with:
  - PM2 process manager  
  - Nginx reverse proxy  
  - SSL for `https://api.floodprediction.in`  
  - Firewall rules & networking setup  
  - Production environment variables  

---

## 📁 Project Structure

```

Flood-Prediction-Backend/
│
├── src/
│   ├── config/        # DB config, cloud config
│   ├── controllers/   # API route logic
│   ├── middleware/    # auth, rate limiter, logger
│   ├── models/        # DB models (MongoDB or SQL)
│   ├── routes/        # All REST API routes
│   └── utils/         # Helpers, error handlers
│
├── .env               # Environment variables
├── ecosystem.config.js # PM2 config
├── package.json
└── README.md

````

---

## ⚙️ Tech Stack

### **Backend**
- Node.js
- Express.js
- MongoDB / Mongoose
- JWT Authentication
- Bcrypt
- Axios
- PM2

### **DevOps**
- AWS Lightsail (Ubuntu)
- Nginx Reverse Proxy
- Let's Encrypt SSL (Certbot)
- PM2 Auto-Restart
- Firewall Rules
- Subdomain API Setup in GoDaddy

---

# 🛠️ Deployment Steps (Today’s Full Work Included)

Below is everything that was done to migrate from Render → AWS Lightsail.

---

## 1️⃣ Create AWS Lightsail Instance
- Ubuntu instance created  
- Static IP attached  
- Firewall ports configured:
  | Port | Use |
  |------|------|
  | 22 | SSH |
  | 80 | HTTP |
  | 443 | HTTPS |
  | Custom | Only if needed |

---

## 2️⃣ Install Node.js, Git, PM2

```bash
sudo apt update
sudo apt install git nodejs npm
sudo npm install -g pm2
````

---

## 3️⃣ Clone Backend Project

```bash
git clone https://github.com/YOUR_REPO/Flood-Prediction-Backend.git
cd Flood-Prediction-Backend
npm install
```

---

## 4️⃣ Set Environment Variables Globally

We added:

```bash
sudo nano /etc/environment
```

Example:

```
MONGO_URI=xxxx
JWT_SECRET=xxxx
PORT=5000
NODE_ENV=production
```

Reload:

```bash
source /etc/environment
```

---

## 5️⃣ Start Backend Using PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

(We fixed the `pm2-ubuntu.service` issues also)

---

## 6️⃣ Configure Nginx Reverse Proxy

```bash
sudo nano /etc/nginx/sites-available/api.floodprediction.in
```

Example config:

```nginx
server {
    server_name api.floodprediction.in;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable:

```bash
sudo ln -s /etc/nginx/sites-available/api.floodprediction.in /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 7️⃣ SSL Certificate Installation (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.floodprediction.in
```

Automatic HTTPS enabled.

---

## 8️⃣ GoDaddy Subdomain Setup for Backend

Added record:

```
Type: A
Name: api
Value: <Your Lightsail Static IP>
TTL: 600
```

---

## 9️⃣ `.well-known/acme-challenge` Explanation

This folder is used by Let's Encrypt to verify ownership of domain.

You saw:

```
Cannot GET /.well-known/acme-challenge/test
```

This is normal unless challenge is active.

---

# 🔁 Updating Backend After New Commit

Every time you push code to GitHub:

```bash
cd Flood-Prediction-Backend
git pull
npm install
pm2 restart all
```

Done 🎯

---

# 🔐 Cookies, HTTPS & Security

You asked “how can I say it's https only & secure?”

We configured:

```js
res.cookie("token", token, {
  httpOnly: true,
  secure: true,   // Ensures HTTPS only
  sameSite: "none"
});
```

This makes the cookie visible only over HTTPS.

---

# 🌐 Networking Concepts (Explained Today)

### **Port**

A communication endpoint.
Example: `5000` for Node.js, `443` for HTTPS.

### **IP Address**

A unique identifier for your server.

### **Domain → DNS → Server**

Domain (api.floodprediction.in)
↓
DNS (GoDaddy A-record)
↓
Lightsail Static IP
↓
Nginx Reverse Proxy
↓
Node.js (Port 5000)

### **Reverse Proxy**

Nginx sits in front of Node.js and:

* Handles SSL
* Forwards requests
* Improves security & speed

---

# 📦 Available Scripts

```bash
npm start        # production
npm run dev      # development (nodemon)
pm2 start        # pm2 process manager
```

---

# 🧪 API Testing

Use:

* Postman
* Thunder Client (VS Code)
* Curl

Example:

```bash
GET https://api.floodprediction.in
```

---

# 🛡️ Production Best Practices

* PM2 auto restart
* HTTPS everywhere
* Rate limiting
* Sanitization
* Global error handler
* Disable x-powered-by headers

---

# 📬 Contact

For issues or improvements, create a GitHub Issue.

---

# ⭐ Contribute

Fork → Create Branch → Commit → PR
Contributions welcome!

---

# 🙌 Acknowledgements

Thanks to **AWS**, **Node.js**, **Express**, **Nginx**, **Certbot**, and **PM2**.
