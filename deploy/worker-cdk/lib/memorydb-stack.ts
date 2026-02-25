import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as memorydb from "aws-cdk-lib/aws-memorydb";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

type Environment = "dev" | "preview" | "prod";

interface MemoryDbStackProps extends cdk.StackProps {
	environment: Environment;
}

/**
 * Environment-specific configuration for MemoryDB clusters.
 *
 * Dev: Single node (no replication) for cost savings
 * Preview: Multi-AZ with 1 replica for testing HA scenarios
 * Prod: Multi-AZ with 1 replica, larger instance type
 */
const ENV_CONFIG: Record<
	Environment,
	{
		nodeType: string;
		numShards: number;
		numReplicasPerShard: number;
		snapshotRetentionLimit: number;
	}
> = {
	dev: {
		nodeType: "db.t4g.small",
		numShards: 1,
		numReplicasPerShard: 0, // Single node for dev (cost savings)
		snapshotRetentionLimit: 1,
	},
	preview: {
		nodeType: "db.t4g.small",
		numShards: 1,
		numReplicasPerShard: 1, // Multi-AZ for preview
		snapshotRetentionLimit: 3,
	},
	prod: {
		nodeType: "db.r7g.large",
		numShards: 1,
		numReplicasPerShard: 1, // Multi-AZ for prod
		snapshotRetentionLimit: 7,
	},
};

/**
 * CDK Stack for Amazon MemoryDB (Valkey-compatible).
 *
 * This stack creates a MemoryDB cluster with password authentication to replace
 * the existing Stackhero Redis instance. Key features:
 * - Password authentication with auto-generated secrets stored in Secrets Manager
 * - TLS encryption in transit
 * - Deployed in the shared worker VPC for low latency
 * - Multi-AZ in preview/prod for high availability
 */
export class MemoryDbStack extends cdk.Stack {
	public readonly clusterEndpoint: string;
	public readonly clusterPort: string;

	constructor(scope: Construct, id: string, props: MemoryDbStackProps) {
		super(scope, id, props);

		const { environment } = props;
		const config = ENV_CONFIG[environment];

		// Import existing worker VPC by tag lookup
		// Both app and workers share this VPC (see app-stack.ts:96-100)
		const vpc = ec2.Vpc.fromLookup(this, "WorkerVpc", {
			tags: { Name: `jolli-worker-vpc-${environment}` },
		});

		// Security group for MemoryDB cluster
		const securityGroup = new ec2.SecurityGroup(this, "MemoryDbSecurityGroup", {
			vpc,
			securityGroupName: `jolli-memorydb-sg-${environment}`,
			description: "Security group for Jolli MemoryDB cluster",
		});

		// Allow access from app and worker security groups
		// App uses awsvpc network mode with a task-specific security group
		const appTaskSg = ec2.SecurityGroup.fromLookupByName(
			this,
			"AppTaskSg",
			`jolli-app-task-sg-${environment}`,
			vpc,
		);
		const workerSg = ec2.SecurityGroup.fromLookupByName(
			this,
			"WorkerSg",
			`jolli-worker-sg-${environment}`,
			vpc,
		);

		securityGroup.addIngressRule(appTaskSg, ec2.Port.tcp(6379), "Allow from app ECS tasks");
		securityGroup.addIngressRule(workerSg, ec2.Port.tcp(6379), "Allow from worker tasks");

		// Subnet group - deploy in private subnets
		const subnetGroup = new memorydb.CfnSubnetGroup(this, "SubnetGroup", {
			subnetGroupName: `jolli-memorydb-subnet-${environment}`,
			subnetIds: vpc.privateSubnets.map((s) => s.subnetId),
			description: `Subnet group for Jolli MemoryDB ${environment}`,
		});

		// Create a secret for the MemoryDB password
		// Password is auto-generated and stored in Secrets Manager
		const passwordSecret = new secretsmanager.Secret(this, "MemoryDbPassword", {
			secretName: `jolli/memorydb/${environment}/password`,
			description: `MemoryDB password for Jolli ${environment}`,
			generateSecretString: {
				excludePunctuation: true, // MemoryDB passwords can't have certain special chars
				passwordLength: 32,
			},
		});

		// Password-authenticated user
		// Access string grants full access to all keys and pub/sub channels
		const user = new memorydb.CfnUser(this, "MemoryDbUser", {
			userName: `jolli-user-${environment}`,
			accessString: "on ~* &* +@all", // Full access to keys, channels, and commands
			authenticationMode: {
				Type: "password",
				Passwords: [passwordSecret.secretValue.unsafeUnwrap()],
			},
		});

		// ACL that uses the password user
		const acl = new memorydb.CfnACL(this, "Acl", {
			aclName: `jolli-memorydb-acl-${environment}`,
			userNames: [user.userName],
		});
		acl.addDependency(user);

		// MemoryDB Cluster
		const cluster = new memorydb.CfnCluster(this, "Cluster", {
			clusterName: `jolli-memorydb-${environment}`,
			aclName: acl.aclName,
			nodeType: config.nodeType,
			numShards: config.numShards,
			numReplicasPerShard: config.numReplicasPerShard,
			subnetGroupName: subnetGroup.subnetGroupName,
			securityGroupIds: [securityGroup.securityGroupId],
			tlsEnabled: true, // Required for secure connections
			autoMinorVersionUpgrade: true,
			snapshotRetentionLimit: config.snapshotRetentionLimit,
			engineVersion: "7.1", // Valkey-compatible version
			description: `Jolli MemoryDB cluster for ${environment}`,
		});
		cluster.addDependency(subnetGroup);
		cluster.addDependency(acl);

		// Store endpoint for outputs
		this.clusterEndpoint = cluster.attrClusterEndpointAddress;
		this.clusterPort = "6379"; // MemoryDB always uses port 6379

		// CloudFormation Outputs
		new cdk.CfnOutput(this, "ClusterEndpoint", {
			value: this.clusterEndpoint,
			description: "MemoryDB Cluster Endpoint Address",
			exportName: `jolli-memorydb-endpoint-${environment}`,
		});

		new cdk.CfnOutput(this, "UserName", {
			value: user.userName,
			description: "User name for MemoryDB authentication",
			exportName: `jolli-memorydb-user-${environment}`,
		});

		new cdk.CfnOutput(this, "PasswordSecretArn", {
			value: passwordSecret.secretArn,
			description: "ARN of the Secrets Manager secret containing the MemoryDB password",
			exportName: `jolli-memorydb-password-secret-${environment}`,
		});
	}
}
