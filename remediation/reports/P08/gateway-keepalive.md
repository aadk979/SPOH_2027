# Gateway keep-alive 503s — 6 October 2026

## Finding

Staging's API Gateway HTTP API reaches the task through a VPC-link private
integration (Cloud Map). During category acceptance it returned intermittent
HTTP 503 responses of exactly 33 bytes, the gateway's own
`{"message":"Service Unavailable"}`. No application log line exists for any of
them, so none reached Express. Across the previous 25 hours of access logs the
only 503s were inside the two category acceptance attempts and their read-only
review: the heaviest traffic staging had seen. The requests were about 600 ms
apart and hit different endpoints, so neither idle gaps nor one route explain
them.

The server used Node's default 5-second `keepAliveTimeout`. A gateway that pools
upstream connections can send on a socket at the moment Node closes it as idle.
The gateway reports that failed send as a 503. The failure rate rises with the
number of pooled connections reaching the idle limit, which matches its
appearance only under the denser harness traffic. Production booth writes would
meet the same race.

## Change

`server/src/app/httpTimeouts.ts` raises `keepAliveTimeout` to 120 seconds,
applied to the listening server in `main.ts`. Node 19+ `server.close()` still
drops idle sockets immediately, so graceful shutdown and its 10-second forced
exit are unchanged. A unit test pins the value, checks it stays below the request
timeout, checks the advertised `Keep-Alive` header and verifies shutdown does
not wait for idle sockets. Released in source `7ed246b`.

## Measurement

The same read-only probe was run before and after: a normal Cognito session,
1,200 private GETs paced at 500 ms across five admin and registration reads, and
its own session revoked with HTTP 204.

| Image                   | Task revision | Requests | 503s |
| ----------------------- | ------------- | -------- | ---- |
| `ab9a67d` (5 s default) | 136           | 1,200    | 3    |
| `7ed246b` (120 s)       | 137           | 1,200    | 0    |

The category acceptance on `7ed246b` that followed also recorded no backend
failure. Zero in 1,200 is consistent with the fix but not conclusive alone at the
earlier 0.25% rate (about a 5% chance of zero by luck). Keep watching the access
logs. The default access-log format records no integration error message, so a
recurrence would still not say why; adding `$context.integrationErrorMessage`
is a candidate observability change for P08.8.
[Sanitized evidence](staging-gateway-keepalive-evidence-2026-10-06.json).

## Follow-up — 7 October 2026

**Access-log format (P08.8).** The stage now writes one JSON line per request with
the integration status, latency and error message, response latency, path and the
gateway's error type and message (`infra/cdk/src/appService.ts`). A gateway-made
failure shows `integrationStatus` `-` and says why. The first version (`ac84907`,
live on task 140) left the error message unquoted. Without an error the gateway
writes it as a bare `-`, so no line parsed as JSON. `2bfae89` quotes it. All 37
lines from the task 141 acceptance parse, and the test now models absent values
the way the gateway writes them.

**503 watch.** From 09:00 UTC on 6 October to 03:20 UTC on 7 October the access
logs hold eight 503s, all between 11:24 and 13:13 UTC on 6 October, on task 136
with the 5-second default. Task 137 (`7ed246b`) was registered at 13:38 UTC. No
503 has been logged since, through five releases and their acceptance runs. This
is still light traffic; keep watching, now with the integration error in each line.
