# Slinky — Random Video Chat

A real-time peer-to-peer video chat app. Users are randomly matched with strangers using WebSockets for signaling and WebRTC for direct video.

## How it works

1. User opens the site and clicks "Match with a Stranger"
2. Their browser connects to the WebSocket server and joins a waiting queue
3. When two users are queued, the server pairs them and tells one to be the "offerer"
4. The offerer creates a WebRTC offer; they exchange ICE candidates via the server
5. Direct peer-to-peer video is established — the server is no longer in the video path

## Deploy to Railway (free, ~5 minutes)

### Step 1 — Push to GitHub

```bash
cd slinky
git init
git add .
git commit -m "Initial commit"
```

Create a new repo at https://github.com/new (keep it public or private, either works).

```bash
git remote add origin https://github.com/YOUR_USERNAME/slinky.git
git branch -M main
git push -u origin main
```

### Step 2 — Deploy on Railway

1. Go to https://railway.app and sign up (free)
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `slinky` repo
4. Railway auto-detects Node.js and deploys. Done.
5. Click **Settings** → **Networking** → **Generate Domain** to get your public URL

### Step 3 — Open two browser tabs to your URL and test

Both tabs should connect to each other via video automatically.

## Run locally

```bash
npm install
npm start
# Open http://localhost:3000 in two browser tabs
```

## Notes

- Video goes peer-to-peer (WebRTC) — the server only handles the initial handshake
- Uses Google's free STUN servers for NAT traversal
- For production with high traffic, consider adding a TURN server (coturn or Twilio's TURN service) for users behind strict NAT/firewalls
- Railway's free tier sleeps after inactivity — upgrade to Hobby ($5/mo) for always-on
