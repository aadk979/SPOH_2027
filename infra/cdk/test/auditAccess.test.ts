import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { PlatformStack } from '../src/platformStack.js';

const app = buildApp(
  new App({ context: { imageTag: 'verified-release', serviceImageTag: 'verified-release' } }),
);
const stack = app.node.findChild('Spoh-staging-Platform');
if (!(stack instanceof PlatformStack)) throw new Error('Missing platform stack');
const template = Template.fromStack(stack);

function taskFor(name: string) {
  return Object.values(template.findResources('AWS::ECS::TaskDefinition')).find((row) =>
    row.Properties.ContainerDefinitions.some(
      (container: { Name: string }) => container.Name === name,
    ),
  )!.Properties;
}
function logStatements(name: string) {
  const task = taskFor(name);
  return Object.values(template.findResources('AWS::IAM::Policy'))
    .filter((row) =>
      row.Properties.Roles.some((role: { Ref: string }) =>
        JSON.stringify(task.TaskRoleArn).includes(role.Ref),
      ),
    )
    .flatMap((row) => row.Properties.PolicyDocument.Statement as Array<{ Action: unknown }>)
    .filter((row) => JSON.stringify(row.Action).includes('logs:'));
}

it('tells the app which retained group receives the audit copy', () => {
  const container = taskFor('app').ContainerDefinitions[0];
  expect(container.Environment).toContainEqual({
    Name: 'AUDIT_LOG_GROUP',
    Value: '/spoh/staging/audit',
  });
  template.hasResourceProperties('AWS::Logs::LogGroup', {
    LogGroupName: '/spoh/staging/audit',
    RetentionInDays: 400,
  });
});

it('lets the app append to that group only, never read, delete or change it', () => {
  const statements = logStatements('app');
  expect(statements).toHaveLength(1);
  expect(statements[0]!.Action).toEqual(['logs:CreateLogStream', 'logs:PutLogEvents']);
  expect(JSON.stringify(statements[0])).toContain('log-group:/spoh/staging/audit:log-stream:*');
  expect(logStatements('migrate')).toEqual([]);
});

it('passes full deployment nag when the CLI resolves AWS partition literals', () => {
  const deployment = buildApp(new App({ context: {
    imageTag: 'verified-release', serviceImageTag: 'verified-release',
    '@aws-cdk/core:enablePartitionLiterals': true,
  } }));
  // Plain App tests leave partition tokens unresolved; the deployment CLI does not.
  expect(() => deployment.synth()).not.toThrow();
});
