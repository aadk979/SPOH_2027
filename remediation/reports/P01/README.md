# P01 raw sweep

Raw output of the P01.1 automated sweep, which `findings/F01-hardcoding.md` classifies (P01.2).

- **Command:** `bash remediation/reports/P01/sweep.sh` from any directory in the repo. The script
  holds every pattern, the scope and the exclusions, and rewrites `raw/` on each run.
- **Scope:** files git tracks under `server/`, `client/`, `packages/`, `ops/` and `scripts/`
  (`server/prisma/seed.ts` and `client/public/` included). `infra/` does not exist on `main`
  (D-05). Excluded: `server/prisma/migrations/` (immutable history; `schema.prisma` is swept) and
  `package-lock.json`.
- **Format:** one `file:line:text` line per hit, sorted. `raw/COUNTS.txt` has the count per file.
- **Commit swept:** `1e81e6f` (`main`, after P00, the post-P00 fixes and the D-02/D-04 record).

| File                   | Pattern                                                               | Hits |
| ---------------------- | --------------------------------------------------------------------- | ---: |
| `01-iso-dates`         | `20\d\d-\d\d-\d\d`                                                    |   40 |
| `02-years`             | `202[6-9]`                                                            |  144 |
| `03-clock-times`       | `\b\d{1,2}:\d{2}\b`                                                   |   66 |
| `04-timezone`          | `Asia/Singapore`, `SGT`, `+08`, `8 * 60`, `AT TIME ZONE`, `timeZone`… |   33 |
| `05-venue-brand`       | `SPOH`, `T19`, `School of Computing`, `Open House`, `\bSP\b`          |   72 |
| `06-course-codes`      | `DAAA`, `DCDF`, `DCS`, `DCITP`                                        |   29 |
| `07-enum-<Enum>` (×15) | each Prisma enum's members as quoted literals or `Enum.MEMBER`        |  436 |
| `08-urls-domains`      | `duckdns`, `@spoh2027`, URLs, emails, AWS regions, ARNs, 12-digit IDs |  144 |
| `09-magic-numbers`     | `\b\d{2,}\b` in `server/src/modules/**`, tests excluded               |  259 |
| **Total**              |                                                                       | 1223 |

The enum sweep excludes the two definitions (`schema.prisma`, `packages/shared/src/enums.ts`).
Generic members (`OTHER`, `LOW`, `OPEN`…) also match unrelated strings; P01.2 marks those as
false positives.
