# Vercel "Failed to verify your browser" (Code 11)

This is **not** from the pump app. It is **Vercel Security Checkpoint** blocking your browser before the React app loads.

## Fix (project owner — you)

1. Open [Vercel Dashboard](https://vercel.com/dashboard) → your **frontend** project.
2. **Firewall** → **Bot Management**.
3. **Disable Attack Mode** (turn it off unless you are under a real DDoS attack).
4. If it still happens: Firewall menu (⋯) → **Pause System Mitigations** (24h, Pro/Enterprise).
5. Wait ~5 minutes, hard refresh (Cmd+Shift+R).

Also check:

- **Cloudflare in front of Vercel** — remove it or pause CF security; all traffic from one CF IP can trigger Vercel blocks.
- **VPN / privacy browser / ad blockers** — try normal Chrome/Safari without extensions, or phone on cellular.

## Use the app while Vercel is blocked

Run the UI locally; API already points at Fly in `.env`:

```bash
# .env (repo root)
VITE_API_URL=https://pump-funautotrader.fly.dev/api
VITE_WS_URL=https://pump-funautotrader.fly.dev

npm run dev
```

Open http://localhost:5173 — feed and charts use Fly directly (no Vercel checkpoint).

## Verify backend is fine

In any browser:

https://pump-funautotrader.fly.dev/api/pumpportal/status

You should see JSON with `"connected": true` and `feedTokens` > 0.
