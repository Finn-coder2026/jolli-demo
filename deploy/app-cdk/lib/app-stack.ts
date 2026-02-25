import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";

type Environment = "dev" | "preview" | "prod";

interface AppStackProps extends cdk.StackProps {
	environment: Environment;
	ecrRepository: ecr.IRepository;
	/** Optional ARN of an existing ACM certificate. If not provided, HTTPS is disabled. */
	certificateArn?: string;
}

interface AutoScalingConfig {
	minTaskCount: number;
	maxTaskCount: number;
	targetCpuPercent: number;
	/** Seconds to wait before scaling in (removing tasks) */
	scaleInCooldown: number;
	/** Seconds to wait before scaling out (adding tasks) */
	scaleOutCooldown: number;
}

// Environment-specific configuration
const ENV_CONFIG: Record<
	Environment,
	{
		instanceType: ec2.InstanceType;
		minCapacity: number;
		maxCapacity: number;
		desiredCapacity: number;
		logRetentionDays: logs.RetentionDays;
		useSpot: boolean;
		containerMemoryMiB: number;
		containerCpu: number;
		domain: string;
		autoScaling?: AutoScalingConfig;
	}
> = {
	dev: {
		instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
		minCapacity: 1,
		maxCapacity: 2,
		desiredCapacity: 1,
		logRetentionDays: logs.RetentionDays.ONE_WEEK,
		useSpot: true,
		containerMemoryMiB: 1536, // Leave room for system overhead on t3.small (2GB)
		containerCpu: 1024, // 1 vCPU
		domain: "jolli.dev",
	},
	preview: {
		instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
		minCapacity: 1,
		maxCapacity: 2,
		desiredCapacity: 1,
		logRetentionDays: logs.RetentionDays.ONE_WEEK,
		useSpot: true,
		containerMemoryMiB: 1536,
		containerCpu: 1024,
		domain: "jolli.cloud",
	},
	prod: {
		instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
		minCapacity: 2,
		maxCapacity: 6,
		desiredCapacity: 2,
		logRetentionDays: logs.RetentionDays.ONE_MONTH,
		useSpot: false,
		containerMemoryMiB: 3584, // Leave room for system overhead on t3.medium (4GB)
		containerCpu: 2048, // 2 vCPUs
		domain: "jolli.ai",
		autoScaling: {
			minTaskCount: 2,
			maxTaskCount: 6,
			targetCpuPercent: 70,
			scaleInCooldown: 300, // 5 min - avoid flapping
			scaleOutCooldown: 60, // 1 min - scale out quickly
		},
	},
};

export class AppStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props: AppStackProps) {
		super(scope, id, props);

		const { environment, ecrRepository, certificateArn } = props;
		const config = ENV_CONFIG[environment];

		// Import existing worker VPC by tag lookup
		// This shares the VPC with worker clusters for simplified networking
		const vpc = ec2.Vpc.fromLookup(this, "WorkerVpc", {
			tags: { Name: `jolli-worker-vpc-${environment}` },
		});

		// ECS Cluster
		const cluster = new ecs.Cluster(this, "AppCluster", {
			clusterName: `jolli-app-${environment}`,
			vpc,
			containerInsightsV2:
				environment === "prod" ? ecs.ContainerInsights.ENABLED : ecs.ContainerInsights.DISABLED,
		});

		// CloudWatch Log Group for app logs
		const logGroup = new logs.LogGroup(this, "AppLogGroup", {
			logGroupName: `/ecs/jolli-app-${environment}`,
			retention: config.logRetentionDays,
			removalPolicy: cdk.RemovalPolicy.RETAIN,
		});

		// Task execution role (for ECR pull, CloudWatch logs)
		const executionRole = new iam.Role(this, "TaskExecutionRole", {
			roleName: `jolli-app-execution-${environment}`,
			assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
			managedPolicies: [
				iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"),
			],
		});

		// Task role (for application permissions)
		const taskRole = new iam.Role(this, "TaskRole", {
			roleName: `jolli-app-task-${environment}`,
			assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
		});

