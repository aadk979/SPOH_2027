# P08.5 DuckDNS HTTPS entry: price for owner approval

Priced 2026-10-01 for AWS Asia Pacific (Singapore), before tax and credits. This is a proposal, not authorisation to create the resource.

## Recommended entry

Run Caddy on one Lightsail Linux Micro instance with public IPv4 (1 GiB RAM, 2 vCPU, 40 GiB disk, 2 TB monthly transfer). Attach a Lightsail static IPv4 address, point the DuckDNS A record at it, and proxy HTTPS requests to the existing API Gateway HTTPS origin. Keep the DuckDNS token in Secrets Manager. A Caddy build with the [DuckDNS DNS provider](https://github.com/caddy-dns/duckdns) can use DNS-01 for automated Let's Encrypt certificates and renewal; [DuckDNS supports TXT updates](https://www.duckdns.org/spec.jsp), and [Caddy documents the DNS challenge](https://caddyserver.com/docs/automatic-https#dns-challenge). Stage and production hostnames can share the proxy and static IP with separate upstreams; stage remains isolated at the API and database.

The public API has one additional single-instance hop. Monitor certificate expiry, Caddy health and upstream errors; keep the API Gateway origin private to the client only after the edge is proven. This entry does not solve cross-site sessions: P12 must remove reliance on a third-party refresh cookie between `*.web.app` and `*.duckdns.org`.

## Added monthly cost

| Item                                              | USD/month | Basis                                                                                                                                                                                  |
| ------------------------------------------------- | --------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lightsail Linux Micro with public IPv4, Singapore |  **7.00** | `aws lightsail get-bundles --region ap-southeast-1` returned `micro_3_0`, 1 GiB, US$7. [AWS pricing](https://aws.amazon.com/lightsail/pricing/).                                       |
| Attached static IPv4                              |      0.00 | [AWS says attached Lightsail static IPs have no additional charge](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-static-ip-addresses-in-amazon-lightsail.html). |
| Let's Encrypt certificate and Caddy               |      0.00 | No AWS certificate service or paid software.                                                                                                                                           |
| **Predictable addition**                          |  **7.00** | One instance for stage and production names.                                                                                                                                           |

The 2 TB bundle transfer includes traffic in and out; excess outbound transfer in Singapore is [US$0.12/GB](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-data-transfer-allowance.html). Unattached static IPs cost US$0.005/hour after the first hour, so the deployment must attach it immediately and release it on teardown. AWS API Gateway requests and data transfer charges in the existing plan still apply. The reverse proxy will consume some of the transfer allowance; measure it in P08.10.

Against the earlier [P05 lean cost model](../P05/pricing/cost.md), conservatively adding the full US$7 without credit for removing Route 53/SES gives about US$43.46 in October, US$84.38 in November, US$63.39 in December and US$103.99 in January. January is within the owner's approximately US$130 exception; other months remain within US$100. These are modelled amounts, not an AWS bill.

The US$5 Nano bundle is also available in Singapore, but its 0.5 GiB RAM leaves less headroom for Caddy, certificate management and logs. An NLB with an Elastic IP adds hourly load-balancer, capacity-unit and public IPv4 charges, so it is not the cost-controlled recommendation; [AWS lists those charges separately](https://aws.amazon.com/elasticloadbalancing/pricing/).

**Owner decision:** approved on 2026-10-01: the added US$7/month Lightsail Micro cost, with 2 TB included and US$0.12/GB excess outbound transfer. This approval covers the proxy cost; production stack creation still waits for the 28 October go decision. No Lightsail proxy or production resource is created by this report.
