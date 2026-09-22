# DNS and TLS

## The manual step

`spoh2027.duckdns.org` is a free duckdns record, updated through their web
UI. **There is no API token on any server** — the previous box had no updater
cron and no token in any file. So every hostname cutover has a step a human
performs, and it is the step that blocks everything after it.

To make it automatic, get the token from <https://www.duckdns.org> (sign in, it
is on the front page) and put an updater on the box:

```sh
# On the host, as ubuntu. The token is a credential: 600, never in git.
echo 'https://www.duckdns.org/update?domains=spoh2027&token=<TOKEN>&ip=' \
  > ~/.duckdns-url
chmod 600 ~/.duckdns-url

( crontab -l 2>/dev/null; \
  echo '*/5 * * * * curl -fsS -k -o ~/.duckdns.log -K ~/.duckdns-url' \
) | crontab -
```

With `ip=` left empty duckdns uses the source address of the request, so the
record follows the box without anybody having to type an address. On a static
IP that is belt and braces — but it also means a rebuild self-heals.

## Cutting over to a new host

Order matters: the certificate cannot be issued until DNS already points at the
new box, because Let's Encrypt validates over HTTP to that address.

1. **Point the record at the new IP** (web UI, or the updater above).
2. **Wait for propagation.** Do not skip this; a failed ACME challenge counts
   against a rate limit that is measured in hours.
   ```sh
   dig +short spoh2027.duckdns.org @1.1.1.1
   ```
   Repeat until it returns the new address. duckdns TTL is 60s, so this is
   usually quick, but a resolver that cached the old value will still fail.
3. **Check port 80 reaches the new box** — nginx must be running and serving
   the ACME path before certbot is worth trying.
   ```sh
   curl -sI http://spoh2027.duckdns.org/ | head -1
   ```
4. **Issue the certificate.**
   ```sh
   sudo certbot --nginx -d spoh2027.duckdns.org \
     --non-interactive --agree-tos -m <your-email> --redirect
   ```
   `--redirect` adds the port-80 → 443 rule. Certbot edits the nginx site file
   in place; `infra/config/nginx-spoh.conf` is the pre-certbot state, so if you
   ever replace the file you must re-run certbot.
5. **Verify.**
   ```sh
   echo | openssl s_client -connect spoh2027.duckdns.org:443 \
     -servername spoh2027.duckdns.org 2>/dev/null \
     | openssl x509 -noout -subject -dates
   curl -sf https://spoh2027.duckdns.org/readyz
   ```

## Renewal

Certbot's snap installs a systemd timer that renews twice a day when the
certificate is inside 30 days of expiry. Confirm it exists — a renewal that
silently is not scheduled is a site that goes dark 90 days later:

```sh
systemctl list-timers --all | grep certbot
sudo certbot renew --dry-run
```

There is **no alarm** on certificate expiry. The renewal timer is a single
point of failure on a single box. Until something watches it, put the expiry
date in a calendar; `sudo certbot certificates` prints it.

## Why the hostname is load-bearing

Three things are pinned to `spoh2027.duckdns.org` and all three break
together if it changes:

| Where                          | What                                   | Fix                                             |
| ------------------------------ | -------------------------------------- | ----------------------------------------------- |
| Cognito app client             | callback + logout URLs                 | `update-user-pool-client`, see `deploy.md`      |
| `server/.env`                  | `APP_BASE_URL`, `CORS_ALLOWED_ORIGINS` | edit, restart                                   |
| `client/.env.production.local` | `NEXT_PUBLIC_API_BASE_URL`             | edit, **rebuild** — it is inlined at build time |

Changing the IP behind the name breaks none of them. That is the entire
argument for a static IP: it makes a rebuild a DNS edit instead of a
four-system reconfiguration.
