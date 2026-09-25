# Cedar bench (P05.6)

The draft authorization model for [ADR-005](../../../../docs/adr/ADR-005-authorization-avp.md),
checked locally with Cedar WASM, the engine the app's `LocalCedarAuthorizer` will use. No AWS call
is made (D-13). P11.1 moves the schema, policies, generator and tests into
`packages/access-policies/`. This directory is kept as the design record.

```bash
cd remediation/reports/P05/cedar
npm ci
npm test                            # 51 tests: validation, the 26×6 port, changes, guardrails
node tools/generate-grants.mjs      # regenerate policies/grants.generated.cedar from the schema
```

It is deliberately **not** a workspace, so P05 adds no dependency to the product. It has its own
`package-lock.json` pinning `@cedar-policy/cedar-wasm` 4.13.0.

| File                              | What it is                                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schema.cedarschema`              | entities, attributes, 65 actions (46 Editable) in 8 functional groups, plus `Editable` and `Write`                                                                             |
| `policies/grants.generated.cedar` | one permit per Editable action, granted by the per-event role's `grants` (layer 1). Generated                                                                                  |
| `policies/station-scope.cedar`    | capture where you are on shift; an IC's station reads and sends stay on their stations (layer 2)                                                                               |
| `policies/guardrails.cedar`       | locked `forbid`s: inactive, same event, not yourself, outrank, grant below your rank, capture window, archived read-only, structure frozen when live, locked actions (layer 3) |
| `policies/self-service.cedar`     | own record, own shift, check-in conditions, briefer only, announcement audience, alerts, attendance                                                                            |
| `policies/attendance.cedar`       | who may issue attendance codes, and the root                                                                                                                                   |
| `policies/platform-admin.cedar`   | platform actions, locked actions, and assigning any role                                                                                                                       |
| `default-grants.json`             | what a new event's role permissions start as, derived from today's matrix                                                                                                      |
| `CHANGES.md`                      | every cell that differs from today, with its reason and test                                                                                                                   |
| `tests/`                          | `validate` (strict validation, generated file current), `matrix` (reads `capabilities.ts`), `changes`                                                                          |

A mutation check was run when this was written: deleting `guardrail.outrank-target` and granting a
Lead `Record.Void` each made the suite fail.
