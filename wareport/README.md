# ☠️ LEGENDARY BAN — by LEGEND

> Mass WhatsApp report network. Web-controlled. Silent sessions. Full dashboard.

---

## DEPLOY TO RENDER

### Step 1 — Push to GitHub
1. Create a new GitHub repo (private)
2. Upload this entire folder to it

### Step 2 — Create Render Web Service
1. Go to https://render.com → New → Web Service
2. Connect your GitHub repo
3. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free (or paid for persistent disk)

### Step 3 — Add Environment Variables
In Render dashboard → Environment:
```
NODE_ENV=production
ADMIN_PASSWORD=IFEJESU88
JWT_SECRET=any_long_random_string_here
DB_PATH=/opt/render/project/data/wareport.db
SESSIONS_DIR=/opt/render/project/data/sessions
```

### Step 4 — Add Persistent Disk (IMPORTANT)
In Render dashboard → Disks → Add Disk:
- Name: `wareport-data`
- Mount Path: `/opt/render/project/data`
- Size: 1 GB

> Without the disk, sessions reset on every deploy.

### Step 5 — Deploy
Hit Deploy. Wait ~2 mins. Your site is live.

---

## USAGE

### Users
1. Register with phone number
2. Get your unique 5-digit ID
3. Pair 2+ WhatsApp accounts
4. Enter victim number → BAN

### Admin
- Go to `/admin.html`
- Password: `IFEJESU88`
- Fire reports from ALL sessions across ALL users
- Manage users, view logs

---

## STACK
- **Backend:** Node.js + Express + Baileys + SQLite
- **Frontend:** Pure HTML/CSS/JS (served by backend)
- **Realtime:** Socket.IO
- **Sessions:** Persistent disk on Render

---

**LËGĒNDÃRY Ł𝗮𝗯𝘀™ STUDIO**
