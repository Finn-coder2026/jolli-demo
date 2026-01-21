import { getConfig } from "../../config/Config";
import { getEnvOrError } from "../../util/Env";
import { BaseLangGraphAgent } from "./BaseLangGraphAgent";
import { ChatBedrockConverse } from "@langchain/aws";

/**
 * AWS Bedrock-specific agent implementation
 *
 * Supports AWS Bedrock models including:
 * - Anthropic Claude models on Bedrock
 * - Amazon Titan models
 * - Meta Llama models
 * - Mistral AI models
 * - Cohere models
 *
 * Note: AWS credentials should be configured via environment variables or AWS config files.
 * The apiKey parameter is optional and primarily used for explicit credential configuration.
 */
export class AWSBedrockAgent extends BaseLangGraphAgent {
	private readonly modelName: string;

	constructor(apiKey: string, model = "anthropic.claude-3-5-sonnet-20240620-v1:0", systemPrompt?: string) {
		const config = getConfig();
		const llm = new ChatBedrockConverse({
			model,
			region: config.AWS_REGION,
			credentials: {
				accessKeyId: apiKey,
				secretAccessKey: getEnvOrError("AWS_SECRET_ACCESS_KEY"),
			},
		});

		super(llm, systemPrompt);
		this.modelName = model;
	}

	protected getProviderName(): string {
		return "aws_bedrock";
	}

	protected getModelName(): string {
		return this.modelName;
	}
}
