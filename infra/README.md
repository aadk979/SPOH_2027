# Infrastructure

How SPOH 2027 is hosted, why it is shaped this way, and what to change when it
stops being enough.

Everything here targets **Amazon Lightsail in `ap-southeast-1`**. Lightsail
rather than EC2 because this is one pet server with a fixed monthly price and a
bundled transfer allowance, which is exactly the shape of the problem — not
because Lightsail is technically different. It is EC2 underneath.

```
infra/
├── README.md                  you are here
├── topology/
│   ├── single-box.md          what runs today
│   └── two-box.md             the app/database split, for when today is not enough
├── lightsail/
│   ├── provision-single.sh    create the instance, static IP and firewall
│   ├── bootstrap.sh           turn a bare Ubuntu box into the app host
│   └── provision-two-box.sh   the later, split version
├── config/
│   ├── nginx-spoh.conf        the reverse proxy
│   ├── ecosystem.config.cjs   PM2, in cluster mode
│   └── docker-compose.db.yml  Postgres 17 with TLS
└── runbooks/
    ├── deploy.md              shipping a new build
    ├── restore.md             getting the database back
    ├── dns-and-tls.md         duckdns and certbot
    └── scale-up.md            single box → two boxes, without downtime
```

## The two topologies

|            | Single box (`small_3_0`)                                            | Split (`2 × medium_3_0`)                                       |
| ---------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| Cost       | **$12/mo**                                                          | **$48/mo**                                                     |
| App host   | 2 vCPU, 2 GB, 60 GB                                                 | 2 vCPU, 4 GB, 80 GB                                            |
| Database   | same box, Docker                                                    | its own box, Docker                                            |
| Good for   | development, single-person testing, a demo                          | the event, or any load test above ~100 concurrent              |
| Fails when | two services compete for 2 GB and a runaway query OOMs the web tier | ~500 concurrent, where 2 vCPU on the app host becomes the wall |

**Today we run the single box.** It is a single-person test environment and
`small_3_0` is the right call for that. `topology/two-box.md` describes the
split and `runbooks/scale-up.md` is the migration; neither is speculative work
to do now, but both exist so the decision is already made when it is needed.

## Three things that are true regardless of topology

**1. The API must run in PM2 cluster mode.** The previous EC2 deployment ran
`fork`, which is one Node process on one core — a bigger instance would have
performed identically. `config/ecosystem.config.cjs` sets `instances: 'max'`.
This is the single highest-leverage line in this directory.

**2. Polling is the dominant load, not captures.** The defaults are a 3-second
dashboard poll and a 10-second alert poll (`dashboardPollSeconds`,
`alertPollSeconds` in the settings table, changeable at runtime with no deploy).
At 500 concurrent users a 3-second dashboard poll is ~167 requests/second before
anybody taps anything. Raise it before buying a larger instance; it is free and
it moves more than the instance size does.

**3. The database and the audit trail must not share a failure domain with
nothing else.** They do on the single box, which is acceptable for a test
environment and is not acceptable for the event. `CLOUDWATCH_AUDIT_LOG_GROUP`
ships the audit trail off-host and is the mitigation until the split happens
(see `docs/AUDIT_LOG.md` and `ops/cloudwatch/README.md`).

## What lives outside this directory, on purpose

- **Cognito** (`ap-southeast-1_9bwl2nGF7`) is **not** rebuilt with the server.
  `Volunteer.cognitoSub` is a foreign key into that pool; deleting it orphans
  every roster row. It survives every teardown here.
- **The S3 backup bucket** (`spoh2027-backups-665146708212`) likewise. It is the
  thing you reach for when this directory has failed you.
- **DNS** is duckdns, updated by hand. There is no API token on any server, so a
  cutover has a manual step in it. `runbooks/dns-and-tls.md` says where.

## Cost, measured

Prices below are from the Lightsail API for `ap-southeast-1`, not from a
pricing page. Re-check with `aws lightsail get-bundles --region ap-southeast-1`.

| Bundle           | vCPU | RAM    | SSD    | Transfer | $/mo   |
| ---------------- | ---- | ------ | ------ | -------- | ------ |
| `nano_3_0`       | 2    | 0.5 GB | 20 GB  | 1 TB     | 5      |
| `micro_3_0`      | 2    | 1 GB   | 40 GB  | 2 TB     | 7      |
| **`small_3_0`**  | 2    | 2 GB   | 60 GB  | 3 TB     | **12** |
| **`medium_3_0`** | 2    | 4 GB   | 80 GB  | 4 TB     | **24** |
| `large_3_0`      | 2    | 8 GB   | 160 GB | 5 TB     | 44     |
| `xlarge_3_0`     | 4    | 16 GB  | 320 GB | 6 TB     | 84     |

Note the shape: **`nano` through `large` are all 2 vCPU.** Paying $44 instead of
$12 buys RAM and nothing else. CPU count only increases at `xlarge`. That is why
the scale-up path here is _two medium boxes_ rather than _one large box_ — $48
buys four cores across two failure domains, where $44 buys two cores in one.

A static IP is free while it is attached to a running instance, and billed while
it is not. Detaching one and leaving it is the classic Lightsail surprise.
