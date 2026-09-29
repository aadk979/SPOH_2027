import { Validations } from 'aws-cdk-lib';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

/**
 * The app's secrets (P08.6), generated in Secrets Manager and injected into
 * tasks by ECS; nothing is written to an image or a file. Passwords exclude
 * punctuation so they can sit in a connection URL unencoded.
 */
export class AppSecrets extends Construct {
  readonly appDbPassword: Secret;
  readonly migratorDbPassword: Secret;
  readonly sessionSigningSecret: Secret;

  constructor(scope: Construct, id: string, prefix: string) {
    super(scope, id);
    const generated = (name: string, description: string, length: number): Secret =>
      new Secret(this, name, {
        secretName: `${prefix}/${name}`,
        description,
        generateSecretString: { passwordLength: length, excludePunctuation: true },
      });
    this.appDbPassword = generated(
      'db-app-password',
      'Password of spoh_app, the API database role',
      40,
    );
    this.migratorDbPassword = generated(
      'db-migrator-password',
      'Password of spoh_migrator, the schema owner the migrate task runs as',
      40,
    );
    this.sessionSigningSecret = generated(
      'session-signing-secret',
      'Signs the API access tokens (SESSION_SIGNING_SECRET)',
      64,
    );
    for (const secret of [this.appDbPassword, this.migratorDbPassword, this.sessionSigningSecret]) {
      Validations.of(secret).acknowledge({
        id: 'AwsSolutions-SMG4',
        reason:
          'Rotating these needs a rotation Lambda that can reach Secrets Manager and RDS; the VPC has no NAT or interface endpoint by design (ADR-008 §1). Rotation is an operator step in the runbook (P08.11).',
      });
    }
  }
}
