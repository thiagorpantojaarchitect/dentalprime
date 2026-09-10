/**
 * NetworkStack: a rede base do ambiente.
 *
 * VPC multi-AZ com tres camadas de subnet (publica, privada com egress,
 * isolada). Recursos de dados ficam nas subnets isoladas, sem rota de entrada
 * pela internet. VPC endpoints evitam trafego de servicos AWS pela internet
 * publica.
 */

import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import type { Construct } from "constructs";

import type { EnvironmentConfig } from "./config/environments.js";
import { RESOURCE_PREFIX } from "./constants.js";

export interface NetworkStackProps extends StackProps {
  readonly envConfig: EnvironmentConfig;
}

export class NetworkStack extends Stack {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);
    const { envConfig } = props;

    this.vpc = new ec2.Vpc(this, "Vpc", {
      vpcName: `${RESOURCE_PREFIX}-vpc-${envConfig.name}`,
      maxAzs: envConfig.maxAzs,
      natGateways: envConfig.natGateways,
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      // Flow logs para diagnostico de rede e auditoria (CloudWatch).
      flowLogs: {
        cloudwatch: {
          trafficType: ec2.FlowLogTrafficType.ALL,
        },
      },
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          // Compute (ECS Fargate). Egress via NAT; sem entrada direta.
          name: "private-egress",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 22,
        },
        {
          // Dados (Aurora, Redis). Sem rota para a internet.
          name: "isolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // Gateway endpoint para S3 (sem custo por hora, evita NAT para S3).
    this.vpc.addGatewayEndpoint("S3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // Interface endpoints para servicos usados pelas tasks (privilegio de rede
    // minimo; trafego permanece na rede da AWS).
    const interfaceEndpoints: Record<string, ec2.InterfaceVpcEndpointAwsService> = {
      SecretsManager: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      EcrApi: ec2.InterfaceVpcEndpointAwsService.ECR,
      EcrDocker: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      CloudWatchLogs: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
    };

    for (const [id_, service] of Object.entries(interfaceEndpoints)) {
      this.vpc.addInterfaceEndpoint(`${id_}Endpoint`, {
        service,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        privateDnsEnabled: true,
      });
    }

    // Saida usada pelo workflow de deploy (rede do run-task de migracao).
    new CfnOutput(this, "PrivateSubnetIds", {
      value: this.vpc
        .selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS })
        .subnetIds.join(","),
      description: "IDs das subnets privadas (compute)",
    });
  }
}
