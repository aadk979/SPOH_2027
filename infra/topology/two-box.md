# Two boxes — `2 × medium_3_0`

The target topology for the event, and for any load test above roughly 100
concurrent users. **$48/month.** Not built yet; this is the design, and
`runbooks/scale-up.md` is the migration.

```
                    duckdns  secure-channel.duckdns.org
                        │
                        ▼
        ┌───────────────────────────┐
        │  spoh-app  medium_3_0     │  2 vCPU · 4 GB · 80 GB
   :443 ┤  nginx → :4010 / :3000    │  $24/mo   ← static IP lives here
        │  PM2 cluster, 2 workers   │
        └─────────────┬─────────────┘
                      │  private VPC network, 172.26.x.x
                      │  Postgres/TLS, :5432
        ┌─────────────▼─────────────┐
        │  spoh-db   medium_3_0     │  2 vCPU · 4 GB · 80 GB
        │  docker: postgres:17      │  $24/mo   ← no public IP exposure
        │  daily snapshot enabled   │
        └───────────────────────────┘
```

## Why two mediums rather than one large

`large_3_0` costs $44 and `2 × medium_3_0` costs $48 — four dollars apart, and
the answer is not close:

|                 | `large_3_0` ($44)    | `2 × medium_3_0` ($48) |
| --------------- | -------------------- | ---------------------- |
| vCPU            | 2                    | **4** (2 per box)      |
| RAM             | 8 GB, shared         | 4 + 4 GB, isolated     |
| Failure domain  | one                  | two                    |
| A runaway query | OOMs the web tier    | kills one box          |
| Restore target  | none — it is the box | the app box survives   |

**Lightsail bundles from `nano` to `large` are all 2 vCPU.** Spending up to
`large` buys RAM and nothing else. The next real CPU step is `xlarge` at $84 —
still one failure domain, and $36 more than the split. Two mediums is the
better buy on every axis that matters here.

## What changes when you split

**`DATABASE_URL` stops being loopback.** It points at the database box's private
IP. The TLS that `single-box.md` already runs stops being ceremony and starts
being the thing protecting the hop.

```
DATABASE_URL=postgresql://spoh_app:<pw>@172.26.x.x:5432/spoh2027?sslmode=require&uselibpqcompat=true
```

**The database box must not be reachable from the internet.** Its Lightsail
firewall allows `5432` from the app box's private address only, and `22` from
nothing — administration goes through the app box. Lightsail instances in the
same region share a private network, so this needs no VPC peering.

**`DATABASE_POOL_MAX` becomes meaningful.** On one box the pool competed with
Postgres for the same memory. Split, the ceiling is _instance count × pool size_
against the database's `max_connections`. With 2 app workers and a pool of 25
that is 50 connections; Postgres defaults to 100, so there is room, but the two
numbers now have to be chosen together rather than independently.

**Snapshots become useful.** A Lightsail snapshot of the database box is a
consistent point-in-time copy of the disk. Enable automatic daily snapshots on
`spoh-db`; they cost about $0.05/GB-month and they are the recovery path that
`single-box.md` does not have.

## Sizing this against 500 concurrent

Two mediums is the _entry_ configuration for the event, not a guarantee. The
honest position is that nobody knows the ceiling until it is measured, and the
harness for measuring it is already in the repo:

```sh
node server/scripts/load-test.mjs --clients 500 --taps 20 --duration 300
```

Run it against the app box, never against anything serving real users. Before
concluding the instances are too small, confirm all three of these, because each
is free and each moves more than a bundle upgrade:

1. PM2 is in **cluster** mode (`pm2 list` shows `cluster`, not `fork`).
2. `dashboardPollSeconds` is **10**, not 3. At 500 users a 3-second poll is
   ~167 req/s of pure polling. It is a runtime setting; no deploy needed.
3. `DATABASE_POOL_MAX` is **25**, not the 10 the old box ran.

If the load test still misses its p95 budget after those three, the next step is
`xlarge_3_0` for the app box ($84, 4 vCPU) while the database stays at medium —
the app tier saturates first, because Postgres on this workload is doing short
indexed reads and the app tier is doing TLS, JSON and SSR.

## What this still does not give you

Two boxes is not high availability. There is one app host; if it dies, the site
is down until a snapshot is restored. Real HA means a Lightsail load balancer
($18/mo) in front of two app hosts, and a database with a standby — roughly
$110/month all in. That is the right conversation for an event that cannot
tolerate thirty minutes of downtime, and the wrong one for this year.
