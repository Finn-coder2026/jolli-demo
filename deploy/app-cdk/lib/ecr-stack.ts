import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import type { Construct } from "constructs";

export class EcrStack extends cdk.Stack {
	public readonly repository: ecr.Repository;

	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		this.repository = new ecr.Repository(this, "JolliAppRepository", {
			repositoryName: "jolli-app",
			imageScanOnPush: true,
			removalPolicy: cdk.RemovalPolicy.RETAIN,
			lifecycleRules: [
				{
					// Remove untagged images quickly to save storage
					description: "Expire untagged images after 1 day",
					maxImageAge: cdk.Duration.days(1),
					rulePriority: 1,
					tagStatus: ecr.TagStatus.UNTAGGED,
				},
				{
					// Keep a reasonable number of commit-SHA tagged images for rollback
					// Environment tags (dev, preview, prod, latest) are preserved because
					// they don't match the tagPrefixList filter
					description: "Keep last 30 commit-SHA tagged images",
					maxImageCount: 30,
					rulePriority: 2,
					tagStatus: ecr.TagStatus.TAGGED,
					tagPrefixList: ["sha-"],
				},
			],
		});

		// Output the repository URI for use in CI/CD
		new cdk.CfnOutput(this, "RepositoryUri", {
			value: this.repository.repositoryUri,
			description: "ECR Repository URI",
			exportName: "JolliAppEcrUri",
		});

		new cdk.CfnOutput(this, "RepositoryArn", {
			value: this.repository.repositoryArn,
			description: "ECR Repository ARN",
			exportName: "JolliAppEcrArn",
		});
	}
}
