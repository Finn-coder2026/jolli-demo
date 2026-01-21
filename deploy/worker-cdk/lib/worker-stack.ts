import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";

type Environment = "dev" | "preview" | "prod";

interface WorkerStackProps extends cdk.StackProps {
	environment: Environment;
	ecrRepository: ecr.IRepository;
}

// Environment-specific configuration
const ENV_CONFIG: Record<
	Environment,
	{
		cpu: number;
		memoryMiB: number;
		desiredCount: number;
		logRetentionDays: logs.RetentionDays;
		useSpot: boolean;
	}
> = {
	dev: {
		cpu: 512,
		memoryMiB: 1024,
		desiredCount: 1,
		logRetentionDays: logs.RetentionDays.ONE_WEEK,
		useSpot: true,
	},
	preview: {
		cpu: 512,
		memoryMiB: 1024,
		desiredCount: 1,
		logRetentionDays: logs.RetentionDays.ONE_WEEK,
		useSpot: true,
	},
	prod: {
		cpu: 1024,
		memoryMiB: 2048,
		desiredCount: 2,
		logRetentionDays: logs.RetentionDays.ONE_MONTH,
		useSpot: false,
	},
};

export class WorkerStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props: WorkerStackProps) {
		super(scope, id, props);

		const { environment, ecrRepository } = props;
		const config = ENV_CONFIG[environment];

		// VPC with 2 AZs, 1 NAT gateway for cost optimization
		const vpc = new ec2.Vpc(this, "WorkerVpc", {
			vpcName: `jolli-worker-vpc-${environment}`,
			maxAzs: 2,
			natGateways: 1,
			subnetConfiguration: [
				{
					name: "Public",
					subnetType: ec2.SubnetType.PUBLIC,
					cidrMask: 24,
				},
				{
					name: "Private",
					subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
					cidrMask: 24,
				},
			],
		});

		// VPC Endpoints for AWS services - ensures private subnet access without NAT dependency
		// SSM endpoint for Parameter Store access
		vpc.addInterfaceEndpoint("SsmEndpoint", {
			service: ec2.InterfaceVpcEndpointAwsService.SSM,
			subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
		});

		// ECR endpoints for pulling container images
		vpc.addInterfaceEndpoint("EcrEndpoint", {
			service: ec2.InterfaceVpcEndpointAwsService.ECR,
			subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
		});
		vpc.addInterfaceEndpoint("EcrDockerEndpoint", {
			service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
			subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
		});

		// S3 Gateway endpoint (free) for ECR layer downloads
		vpc.addGatewayEndpoint("S3Endpoint", {
			service: ec2.GatewayVpcEndpointAwsService.S3,
			subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
		});

		// CloudWatch Logs endpoint for log delivery
		vpc.addInterfaceEndpoint("LogsEndpoint", {
			service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
			subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
		});

		// ECS Cluster
		const cluster = new ecs.Cluster(this, "WorkerCluster", {
			clusterName: `jolli-workers-${environment}`,
			vpc,
			containerInsightsV2:
				environment === "prod"
					? ecs.ContainerInsights.ENABLED
					: ecs.ContainerInsights.DISABLED,
		});

		// CloudWatch Log Group for worker logs
		// Retain for all environments to preserve logs during rollback for debugging
		const logGroup = new logs.LogGroup(this, "WorkerLogGroup", {
			logGroupName: `/ecs/jolli-worker-${environment}`,
			retention: config.logRetentionDays,
			removalPolicy: cdk.RemovalPolicy.RETAIN,
		});

		// Task execution role (for ECR pull, CloudWatch logs)
		const executionRole = new iam.Role(this, "TaskExecutionRole", {
			roleName: `jolli-worker-execution-${environment}`,
			assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
			managedPolicies: [
				iam.ManagedPolicy.fromAwsManagedPolicyName(
					"service-role/AmazonECSTaskExecutionRolePolicy",
				),
			],
		});

		// Task role (for application permissions)
		const taskRole = new iam.Role(this, "TaskRole", {
			roleName: `jolli-worker-task-${environment}`,
			assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
		});

