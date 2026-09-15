/**
 * RegistryStack: repositorios ECR provisionados antes das imagens e do ECS.
 *
 * Separar o registry do ComputeStack elimina o ciclo do primeiro deploy:
 * registry -> build/push -> task definitions -> migrations -> services.
 */

import { RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import type { Construct } from "constructs";

import type { EnvironmentConfig } from "./config/environments.js";
import { BACKEND_SERVICES, RESOURCE_PREFIX } from "./constants.js";

export interface RegistryStackProps extends StackProps {
  readonly envConfig: EnvironmentConfig;
}

export class RegistryStack extends Stack {
  public readonly repositories: Readonly<Record<string, ecr.Repository>>;

  constructor(scope: Construct, id: string, props: RegistryStackProps) {
    super(scope, id, props);
    const { envConfig } = props;

    const repositories: Record<string, ecr.Repository> = {};
    for (const service of BACKEND_SERVICES) {
      const repository = new ecr.Repository(this, `${service.name}-Repository`, {
        repositoryName: `${RESOURCE_PREFIX}/${service.name}`,
        imageScanOnPush: true,
        imageTagMutability: ecr.TagMutability.IMMUTABLE,
        encryption: ecr.RepositoryEncryption.KMS,
        removalPolicy: envConfig.removalPolicy,
        emptyOnDelete: envConfig.removalPolicy === RemovalPolicy.DESTROY,
        lifecycleRules: [
          {
            description: "Preserva somente as imagens recentes do servico",
            maxImageCount: envConfig.isProduction ? 50 : 15,
          },
        ],
      });
      repositories[service.name] = repository;
    }

    this.repositories = repositories;
  }
}
