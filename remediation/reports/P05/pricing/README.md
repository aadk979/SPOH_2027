# Pricing (P05.9)

The cost evidence for [ADR-008](../../../../docs/adr/ADR-008-aws-topology-cost.md).

**Sources:** the public AWS Price List offer files at
`https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/index.json` and the ap-southeast-1 (or
global) files it links to. No AWS credentials and no Pricing API are used (D-13).

```bash
node remediation/reports/P05/pricing/fetch-prices.mjs   # → prices.json (51 prices, each with its offer file, version, publication date)
node remediation/reports/P05/pricing/cost-model.mjs     # → cost.md (4 topologies × 5 months, the recommended one itemised, options)
```

| File               | What it is                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `fetch-prices.mjs` | fetches the offer files, streams the 350 MB EC2 file as CSV, and extracts each price by usage type |
| `prices.json`      | the prices as fetched: USD, unit, description, usage type, offer, URL, version, publication date   |
| `cost-model.mjs`   | usage assumptions per month (stated in `MONTHS` and `ASSUMPTIONS`) × prices → `cost.md`            |
| `cost.md`          | the tables ADR-008 §6 quotes                                                                       |

Every usage figure is an assumption. P08.10 replaces them with Cost Explorer data after three days
of staging, and reruns both scripts.
