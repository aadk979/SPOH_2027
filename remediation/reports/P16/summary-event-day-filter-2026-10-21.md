# Summary event-day filtering repair

P16 source review found that registration, footfall and gift summary queries accepted
`eventDayId` but omitted it from their data filters. Selecting one day could therefore
return counts from every day and an unrelated fallback warning.

The candidate repair resolves the day within the authenticated event, uses its configured
timezone and operational day boundary, and intersects that window with explicit `from`
and `to` bounds. Missing and foreign day identifiers are refused. All-days queries retain
their existing behavior. Empty ranges cannot overlap a fallback window. Gift inventory
remains the current inventory; only the selected redemption counts are filtered by day.

Three focused regressions failed before the repair and passed afterward. Sixteen focused
unit tests, server type checks, architecture boundaries, affected lint and hardcoding
checks have passed. The full server unit suite also passes all 1,380 tests across 137
files. Unit day-lookup checks cover both 23-hour and 25-hour DST days. Integration cases cover Singapore operational boundaries, a 23-hour
London DST day, half-open bounds, foreign and missing days, empty intersections and
unchanged all-days queries.

The integration tests, fresh whole 29-step gate, complete coverage archive, exact-revision
CI and once-only staging verification remain pending. Docker startup is currently blocked
by a stale inference runtime socket; automated socket removal was rejected even after the
owner approved that exact repair. No release, staging acceptance, API obligation closure
or production readiness is claimed by this candidate patch.
