# Single box — `small_3_0`

What runs today. One Lightsail instance carrying every tier.

```
                    duckdns  spoh2027.duckdns.org
                        │
                        ▼
              ┌───────────────────────┐
              │  Lightsail small_3_0  │  2 vCPU · 2 GB · 60 GB · 3 TB xfer
              │  ap-southeast-1       │  $12/mo
              │                       │
   :443 ──────┤  nginx                │  TLS terminates here (Let's Encrypt)
              │    ├── /api/  :4010 ──┼─▶ spoh-server   (PM2, cluster, 2 workers)
              │    ├── /healthz ──────┼─▶ same
              │    └── /      :3000 ──┼─▶ spoh-client   (PM2, Next.js standalone)
              │                       │
              │  docker: postgres:17  │  127.0.0.1:5432, TLS on, named volume
              └───────────────────────┘
```

## Why each piece is the way it is

**nginx terminates TLS and proxies two upstreams.** The client and the API are
separate processes on separate ports sharing one origin, which is what lets
`SESSION_COOKIE_CROSS_SITE=false` stay false — a same-origin refresh cookie is
`SameSite=Lax` and never travels cross-site. Splitting them onto two hostnames
would force `SameSite=None` and a wider CORS surface for no gain.

**`TRUST_PROXY_HOPS=1`.** There is exactly one proxy in front of the app. Get
this wrong and every request appears to come from `127.0.0.1`, which collapses
per-IP rate limiting into a single shared bucket — all 80 volunteers throttled
as one caller. It is the least visible way this deployment can break.

**Postgres binds to `127.0.0.1` only, and still runs TLS.** The loopback bind is
what keeps it off the internet; the TLS is because `config/env.ts` refuses to
start in production without `sslmode=require` in the connection string, and that
guard should not be weakened just because the hop is short today. When the
database moves to its own box (`two-box.md`) the connection stops being
loopback and the TLS is already there.

**PM2 in cluster mode.** `instances: 'max'` gives one API worker per core. The
previous deployment ran `fork` — a single process on a single core — which
would have made every instance upgrade a no-op.

**A 2 GB box needs swap.** Postgres, Node, Next.js and Docker on 2 GB will
touch the ceiling during a build. `bootstrap.sh` creates a 2 GB swapfile so that
a spike degrades rather than triggering the OOM killer, which on this layout
means Postgres dies and takes the event's data path with it.

## Resource budget

Measured at idle on the previous 1 GB box, extrapolated to 2 GB:

| Process                                      | Idle RSS | Under load  |
| -------------------------------------------- | -------- | ----------- |
| `spoh-server` (per worker)                   | ~95 MB   | ~150 MB     |
| `spoh-client` (Next.js)                      | ~72 MB   | ~250 MB     |
| Postgres (`shared_buffers` + per-connection) | ~80 MB   | ~400 MB     |
| dockerd + PM2 + nginx + OS                   | ~180 MB  | ~250 MB     |
| **Total**                                    | ~500 MB  | **~1.3 GB** |

That leaves headroom on 2 GB for a single tester and none at all for 500
concurrent users. The previous 1 GB box was **already 361 MB into swap with zero
users connected**, which is why `micro_3_0` was not the right rebuild target
even though it matches the old instance's specs.

## What this topology cannot do

- **Survive a runaway query.** Postgres and the web tier share a memory cgroup
  in practice; an OOM takes both.
- **Serve the event.** Two cores shared between Postgres and the app tier is the
  wall, and it arrives well before 500 concurrent users.
- **Restore quickly.** The database and its host die together. Backups are the
  only recovery, which makes `runbooks/restore.md` and a _tested_ dump the
  difference between an incident and a disaster.

All three are addressed by `two-box.md`. None of them matter for a single-person
test environment, which is what this is.
