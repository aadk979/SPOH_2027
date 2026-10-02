# P08.5 staging proxy

The owner authorised the new Singapore Lightsail Micro proxy at US$7/month on 2026-10-01,
and on 2026-10-02 said they will route DNS after receiving its public IP and to proceed.
The separately deployed `Spoh-staging-Edge` stack creates `spoh-staging-edge` from Ubuntu
24.04 and immediately attaches `spoh-staging-edge-ip`. It has no references to the existing
live `spoh-app` or `spoh-static-ip`, and creates no production resources.

Both named staging hosts proxy over verified HTTPS to the existing staging HTTP API.
The API host permits API and health paths; other paths return 404. The client host serves
the existing static export and refuses `/readyz`. Sign-in origin/callback separation and
the production Firebase setup remain subsequent P08.5/P12 work. This proxy alone does not
claim end-to-end sign-in completion.

The owner's DNS routing replaces the earlier DNS-01 plan for staging: Caddy can validate
the two explicit names over HTTP/TLS-ALPN and automatically renew without a DNS credential.
Ports 80/443 are public IPv4; SSH accepts only the operator's current IPv4 /32 and IPv6 is
explicitly closed. A plain HTTP `/healthz` proves bootstrap before DNS/HTTPS are available.
Certificate storage persists under `/var/lib/caddy`; Caddy runs as its own unprivileged user
through systemd. Logs stay in journald; no application cookies/credentials are logged by an
access logger. Public certificates remain unavailable until the owner points DNS to the IP.

Caddy 2.11.6 is pinned to the official release and its published SHA512 checksum before
installation. The rendered Caddyfile passes that release's native validator, and rendered
bootstrap passes `bash -n`. Caddy 2.11 already sends the upstream HTTPS host correctly, so
the redundant explicit Host rewrite was removed after its validator warning. Official
[automatic HTTPS](https://caddyserver.com/docs/automatic-https#http-challenge) and
[systemd service documentation](https://caddyserver.com/docs/running#linux-service) describe
the certificate/renewal and service behaviour.

Verification before provisioning: **24 infrastructure tests**, infra typecheck, root lint,
and formatting pass. Explicit edge synthesis runs the nag pack. The read-only edge diff
contains only two new Lightsail resources and deploy-time upstream/operator parameters.
The bundle inventory confirms `micro_3_0`, US$7, 1 GiB RAM and 2 TB monthly transfer in
Singapore. The static address is attached as part of stack creation to avoid idle-IP charges.
P08.5 remains open for DNS, HTTPS, renewal, CORS, full sign-in and iOS Safari verification.
