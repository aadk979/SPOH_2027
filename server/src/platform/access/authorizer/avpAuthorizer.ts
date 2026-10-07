import {
  IsAuthorizedCommand,
  VerifiedPermissionsClient,
  type IsAuthorizedCommandInput,
  type IsAuthorizedCommandOutput,
} from '@aws-sdk/client-verifiedpermissions';
import {
  ACTION_TYPE,
  AuthorizerUnavailableError,
  type AuthorizationDecision,
  type AuthorizationRequest,
  type Authorizer,
} from './types.js';

/** The one AVP call the app makes; its IAM role holds `IsAuthorized` only (ADR-005 §2). */
export interface AvpClient {
  isAuthorized(
    input: IsAuthorizedCommandInput,
    signal: AbortSignal,
  ): Promise<IsAuthorizedCommandOutput>;
}

/** The SDK client, with its own retries off: this adapter owns the timeout and the retry. */
export function sdkAvpClient(region: string): AvpClient {
  const client = new VerifiedPermissionsClient({ region, maxAttempts: 1 });
  return {
    isAuthorized: (input, signal) =>
      client.send(new IsAuthorizedCommand(input), { abortSignal: signal }),
  };
}

export interface AvpAuthorizerOptions {
  readonly client: AvpClient;
  readonly policyStoreId: string;
  /**
   * AVP names policies by store-generated ids; CDK (P11.6) maps them back to the
   * `@id`s the local engine reports. An unmapped id is reported as `avp:<id>`.
   */
  readonly policyNames?: Readonly<Record<string, string>>;
  /** ADR-005 §6: 200 ms per attempt and one retry. */
  readonly timeoutMs?: number;
  readonly retries?: number;
}

const DEFAULT_TIMEOUT_MS = 200;
const DEFAULT_RETRIES = 1;

type Failure = 'retry' | 'unavailable' | 'invalid';

interface SdkFailure {
  name?: string;
  $fault?: string;
  $metadata?: { httpStatusCode?: number };
}

const TRANSIENT = new Set(['ThrottlingException', 'TimeoutError', 'AbortError']);

/** Throttling, server faults, timeouts and network errors are worth one more attempt. */
function transient(failure: SdkFailure): boolean {
  // No response metadata: the request never reached AVP (network, DNS, socket).
  if (!failure.$metadata) return true;
  if (TRANSIENT.has(failure.name ?? '')) return true;
  return failure.$fault === 'server' || (failure.$metadata.httpStatusCode ?? 0) >= 500;
}

function classify(error: unknown): Failure {
  const failure: SdkFailure = typeof error === 'object' && error !== null ? error : {};
  if (failure.name === 'ValidationException') return 'invalid';
  return transient(failure) ? 'retry' : 'unavailable';
}

class AttemptTimeout extends Error {
  override readonly name = 'TimeoutError';
}

/**
 * Amazon Verified Permissions, the authoritative engine in deployed environments
 * (D-06 A). It sends the same Cedar JSON the local engine evaluates. When AVP cannot
 * answer it throws `AuthorizerUnavailableError`; it never allows because of an error.
 */
export class AvpAuthorizer implements Authorizer {
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(private readonly options: AvpAuthorizerOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = options.retries ?? DEFAULT_RETRIES;
  }

  async isAuthorized(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    const input = this.input(request);
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        return this.decision(await this.attempt(input));
      } catch (error) {
        lastError = error;
        const failure = classify(error);
        if (failure === 'invalid') return this.invalid(error);
        if (failure === 'unavailable') break;
      }
    }
    throw new AuthorizerUnavailableError('avp-unavailable', lastError);
  }

  batch(requests: readonly AuthorizationRequest[]): Promise<AuthorizationDecision[]> {
    // Single calls, not BatchIsAuthorized: ADR-005 §6 prices batches at 30 times a call,
    // and UI affordances use the local engine instead.
    return Promise.all(requests.map((request) => this.isAuthorized(request)));
  }

  private input(request: AuthorizationRequest): IsAuthorizedCommandInput {
    return {
      policyStoreId: this.options.policyStoreId,
      principal: { entityType: request.principal.type, entityId: request.principal.id },
      action: { actionType: ACTION_TYPE, actionId: request.action },
      resource: { entityType: request.resource.type, entityId: request.resource.id },
      context: { cedarJson: JSON.stringify(request.context) },
      entities: { cedarJson: JSON.stringify(request.entities) },
    };
  }

  private async attempt(input: IsAuthorizedCommandInput): Promise<IsAuthorizedCommandOutput> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new AttemptTimeout(`AVP did not answer within ${this.timeoutMs} ms`));
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([
        this.options.client.isAuthorized(input, controller.signal),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private decision(output: IsAuthorizedCommandOutput): AuthorizationDecision {
    const names = this.options.policyNames ?? {};
    const errors = (output.errors ?? []).map((error) => error.errorDescription ?? 'error');
    return {
      allowed: output.decision === 'ALLOW' && errors.length === 0,
      engine: 'avp',
      determiningPolicies: (output.determiningPolicies ?? []).map(
        (policy) => names[policy.policyId ?? ''] ?? `avp:${policy.policyId}`,
      ),
      errors,
    };
  }

  /** AVP refused the request itself; the local engine would refuse it too. Deny. */
  private invalid(error: unknown): AuthorizationDecision {
    const message = error instanceof Error ? error.message : 'invalid request';
    return { allowed: false, engine: 'avp', determiningPolicies: [], errors: [message] };
  }
}
