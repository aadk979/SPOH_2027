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

Provisioned on 2026-10-02: `Spoh-staging-Edge` completed, with static IPv4 **3.0.69.248**
attached to `spoh-staging-edge`. Its public `/healthz` returns **200**, `staging edge ready`.
SSH inspection verifies Caddy 2.11.6 is active/enabled, running as `caddy`, with
`NoNewPrivileges=yes`, `ProtectSystem=strict`, and writable persistent certificate storage.
The Lightsail firewall matches the declared three IPv4 ports and closed IPv6 rules.

The first cloud-init run failed before installation because Lightsail appends launch data
to its own `/bin/sh` script; an embedded Bash shebang does not select Bash. The renderer now
explicitly invokes Bash through a quoted heredoc. A local `/bin/sh` execution probe confirms
the nested script runs under Bash, and the corrected rendered script was applied through
pinned-host SSH to repair this new staging instance. Its historical cloud-init error is not
represented as a successful initial bootstrap. **24 infra tests**, typecheck, lint, shell
syntax and the runtime shell probe pass. The inspected follow-up CDK diff changes only
launch data in place; AWS documents [UserData updates without interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-lightsail-instance.html).
The follow-up edge deployment completed successfully with the same attached static IP;
the already repaired service remains active. Tracker formatting now invokes Prettier's Node
entrypoint directly, fixing Windows execution of the POSIX `.bin/prettier` shim.

Both public staging names still resolve to `13.251.60.83` at this checkpoint. The owner has
received the new static IP; certificate and HTTPS verification await their DNS routing.
No public TLS check is claimed yet. The existing live instance/static address remain separate.
