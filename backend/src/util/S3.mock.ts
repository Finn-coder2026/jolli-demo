import type { S3 } from "./S3";

export function mockS3(partial?: Partial<S3>): S3 {
	return {
		count: 0,
		gzipBytes: 0,
		jsonBytes: 0,
		listKeys: vi.fn(),
		readJson: vi.fn(),
		writeJson: vi.fn(),
		...partial,
	};
}
