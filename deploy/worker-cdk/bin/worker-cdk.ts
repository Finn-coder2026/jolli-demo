#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { EcrStack } from "../lib/ecr-stack";
import { MemoryDbStack } from "../lib/memorydb-stack";
import { WorkerStack } from "../lib/worker-stack";

const app = new cdk.App();

const env = {
	account: process.env.CDK_DEFAULT_ACCOUNT,
	region: process.env.CDK_DEFAULT_REGION || "us-west-2",
};

// Shared ECR repository for all environments
const ecrStack = new EcrStack(app, "JolliWorkerEcrStack", {
	env,
	description: "ECR repository for Jolli Worker images",
});

// Environment-specific stacks
const environments = ["dev", "preview", "prod"] as const;

for (const envName of environments) {
	// MemoryDB stack (Redis replacement with IAM auth)
	// Must be deployed before worker stack as workers depend on it
	new MemoryDbStack(app, `JolliMemoryDbStack-${envName}`, {
		env,
		description: `Jolli MemoryDB (Valkey) cluster for ${envName}`,
		environment: envName,
	});

	// Worker stack (ECS Fargate)
	new WorkerStack(app, `JolliWorkerStack-${envName}`, {
		env,
		description: `Jolli Worker ECS Fargate stack for ${envName}`,
		environment: envName,
		ecrRepository: ecrStack.repository,
	});
}

app.synth();
