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

The current capture release remains immutable at c96db0c. This independent
workflow change is prepared locally and will be pushed with the next verified
batch after its staging verification. Actual execution of the new shared step
in CI is pending; it is not inferred from the earlier workflow's green jobs.

P08.9 remains open for its complete pipeline criteria, including seeded browser
journeys, the required coverage gate, documented/rehearsed rollback, dependency
automation and park/unpark work. Production creation/cutover keeps the existing
28 October owner decision. No premature deploy-time inputs are requested.