		// Allow reading from Parameter Store (for secrets via PSTORE_ENV)
		// Uses /jolli/vercel/{environment}/* path (VERCEL=1 env var makes config use this path)
		taskRole.addToPolicy(
			new iam.PolicyStatement({
				effect: iam.Effect.ALLOW,
				actions: ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"],
				resources: [
					`arn:aws:ssm:${this.region}:${this.account}:parameter/jolli/vercel/${environment}/*`,
				],
			}),
		);

		// Allow KMS decrypt for encrypted parameters
		taskRole.addToPolicy(
			new iam.PolicyStatement({
				effect: iam.Effect.ALLOW,
				actions: ["kms:Decrypt"],
				resources: ["*"],
				conditions: {
					StringEquals: {
						"kms:ViaService": `ssm.${this.region}.amazonaws.com`,
					},
				},
			}),
		);

		// Task Definition with ephemeral storage for temporary job files
		const taskDefinition = new ecs.FargateTaskDefinition(
			this,
			"WorkerTaskDefinition",
			{
				family: `jolli-worker-${environment}`,
				cpu: config.cpu,
				memoryLimitMiB: config.memoryMiB,
				executionRole,
				taskRole,
				ephemeralStorageGiB: 30,
				runtimePlatform: {
					cpuArchitecture: ecs.CpuArchitecture.X86_64,
					operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
				},
			},
		);

		// Container definition
		taskDefinition.addContainer("worker", {
			containerName: "jolli-worker",
			image: ecs.ContainerImage.fromEcrRepository(ecrRepository, environment),
			logging: ecs.LogDrivers.awsLogs({
				logGroup,
				streamPrefix: "worker",
			}),
			environment: {
				NODE_ENV: "production",
				MULTI_TENANT_ENABLED: "true",
				WORKER_MODE: "true",
				PSTORE_ENV: environment,
				AWS_REGION: this.region,
				// Use console transport for logs (CloudWatch captures stdout)
				LOG_TRANSPORTS: "console",
				// Use Vercel path for Parameter Store (/jolli/vercel/{env}/)
				// This ensures worker uses same config as Vercel-deployed backend
				VERCEL: "1",
			},
			healthCheck: {
				command: ["CMD-SHELL", "node -e \"process.exit(0)\" || exit 1"],
				interval: cdk.Duration.seconds(30),
				timeout: cdk.Duration.seconds(5),
				retries: 3,
				startPeriod: cdk.Duration.seconds(60),
			},
		});

		// Security group for worker tasks
		const securityGroup = new ec2.SecurityGroup(this, "WorkerSecurityGroup", {
			vpc,
			securityGroupName: `jolli-worker-sg-${environment}`,
			description: "Security group for Jolli Worker tasks",
			allowAllOutbound: true,
		});

		// ECS Service with circuit breaker
		const service = new ecs.FargateService(this, "WorkerService", {
			serviceName: `jolli-worker-${environment}`,
			cluster,
			taskDefinition,
			desiredCount: config.desiredCount,
			minHealthyPercent: 100,
			maxHealthyPercent: 200,
			securityGroups: [securityGroup],
			vpcSubnets: {
				subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
			},
			circuitBreaker: {
				rollback: true,
			},
			capacityProviderStrategies: config.useSpot
				? [
						{
							capacityProvider: "FARGATE_SPOT",
							weight: 2,
						},
						{
							capacityProvider: "FARGATE",
							weight: 1,
						},
					]
				: [
						{
							capacityProvider: "FARGATE",
							weight: 1,
						},
					],
			enableExecuteCommand: true,
		});

		// Outputs
		new cdk.CfnOutput(this, "ClusterArn", {
			value: cluster.clusterArn,
			description: "ECS Cluster ARN",
		});

		new cdk.CfnOutput(this, "ServiceArn", {
			value: service.serviceArn,
			description: "ECS Service ARN",
		});

		new cdk.CfnOutput(this, "LogGroupName", {
			value: logGroup.logGroupName,
			description: "CloudWatch Log Group",
		});
	}
}
