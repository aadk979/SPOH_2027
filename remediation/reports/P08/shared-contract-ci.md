# Shared contract tests in CI — partial P08.9

The CI Tests job now runs the existing shared test suite after shared compilation
and database preparation, before server units/integrations and client tests.
Its command is npm run test:unit --workspace packages/shared. The suite needs no
database and exercises boundary contracts independently of their application
consumers. This closes the omission found while reviewing the capture schedule
release; compiling shared code alone did not execute those tests.

The exact command is already verified locally on Node 24: all 146 checks across
14 files pass, including the 22 new capture schedule contract cases. Workflow
formatting and diff checks pass. No new test implementation, action, dependency,
service, resource or database writer is introduced by the workflow change.

The workflow correction cb506cf and tracker 74defb8 are pushed in the verified
capture-management batch aa42013. [CI 37298082070](https://github.com/aadk979/SPOH_2027/actions/runs/37298082070)
succeeds for that exact head; job metadata confirms the new Shared contract tests
step actually executes and succeeds. The same existing command passes 173
checks across 15 files locally after the 27 management contract cases are added.
This evidence verifies execution of the shared gate, without inferring it from
an earlier workflow's compilation or application tests. The capture release's
deployment and bounded staging management verification remain separate work.

P08.9 remains open for its complete pipeline criteria, including seeded browser
journeys, the required coverage gate, documented/rehearsed rollback, dependency
automation and park/unpark work. Production creation/cutover keeps the existing
28 October owner decision. No premature deploy-time inputs are requested.
