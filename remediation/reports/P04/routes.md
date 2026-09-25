| Method | Path                                         | Auth   | Rate limit | Capability                | Roles | Station scope | Validated    | Idempotent |
| ------ | -------------------------------------------- | ------ | ---------- | ------------------------- | ----- | ------------- | ------------ | ---------- |
| GET    | `/healthz`                                   | **no** | **none**   | —                         | —     |               | —            |            |
| GET    | `/readyz`                                    | **no** | **none**   | —                         | —     |               | —            |            |
| POST   | `/api/v1/auth/session`                       | **no** | sensitive  | —                         | —     |               | body         |            |
| GET    | `/api/v1/auth/login`                         | **no** | sensitive  | —                         | —     |               | —            |            |
| GET    | `/api/v1/auth/callback`                      | **no** | sensitive  | —                         | —     |               | —            |            |
| POST   | `/api/v1/auth/refresh`                       | **no** | default    | —                         | —     |               | —            |            |
| DELETE | `/api/v1/auth/session`                       | **no** | default    | —                         | —     |               | —            |            |
| GET    | `/api/v1/auth/sessions`                      | yes    | default    | —                         | all   |               | —            |            |
| DELETE | `/api/v1/auth/sessions/:id`                  | yes    | default    | —                         | all   |               | params       |            |
| GET    | `/api/v1/me`                                 | yes    | **none**   | own.read                  | all   |               | —            |            |
| POST   | `/api/v1/me/check-in`                        | yes    | **none**   | own.read                  | all   |               | body         |            |
| POST   | `/api/v1/me/check-out`                       | yes    | **none**   | own.read                  | all   |               | body         |            |
| GET    | `/api/v1/attendance`                         | yes    | default    | —                         | all   |               | —            |            |
| POST   | `/api/v1/attendance/start`                   | yes    | sensitive  | —                         | all   |               | —            |            |
| POST   | `/api/v1/attendance/challenge`               | yes    | sensitive  | —                         | all   |               | —            |            |
| POST   | `/api/v1/attendance/submit`                  | yes    | sensitive  | —                         | all   |               | body         |            |
| GET    | `/api/v1/stations`                           | yes    | **none**   | —                         | all   |               | —            |            |
| POST   | `/api/v1/registrations`                      | yes    | capture    | registration.create       | VIDCA | yes           | body         | yes        |
| POST   | `/api/v1/registrations/group`                | yes    | capture    | registration.create       | VIDCA | yes           | body         | yes        |
| POST   | `/api/v1/registrations/:id/void`             | yes    | default    | record.void               | IDCA  |               | params+body  |            |
| GET    | `/api/v1/registrations/summary`              | yes    | default    | dashboard.station.read    | IDCLA |               | query        |            |
| POST   | `/api/v1/footfall/ticks`                     | yes    | capture    | footfall.create           | VIDCA | yes           | body         | yes        |
| POST   | `/api/v1/footfall/bulk`                      | yes    | default    | count.adjust              | IDCA  | yes           | body         | yes        |
| POST   | `/api/v1/footfall/ticks/:id/void`            | yes    | default    | record.void               | IDCA  |               | params+body  |            |
| GET    | `/api/v1/footfall/summary`                   | yes    | default    | dashboard.station.read    | IDCLA |               | query        |            |
| GET    | `/api/v1/footfall/live`                      | yes    | default    | dashboard.station.read    | IDCLA |               | —            |            |
| POST   | `/api/v1/incidents`                          | yes    | default    | incident.report           | all   |               | body         | yes        |
| GET    | `/api/v1/incidents`                          | yes    | default    | dashboard.station.read    | IDCLA |               | query        |            |
| POST   | `/api/v1/incidents/:id/follow-ups`           | yes    | default    | incident.resolve          | IDCA  |               | params+body  |            |
| POST   | `/api/v1/incidents/:id/status`               | yes    | default    | incident.resolve          | IDCA  |               | params+body  |            |
| POST   | `/api/v1/lost-person`                        | yes    | default    | lostPerson.raise          | all   |               | body         | yes        |
| GET    | `/api/v1/lost-person/active`                 | yes    | capture    | own.read                  | all   |               | —            |            |
| POST   | `/api/v1/lost-person/:id/ack`                | yes    | capture    | own.read                  | all   |               | params       |            |
| POST   | `/api/v1/lost-person/:id/resolve`            | yes    | default    | lostPerson.resolve        | IDCA  |               | params+body  |            |
| GET    | `/api/v1/roster/me`                          | yes    | default    | own.read                  | all   |               | —            |            |
| GET    | `/api/v1/roster/station/:stationId`          | yes    | default    | dashboard.station.read    | IDCLA |               | params+query |            |
| POST   | `/api/v1/roster/volunteers`                  | yes    | sensitive  | user.provision            | CA    |               | body         |            |
| POST   | `/api/v1/roster/import`                      | yes    | sensitive  | roster.edit               | DCA   |               | body         |            |
| POST   | `/api/v1/roster/swaps`                       | yes    | default    | own.read                  | all   |               | body         |            |
| GET    | `/api/v1/roster/swaps`                       | yes    | default    | own.read                  | all   |               | —            |            |
| GET    | `/api/v1/roster/swaps/pending`               | yes    | default    | swap.approve              | IDCA  |               | —            |            |
| POST   | `/api/v1/roster/swaps/:id/decide`            | yes    | default    | swap.approve              | IDCA  |               | params+body  |            |
| GET    | `/api/v1/roster/briefing-slots`              | yes    | default    | own.read                  | all   |               | query        |            |
| POST   | `/api/v1/roster/briefing-slots/:id/complete` | yes    | default    | own.read                  | all   |               | params+body  |            |
| GET    | `/api/v1/roster/gaps`                        | yes    | default    | dashboard.event.read      | DCLA  |               | —            |            |
| POST   | `/api/v1/cards/batch`                        | yes    | sensitive  | user.provision            | CA    |               | body         |            |
| GET    | `/api/v1/cards/funnel`                       | yes    | default    | dashboard.station.read    | IDCLA |               | query        |            |
| GET    | `/api/v1/cards/:shortCode`                   | yes    | capture    | card.stamp                | VIDCA |               | params       |            |
| POST   | `/api/v1/cards/:shortCode/issue`             | yes    | capture    | registration.create       | VIDCA |               | params+body  | yes        |
| POST   | `/api/v1/cards/:shortCode/stamps`            | yes    | capture    | card.stamp                | VIDCA | yes           | params+body  | yes        |
| POST   | `/api/v1/cards/:shortCode/void`              | yes    | default    | card.reissue              | IDCA  |               | params+body  |            |
| POST   | `/api/v1/cards/:shortCode/reissue`           | yes    | default    | card.reissue              | IDCA  |               | params+body  |            |
| GET    | `/api/v1/gifts`                              | yes    | default    | gift.redeem               | VIDCA |               | —            |            |
| POST   | `/api/v1/gifts/redemptions`                  | yes    | capture    | gift.redeem               | VIDCA | yes           | body         | yes        |
| POST   | `/api/v1/gifts/:id/adjust`                   | yes    | default    | count.adjust              | IDCA  |               | params+body  |            |
| GET    | `/api/v1/gifts/summary`                      | yes    | default    | dashboard.station.read    | IDCLA |               | query        |            |
| POST   | `/api/v1/announcements`                      | yes    | default    | announcement.station.send | IDCA  |               | body         |            |
| GET    | `/api/v1/announcements`                      | yes    | default    | own.read                  | all   |               | query        |            |
| POST   | `/api/v1/announcements/:id/ack`              | yes    | default    | own.read                  | all   |               | params       |            |
| GET    | `/api/v1/dashboard/live`                     | yes    | default    | dashboard.event.read      | DCLA  |               | —            |            |
| GET    | `/api/v1/dashboard/data-health`              | yes    | default    | dashboard.event.read      | DCLA  |               | —            |            |
| GET    | `/api/v1/dashboard/station/:id`              | yes    | default    | dashboard.station.read    | IDCLA |               | params       |            |
| POST   | `/api/v1/lost-found`                         | yes    | default    | lostFound.log             | VIDCA |               | body         |            |
| GET    | `/api/v1/lost-found`                         | yes    | default    | own.read                  | all   |               | query        |            |
| POST   | `/api/v1/lost-found/:id/claim`               | yes    | default    | lostFound.log             | VIDCA |               | params+body  |            |
| POST   | `/api/v1/lost-found/close-out`               | yes    | default    | report.generate           | DCLA  |               | —            |            |
| GET    | `/api/v1/reports/summary`                    | yes    | sensitive  | report.generate           | DCLA  |               | query        |            |
| GET    | `/api/v1/reports/export`                     | yes    | sensitive  | report.generate           | DCLA  |               | query        |            |
| GET    | `/api/v1/audit`                              | yes    | default    | audit.read                | CLA   |               | query        |            |
| GET    | `/api/v1/admin/volunteers`                   | yes    | default    | user.read                 | DCLA  |               | query        |            |
| GET    | `/api/v1/admin/volunteers/:id`               | yes    | default    | user.read                 | DCLA  |               | params       |            |
| PATCH  | `/api/v1/admin/volunteers/:id`               | yes    | admin      | user.provision            | CA    |               | params+body  |            |
| POST   | `/api/v1/admin/volunteers/:id/deactivate`    | yes    | admin      | user.provision            | CA    |               | params+body  |            |
| POST   | `/api/v1/admin/volunteers/:id/reactivate`    | yes    | admin      | user.provision            | CA    |               | params       |            |
| POST   | `/api/v1/admin/assignments`                  | yes    | default    | roster.edit               | DCA   |               | body         |            |
| DELETE | `/api/v1/admin/assignments/:id`              | yes    | default    | roster.edit               | DCA   |               | params       |            |
| GET    | `/api/v1/admin/stations`                     | yes    | default    | config.manage             | CA    |               | —            |            |
| POST   | `/api/v1/admin/stations`                     | yes    | admin      | config.manage             | CA    |               | body         |            |
| PATCH  | `/api/v1/admin/stations/:id`                 | yes    | admin      | config.manage             | CA    |               | params+body  |            |
| GET    | `/api/v1/admin/event-days`                   | yes    | default    | user.read                 | DCLA  |               | —            |            |
| POST   | `/api/v1/admin/event-days`                   | yes    | admin      | config.manage             | CA    |               | body         |            |
| PATCH  | `/api/v1/admin/event-days/:id`               | yes    | admin      | config.manage             | CA    |               | params+body  |            |
| POST   | `/api/v1/admin/gift-types`                   | yes    | admin      | config.manage             | CA    |               | body         |            |
| PATCH  | `/api/v1/admin/gift-types/:id`               | yes    | admin      | config.manage             | CA    |               | params+body  |            |
| GET    | `/api/v1/admin/settings`                     | yes    | default    | own.read                  | all   |               | —            |            |
| PATCH  | `/api/v1/admin/settings`                     | yes    | admin      | config.manage             | CA    |               | body         |            |
| GET    | `/api/v1/notifications/config`               | yes    | default    | own.read                  | all   |               | —            |            |
| POST   | `/api/v1/notifications/subscriptions`        | yes    | capture    | own.read                  | all   |               | body         |            |
| DELETE | `/api/v1/notifications/subscriptions`        | yes    | default    | own.read                  | all   |               | body         |            |
| GET    | `/api/v1/media/config`                       | yes    | default    | own.read                  | all   |               | —            |            |
| POST   | `/api/v1/media/uploads`                      | yes    | sensitive  | lostFound.log             | VIDCA |               | body         |            |
| GET    | `/api/v1/media/url`                          | yes    | default    | own.read                  | all   |               | query        |            |
| POST   | `/api/v1/fallback/windows`                   | yes    | default    | fallback.declare          | DCA   |               | body         |            |
| POST   | `/api/v1/fallback/windows/:id/close`         | yes    | default    | fallback.declare          | DCA   |               | params+body  |            |
| GET    | `/api/v1/fallback/windows`                   | yes    | default    | dashboard.station.read    | IDCLA |               | query        |            |
| POST   | `/api/v1/fallback/imports/registrations`     | yes    | sensitive  | fallback.import           | CA    |               | body         |            |
| POST   | `/api/v1/fallback/imports/footfall`          | yes    | sensitive  | fallback.import           | CA    |               | body         |            |
| POST   | `/api/v1/dev-auth/sign-in`                   | **no** | sensitive  | —                         | —     |               | body         |            |
