import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import type { Construct } from "constructs";

export class EcrStack extends cdk.Stack {
	public readonly repository: ecr.Repository;

	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		this.repository = new ecr.Repository(this, "JolliWorkerRepository", {
			repositoryName: "jolli-worker",
			imageScanOnPush: true,
			removalPolicy: cdk.RemovalPolicy.RETAIN,
			lifecycleRules: [
				{
					description: "Keep last 10 images",
					maxImageCount: 10,
					rulePriority: 1,
					tagStatus: ecr.TagStatus.ANY,
				},
			],
		});

		// Output the repository URI for use in CI/CD
		new cdk.CfnOutput(this, "RepositoryUri", {
			value: this.repository.repositoryUri,
			description: "ECR Repository URI",
			exportName: "JolliWorkerEcrUri",
		});

		new cdk.CfnOutput(this, "RepositoryArn", {
			value: this.repository.repositoryArn,
			description: "ECR Repository ARN",
			exportName: "JolliWorkerEcrArn",
		});
	}
}
