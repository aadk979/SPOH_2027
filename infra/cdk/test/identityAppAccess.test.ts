import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('app Cognito administration boundary', () => {
  it.each(['staging', 'prod'])('grants %s app only the four existing provider operations on its own pool', (stage) => {
    const app = buildApp(new App({ context: { imageTag: 'release', serviceImageTag: 'release' } }));
    const template = Template.fromStack(app.node.findChild(`Spoh-${stage}-Platform`) as never);
    const poolId = Object.keys(template.findResources('AWS::Cognito::UserPool'))[0];
    const tasks = Object.values(template.findResources('AWS::ECS::TaskDefinition'));
    for (const task of tasks) {
      const taskRole = task.Properties.TaskRoleArn;
      const statements = Object.values(template.findResources('AWS::IAM::Policy')).filter((row) =>
        row.Properties.Roles.some((ref: { Ref: string }) => JSON.stringify(taskRole).includes(ref.Ref)))
        .flatMap((row) => row.Properties.PolicyDocument.Statement as Array<Record<string, unknown>>)
        .filter((statement) => JSON.stringify(statement.Action).includes('cognito-idp:'));
      if (task.Properties.ContainerDefinitions[0].Name === 'app') expect(statements).toEqual([{
        Effect: 'Allow', Resource: { 'Fn::GetAtt': [poolId, 'Arn'] }, Action: [
          'cognito-idp:AdminCreateUser', 'cognito-idp:AdminGetUser',
          'cognito-idp:AdminDisableUser', 'cognito-idp:AdminEnableUser',
        ],
      }]);
      else expect(statements).toEqual([]);
    }
  });
});
