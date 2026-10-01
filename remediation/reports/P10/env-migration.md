# P10.4 operational environment migration

The server loads infrastructure addresses and secrets from its environment. Operational values live in versioned settings and can change without a process restart. The migration is in progress; this note records each removed key as its use is moved.

| Removed key             | Setting                       | Scope    | Default and migration                                                                                                                                       |
| ----------------------- | ----------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ATTENDANCE_ROOT_EMAIL` | `attendance.rootMembershipId` | Event    | `null`. Choose an active admin membership of the event. Production begins with no attendance root; the synthetic fixture explicitly selects its seed admin. |
| `ATTENDANCE_SP_CIDRS`   | `attendance.campusCidrs`      | Event    | Empty list. QR attendance fails closed until valid IPv4 or IPv6 CIDRs are set. Integration tests supply documentation ranges for their cases.               |
| `S3_UPLOAD_TTL_SECONDS` | `media.uploadTtlSeconds`      | Platform | 300 seconds. The new value applies to newly signed upload and read URLs.                                                                                    |
| `S3_MAX_UPLOAD_BYTES`   | `media.maxUploadBytes`        | Platform | 10 MiB. The new value is embedded in each new S3 upload policy.                                                                                             |

The media values are resolved for the organisation that owns the event named in the API path. A malformed stored value falls through to its bounded registry default. Existing URLs keep the lifetime and size they were signed with.

`ATTENDANCE_SIGNING_SECRET` remains a secret. `SEED_ADMIN_EMAIL` and `SEED_ADMIN_SUB` are seed-time inputs only; they do not choose the attendance root. The remaining operational env keys and rehearsal mode are tracked in P10.4.
