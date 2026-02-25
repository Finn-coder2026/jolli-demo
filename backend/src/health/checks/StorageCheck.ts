import { getConfig } from "../../config/Config";
import type { CheckResult, HealthCheck } from "../HealthTypes";
import { HeadBucketCommand, type S3Client } from "@aws-sdk/client-s3";

/**
 * Creates a health check for S3 storage connectivity.
 * Uses HeadBucketCommand to verify the bucket is accessible.
 *
 * Returns 'disabled' if IMAGE_S3_ENV is not configured (indicating S3 is not in use).
 */
export function createStorageCheck(s3Client: S3Client): HealthCheck {
	return {
		name: "storage",
		critical: false,
		check,
	};

	async function check(): Promise<CheckResult> {
		const config = getConfig();
		const bucketName = `jolli-images-${config.IMAGE_S3_ENV}`;

		// If no S3 env configured, consider storage disabled
		if (!config.IMAGE_S3_ENV || config.IMAGE_S3_ENV === "local") {
			return {
				status: "disabled",
				message: "Storage not configured",
			};
		}

		const start = Date.now();
		try {
			await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
			return {
				status: "healthy",
				latencyMs: Date.now() - start,
			};
		} catch (_error) {
			return {
				status: "unhealthy",
				latencyMs: Date.now() - start,
				message: "Storage inaccessible",
			};
		}
	}
}
