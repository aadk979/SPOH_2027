# Rehearsal current posting

Actual staging browser run `.local/p16-event-core-browser-v3-20261023.json`
(native exit 1) completed the Volunteer registration/offline/reconnect/replay,
footfall, stamp and in-app assignment-notice checks. It then stopped before
any IC capture: `/me` selected the IC's oldest station A assignment instead of
the currently scheduled station B assignment. REHEARSAL permits all rostered
shifts, and the previous selection always chose the earliest permitted row.

Prefer a permitted posting whose actual shift is running now. Keep the existing
first-permitted fallback when practicing outside scheduled hours. The existing
running-shift permission result still controls eligibility; no auth, station
enforcement, lifecycle or capture-write rule changes.

Five unit regressions cover preference, fallback, permission, handover boundaries
and overlap stability. One PostgreSQL integration regression checks `/me` with
old/current postings at different stations. Full exact-candidate CI and staged
IC continuation remain required; the retained partial is not relabeled passed.
