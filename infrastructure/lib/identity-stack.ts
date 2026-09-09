/**
 * IdentityStack: identidade base (Cognito).
 *
 * User Pool integravel ao modulo identity-access, com politica de senha forte e
 * suporte a MFA. Um atributo customizado tenantId liga o usuario ao seu tenant.
 * A autorizacao de aplicacao (papeis clinicos, permissoes por tenant) permanece
 * no modulo identity-access; aqui provemos apenas a identidade base.
 */

import { Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import type { Construct } from "constructs";

import type { EnvironmentConfig } from "./config/environments.js";
import { RESOURCE_PREFIX } from "./constants.js";

export interface IdentityStackProps extends StackProps {
  readonly envConfig: EnvironmentConfig;
}

export class IdentityStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: IdentityStackProps) {
    super(scope, id, props);
    const { envConfig } = props;
    const suffix = envConfig.name;

    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `${RESOURCE_PREFIX}-users-${suffix}`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      customAttributes: {
        // Liga o usuario ao seu tenant (clinica/rede). Imutavel apos criacao.
        tenantId: new cognito.StringAttribute({ mutable: false }),
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(3),
      },
      // MFA obrigatorio em producao; opcional fora dela.
      mfa: envConfig.isProduction ? cognito.Mfa.REQUIRED : cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: envConfig.removalPolicy,
    });

    this.userPoolClient = this.userPool.addClient("AppClient", {
      userPoolClientName: `${RESOURCE_PREFIX}-web-${suffix}`,
      authFlows: { userSrp: true },
      // Sem client secret: cliente publico (SPA) usa SRP + PKCE.
      generateSecret: false,
      accessTokenValidity: Duration.minutes(15),
      idTokenValidity: Duration.minutes(15),
      refreshTokenValidity: Duration.days(14),
      preventUserExistenceErrors: true,
    });
  }
}
