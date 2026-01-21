import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface S3 {
	readonly count: number;
	readonly gzipBytes: number;
	readonly jsonBytes: number;
	listKeys(prefix: string): Promise<Array<string>>;
	readJson<T>(key: string): Promise<T | undefined>;
	writeJson(key: string, data: object): Promise<void>;
}

export function createS3(bucket: string): S3 {
	const gzipAsync = promisify(gzip);
	const gunzipAsync = promisify(gunzip);

	const client = new S3Client({
		region: process.env.AWS_REGION || "us-west-2",
		profile: process.env.AWS_PROFILE || "jolli",
	});

	const s3 = { count: 0, gzipBytes: 0, jsonBytes: 0, listKeys, readJson, writeJson };
	return s3;

	async function listKeys(prefix: string): Promise<Array<string>> {
		const keys: Array<string> = [];
		let continuationToken: string | undefined;

		do {
			const command = new ListObjectsV2Command({
				Bucket: bucket,
				Prefix: prefix,
				ContinuationToken: continuationToken,
			});

			const response = await client.send(command);

			for (const object of response.Contents ?? []) {
				if (object.Key) {
					keys.push(object.Key);
				}
			}

			continuationToken = response.NextContinuationToken;
		} while (continuationToken);

		return keys;
	}

	async function readJson<T>(key: string): Promise<T | undefined> {
		try {
			const command = new GetObjectCommand({
				Bucket: bucket,
				Key: key,
			});

			const response = await client.send(command);
			if (!response.Body) {
				return;
			}

			const gzipData = await response.Body.transformToByteArray();
			const jsonData = await gunzipAsync(Buffer.from(gzipData));

			s3.count++;
			s3.gzipBytes += gzipData.length;
			s3.jsonBytes += jsonData.length;

			return JSON.parse(jsonData.toString()) as T | undefined;
		} catch (error) {
			if (error instanceof Error && !error.message.includes("NoSuchKey")) {
				return;
			}
			throw error;
		}
	}

	async function writeJson(key: string, data: object): Promise<void> {
		const jsonData = JSON.stringify(data, null, 2);
		const gzipData = await gzipAsync(jsonData);

		s3.count++;
		s3.gzipBytes += gzipData.length;
		s3.jsonBytes += jsonData.length;

		const command = new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			Body: gzipData,
			ContentType: "application/json",
			ContentEncoding: "gzip",
		});

		await client.send(command);
	}
}
