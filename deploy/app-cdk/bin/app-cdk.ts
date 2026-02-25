#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { AppStack } from "../lib/app-stack";
import { EcrStack } from "../lib/ecr-stack";

const app = new cdk.App();

const env = {
	account: process.env.CDK_DEFAULT_ACCOUNT,
	region: process.env.CDK_DEFAULT_REGION || "us-west-2",
};

// Shared ECR repository for all environments
const ecrStack = new EcrStack(app, "JolliAppEcrStack", {
	env,
	description: "ECR repository for Jolli App images",
});

// Environment-specific app stacks
const environments = ["dev", "preview", "prod"] as const;

// ACM certificate ARNs for HTTPS (optional - HTTP only if not provided)
const certificateArns: Partial<Record<(typeof environments)[number], string>> = {
	dev: "arn:aws:acm:us-west-2:307926602659:certificate/5629e5c7-979c-4096-9361-a00e8a9fdf54",
	preview: "arn:aws:acm:us-west-2:307926602659:certificate/ce16a1e1-c791-4a27-b47c-9d8abbc07cc6",
	prod: "arn:aws:acm:us-west-2:307926602659:certificate/217bd52a-7f79-44de-9354-926b13dc270f",
};

for (const envName of environments) {
	new AppStack(app, `JolliAppStack-${envName}`, {
		env,
		description: `Jolli App ECS EC2 stack for ${envName}`,
		environment: envName,
		ecrRepository: ecrStack.repository,
		certificateArn: certificateArns[envName],
	});
}

app.synth();