		// SSM - Parameter Store access
		taskRole.addToPolicy(
			new iam.PolicyStatement({
				effect: iam.Effect.ALLOW,
				actions: ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"],
				resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/jolli/app/${environment}/*`],
			}),
		);

		// KMS - Decrypt encrypted parameters
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

		// S3 - Image storage (app needs this, workers don't)
		taskRole.addToPolicy(
			new iam.PolicyStatement({
				effect: iam.Effect.ALLOW,
				actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:HeadObject"],
				resources: [`arn:aws:s3:::jolli-images-${environment}/*`],
			}),
		);
		taskRole.addToPolicy(
			new iam.PolicyStatement({
				effect: iam.Effect.ALLOW,
				actions: ["s3:HeadBucket", "s3:ListBucket"],
				resources: [`arn:aws:s3:::jolli-images-${environment}`],
			}),
		);

		// EC2 Task Definition (different from Fargate)
		const taskDefinition = new ecs.Ec2TaskDefinition(this, "AppTaskDefinition", {
			family: `jolli-app-${environment}`,
			executionRole,
			taskRole,
			networkMode: ecs.NetworkMode.AWS_VPC,
		});

		// Container definition
		taskDefinition.addContainer("app", {
			containerName: "jolli-app",
			image: ecs.ContainerImage.fromEcrRepository(ecrRepository, environment),
			memoryLimitMiB: config.containerMemoryMiB,
			cpu: config.containerCpu,
			logging: ecs.LogDrivers.awsLogs({
				logGroup,
				streamPrefix: "app",
			}),
			environment: {
				NODE_ENV: "production",
				PORT: "8034",
				HOST: "0.0.0.0",
				MULTI_TENANT_ENABLED: "true",
				PSTORE_ENV: environment,
				// Parameter Store path base for ECS deployments
				PSTORE_PATH_BASE: "app",
				AWS_REGION: this.region,
				LOG_TRANSPORTS: "console",
				// IMAGE_S3_ENV matches the S3 bucket naming
				IMAGE_S3_ENV: environment,
				// ORIGIN is required by better-auth for CORS/security
				ORIGIN: `https://${config.domain}`,
				// Reduce log volume in prod (info only), allow debug in dev/preview
				LOG_LEVEL: "info",
				// Skip Sequelize sync on startup — schema is managed via bootstrap/migrations.
				// Neon's information_schema views are too slow for alter-based sync at startup.
				SKIP_SEQUELIZE_SYNC: "true",
			},
			portMappings: [
				{
					containerPort: 8034,
					hostPort: 8034,
					protocol: ecs.Protocol.TCP,
				},
			],
			healthCheck: {
				command: ["CMD-SHELL", "wget -qO- http://localhost:8034/api/status/health || exit 1"],
				interval: cdk.Duration.seconds(30),
				timeout: cdk.Duration.seconds(5),
				retries: 3,
				startPeriod: cdk.Duration.seconds(60),
			},
		});

		// Security group for EC2 instances
		const instanceSecurityGroup = new ec2.SecurityGroup(this, "InstanceSecurityGroup", {
			vpc,
			securityGroupName: `jolli-app-instance-sg-${environment}`,
			description: "Security group for Jolli App EC2 instances",
			allowAllOutbound: true,
		});

		// Security group for ALB
		const albSecurityGroup = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
			vpc,
			securityGroupName: `jolli-app-alb-sg-${environment}`,
			description: "Security group for Jolli App ALB",
			allowAllOutbound: true,
		});

		// Allow HTTP/HTTPS from anywhere to ALB
		albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "Allow HTTP");
		albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "Allow HTTPS");
		albSecurityGroup.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(80), "Allow HTTP IPv6");
		albSecurityGroup.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(443), "Allow HTTPS IPv6");

		// Allow traffic from ALB to EC2 instances
		instanceSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(8034), "Allow traffic from ALB");

		// Security group for ECS tasks (used with awsvpc network mode)
		// Named explicitly so MemoryDB stack can look it up for ingress rules
		const taskSecurityGroup = new ec2.SecurityGroup(this, "TaskSecurityGroup", {
			vpc,
			securityGroupName: `jolli-app-task-sg-${environment}`,
			description: "Security group for Jolli App ECS tasks (awsvpc mode)",
			allowAllOutbound: true,
		});

		// Allow traffic from ALB to ECS tasks
		taskSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(8034), "Allow traffic from ALB");

		// IAM role for EC2 instances (needed for ECS agent and SSM)
		const instanceRole = new iam.Role(this, "InstanceRole", {
			roleName: `jolli-app-instance-${environment}`,
			assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
			managedPolicies: [
				iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonEC2ContainerServiceforEC2Role"),
				iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
			],
		});

		// Launch Template (required - AWS deprecated Launch Configurations)
		const launchTemplate = new ec2.LaunchTemplate(this, "AppLaunchTemplate", {
			launchTemplateName: `jolli-app-lt-${environment}`,
			instanceType: config.instanceType,
			machineImage: ecs.EcsOptimizedImage.amazonLinux2023(ecs.AmiHardwareType.STANDARD),
			securityGroup: instanceSecurityGroup,
			role: instanceRole,
			requireImdsv2: true,
			userData: ec2.UserData.forLinux(),
			spotOptions: config.useSpot
				? {
						requestType: ec2.SpotRequestType.ONE_TIME,
						maxPrice: 0.05, // ~$0.02/hr for t3.small spot
					}
				: undefined,
		});

		// Add ECS cluster name to user data so instances register with the cluster
		launchTemplate.userData?.addCommands(`echo ECS_CLUSTER=jolli-app-${environment} >> /etc/ecs/ecs.config`);

		// Auto Scaling Group with Launch Template
		const autoScalingGroup = new autoscaling.AutoScalingGroup(this, "AppAsg", {
			autoScalingGroupName: `jolli-app-asg-${environment}`,
			vpc,
			launchTemplate,
			minCapacity: config.minCapacity,
			maxCapacity: config.maxCapacity,
			desiredCapacity: config.desiredCapacity,
			vpcSubnets: {
				subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
			},
			healthChecks: autoscaling.HealthChecks.ec2({
				gracePeriod: cdk.Duration.minutes(5),
			}),
			// When using spot instances, minInstancesInService must be 0 because
			// spot instances can be terminated at any time during rolling updates
			updatePolicy: autoscaling.UpdatePolicy.rollingUpdate({
				maxBatchSize: 1,
				minInstancesInService: config.useSpot ? 0 : config.minCapacity,
			}),
		});

		// Add ECS capacity provider
		const capacityProvider = new ecs.AsgCapacityProvider(this, "AsgCapacityProvider", {
			capacityProviderName: `jolli-app-capacity-${environment}`,
			autoScalingGroup,
			enableManagedScaling: true,
			enableManagedTerminationProtection: false,
		});

		cluster.addAsgCapacityProvider(capacityProvider);

		// Application Load Balancer
		const alb = new elbv2.ApplicationLoadBalancer(this, "AppAlb", {
			loadBalancerName: `jolli-app-alb-${environment}`,
			vpc,
			internetFacing: true,
			securityGroup: albSecurityGroup,
			vpcSubnets: {
				subnetType: ec2.SubnetType.PUBLIC,
			},
		});

		// HTTPS configuration (optional - requires certificateArn to be provided)
		// Create certificate from ARN if provided, otherwise skip HTTPS
		const certificate = certificateArn
			? acm.Certificate.fromCertificateArn(this, "AppCertificate", certificateArn)
			: undefined;

		// Primary listener - HTTPS if certificate provided, HTTP otherwise
		let primaryListener: elbv2.ApplicationListener;

		if (certificate) {
			// HTTPS listener (primary)
			primaryListener = alb.addListener("HttpsListener", {
				port: 443,
				protocol: elbv2.ApplicationProtocol.HTTPS,
				certificates: [certificate],
				sslPolicy: elbv2.SslPolicy.TLS12,
			});

			// HTTP listener - redirect to HTTPS
			alb.addListener("HttpListener", {
				port: 80,
				protocol: elbv2.ApplicationProtocol.HTTP,
				defaultAction: elbv2.ListenerAction.redirect({
					protocol: "HTTPS",
					port: "443",
					permanent: true,
				}),
			});
		} else {
			// HTTP only (no certificate provided)
			primaryListener = alb.addListener("HttpListener", {
				port: 80,
				protocol: elbv2.ApplicationProtocol.HTTP,
			});
		}

		// ECS Service
		const service = new ecs.Ec2Service(this, "AppService", {
			serviceName: `jolli-app-${environment}`,
			cluster,
			taskDefinition,
			desiredCount: config.desiredCapacity,
			minHealthyPercent: 100,
			maxHealthyPercent: 200,
			circuitBreaker: {
				rollback: true,
			},
			enableExecuteCommand: true,
			capacityProviderStrategies: [
				{
					capacityProvider: capacityProvider.capacityProviderName,
					weight: 1,
				},
			],
			// Use the explicitly named security group for awsvpc network mode
			// This allows MemoryDB stack to look it up by name for ingress rules
			securityGroups: [taskSecurityGroup],
			vpcSubnets: {
				subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
			},
		});

		// Target group for the service
		const targetGroup = new elbv2.ApplicationTargetGroup(this, "AppTargetGroup", {
			targetGroupName: `jolli-app-tg-${environment}`,
			vpc,
			port: 8034,
			protocol: elbv2.ApplicationProtocol.HTTP,
			targetType: elbv2.TargetType.IP,
			healthCheck: {
				path: "/api/status/health",
				protocol: elbv2.Protocol.HTTP,
				healthyHttpCodes: "200",
				interval: cdk.Duration.seconds(30),
				timeout: cdk.Duration.seconds(5),
				healthyThresholdCount: 2,
				unhealthyThresholdCount: 3,
			},
			deregistrationDelay: cdk.Duration.seconds(30),
		});

		// Attach service to target group
		service.attachToApplicationTargetGroup(targetGroup);

		// Add target group to primary listener
		primaryListener.addTargetGroups("DefaultTargetGroup", {
			targetGroups: [targetGroup],
		});

		// ECS Service Auto-Scaling (scales tasks based on CPU utilization)
		if (config.autoScaling) {
			const scaling = service.autoScaleTaskCount({
				minCapacity: config.autoScaling.minTaskCount,
				maxCapacity: config.autoScaling.maxTaskCount,
			});

			scaling.scaleOnCpuUtilization("CpuScaling", {
				targetUtilizationPercent: config.autoScaling.targetCpuPercent,
				scaleInCooldown: cdk.Duration.seconds(config.autoScaling.scaleInCooldown),
				scaleOutCooldown: cdk.Duration.seconds(config.autoScaling.scaleOutCooldown),
			});
		}

		// Outputs
		new cdk.CfnOutput(this, "ClusterArn", {
			value: cluster.clusterArn,
			description: "ECS Cluster ARN",
		});

		new cdk.CfnOutput(this, "ServiceArn", {
			value: service.serviceArn,
			description: "ECS Service ARN",
		});

		new cdk.CfnOutput(this, "AlbDnsName", {
			value: alb.loadBalancerDnsName,
			description: "ALB DNS Name",
		});

		new cdk.CfnOutput(this, "LogGroupName", {
			value: logGroup.logGroupName,
			description: "CloudWatch Log Group",
		});

		if (certificate) {
			new cdk.CfnOutput(this, "CertificateArn", {
				value: certificate.certificateArn,
				description: "ACM Certificate ARN",
			});
		}

		new cdk.CfnOutput(this, "HttpsEnabled", {
			value: certificate ? "true" : "false",
			description: "Whether HTTPS is enabled",
		});

	}
}
