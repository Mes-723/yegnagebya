# YegnaGebiya Backend - Database Setup Guide

## Problem
The database connection was failing with: `getaddrinfo ENOTFOUND postgres.railway.internal`

This error occurs because `postgres.railway.internal` is Railway's internal hostname and only works when deployed on Railway's infrastructure.

---

## Solution: Two Options for Local Development

### Option 1: PostgreSQL Local Installation (Recommended for Development)

**Step 1: Install PostgreSQL**
1. Download from: https://www.postgresql.org/download/windows/
2. Run the installer
3. Remember the password you set for the `postgres` user

**Step 2: Create the Database**
```powershell
# Open PowerShell as Administrator
createdb -U postgres railway

# Verify it was created
psql -U postgres -l
```

**Step 3: Update .env**
```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/railway
```

**Step 4: Initialize the Schema**
```powershell
cd yegnagebyam-backend
npm install
npm run db:setup
```

**Step 5: Start the Server**
```powershell
npm start
# OR for development with auto-reload:
npm run dev
```

---

### Option 2: Connect to Railway Database Locally (Requires Public Endpoint)

**Step 1: Enable Public Endpoint on Railway**
1. Go to Railway: https://railway.com/project/231cdd77-e4dc-4173-88f5-f87bc4fc33bd
2. Click on Postgres service → Settings
3. Enable "Public Network"
4. Note the public host and port

**Step 2: Get the Public Database URL**
- The URL format will be: `postgresql://postgres:<PASSWORD>@<PUBLIC_HOST>:<PORT>/railway`
- Replace `[PUBLIC_HOST]` and `[PORT]` with Railway's public endpoint details

**Step 3: Update .env**
```env
DATABASE_URL=postgresql://postgres:<PASSWORD>@<PUBLIC_HOST>:<PORT>/railway
```

**Step 4: Start the Server**
```powershell
npm start
```

---

## Production Deployment on Railway

When deployed to Railway, the environment variables are automatically managed:

1. **No Changes Needed** - Railway will inject `DATABASE_URL` with the internal URL
2. **The app.js** automatically detects Railway and configures SSL accordingly
3. **Database Connection** uses `postgres.railway.internal` (Railway's internal network)

The file `backend/src/config/database.js` already has this logic:
```javascript
const isRailwayDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes("railway");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isRailwayDb ? { rejectUnauthorized: false } : false, // SSL only for Railway
});
```

---

## Current Status

✅ `.env` file updated for local development with PostgreSQL
✅ `.env.production` created for Railway deployment
✅ `.env.example` created as reference
✅ `database.js` already handles both Railway and local connections

---

## Next Steps

1. **Choose Option 1 or 2 above**
2. **Update `.env` with your database connection**
3. **Run `npm start`**
4. **Test the API:** http://localhost:3000

---

## Troubleshooting

### Error: "connect ECONNREFUSED 127.0.0.1:5432"
- PostgreSQL is not running or not installed
- Solution: Install PostgreSQL (Option 1) or use Railway's database (Option 2)

### Error: "password authentication failed"
- Database password is incorrect
- Solution: Update the password in `.env`

### Error: "FATAL: database 'railway' does not exist"
- Database wasn't created
- Solution: Run `createdb -U postgres railway` (Option 1)

### Error: "Connection timeout"
- Can't reach the database server
- Solution: Check if PostgreSQL is running (Option 1) or public endpoint is enabled (Option 2)

---

## Files Modified
- `backend/.env` - Updated for local development
- `backend/.env.production` - NEW: Created for Railway deployment
- `backend/.env.example` - NEW: Created as template
- `backend/src/config/database.js` - No changes needed (already handles both scenarios)
