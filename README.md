# Zelth Admin Panel

Internal operations dashboard for Zelth — manage submissions, withdrawals, users, challenges, bulk credits, and notifications.

## Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Create `.env` file:**
```bash
cp .env.example .env
```
Fill in your values:
- `VITE_SUPABASE_URL` — prod Supabase URL
- `VITE_SUPABASE_ANON_KEY` — prod anon key
- `VITE_SERVICE_SECRET` — your SERVICE_SECRET value
- `VITE_ADMIN_PASSWORD` — password for PM to login

3. **Run locally:**
```bash
npm run dev
```

## Deploy to Vercel

1. Push to GitHub
2. Import repo in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

## Pages

| Page | Description |
|---|---|
| Dashboard | Overview stats and recent activity |
| Submissions | Review runs, verify/reject, auto-credit wallet |
| Withdrawals | Approve/reject withdrawal requests |
| Users | View all users and wallet balances |
| Challenges | Create and manage challenges |
| Bulk Credit | Upload CSV to credit multiple users |
| Notify | Send push notifications to users |

## Bulk Credit CSV Format

```csv
user_id,participant_id,challenge_id,amount,reward_type,win_code,note
UUID,UUID,UUID,500,prize,P1,Morning Rush winner
```

Download template from the Bulk Credit page.
# zelth-admin
