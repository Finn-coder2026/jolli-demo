import type { Doc } from "../model/Doc";
import { getLog } from "../util/Logger";
import { gunzipSync, gzipSync } from "node:zlib";
import type { DocContentMetadata } from "jolli-common";

const log = getLog(import.meta);

/**
 * Service for document history business logic (no DB operations).
 */
export class DocHistoryService {
	/**
	 * Extracts the referVersion field from a document's contentMetadata.
	 * Returns the version number if present and valid, otherwise returns undefined.
	 *
	 * @param doc the document to extract referVersion from
	 * @returns the referVersion number or undefined if not present/invalid
	 */
	getReferVersion(doc: Doc | null | undefined): number | undefined {
		if (!doc) {
			log.debug("getReferVersion: doc is null or undefined");
			return;
		}

		const contentMetadata = doc.contentMetadata;

		if (!contentMetadata) {
			log.debug("getReferVersion: contentMetadata is null or undefined for doc %d", doc.id);
			return;
		}

		if (typeof contentMetadata !== "object") {
			log.warn("getReferVersion: contentMetadata is not an object for doc %d", doc.id);
			return;
		}

		const metadata = contentMetadata as Record<string, unknown>;
		const referVersion = metadata.referVersion;

		if (referVersion === undefined || referVersion === null) {
			log.debug("getReferVersion: referVersion field is not present for doc %d", doc.id);
			return;
		}

		if (typeof referVersion === "number") {
			if (Number.isNaN(referVersion) || !Number.isFinite(referVersion)) {
				log.warn("getReferVersion: referVersion is NaN or Infinity for doc %d", doc.id);
				return;
			}
			return referVersion;
		}

		if (typeof referVersion === "string") {
			const parsed = Number.parseInt(referVersion, 10);
			if (Number.isNaN(parsed)) {
				log.warn(
					"getReferVersion: referVersion string '%s' cannot be parsed to number for doc %d",
					referVersion,
					doc.id,
				);
				return;
			}
			return parsed;
		}

		log.warn("getReferVersion: referVersion has unexpected type '%s' for doc %d", typeof referVersion, doc.id);
		return;
	}

	/**
	 * Compresses a document into a gzip-compressed JSON buffer for storage.
	 *
	 * @param doc the document to compress
	 * @returns gzip-compressed buffer of the JSON-serialized document
	 */
	compressDocSnapshot(doc: Doc): Buffer {
		try {
			const jsonString = JSON.stringify(doc);
			const compressed = gzipSync(Buffer.from(jsonString, "utf-8"));
			log.debug(
				"compressDocSnapshot: compressed doc %d from %d to %d bytes",
				doc.id,
				jsonString.length,
				compressed.length,
			);
			return compressed;
		} catch (error) {
			log.error(error, "compressDocSnapshot: failed to compress doc %d", doc.id);
			throw error;
		}
	}

	/**
	 * Decompresses a gzip-compressed buffer back into a document object.
	 *
	 * @param snapshot the gzip-compressed buffer
	 * @returns the decompressed document object
	 */
	decompressDocSnapshot(snapshot: Buffer): Doc {
		try {
			const decompressed = gunzipSync(snapshot);
			const jsonString = decompressed.toString("utf-8");
			const doc = JSON.parse(jsonString) as Doc;
			log.debug("decompressDocSnapshot: decompressed doc %d", doc.id);
			return doc;
		} catch (error) {
			log.error(error, "decompressDocSnapshot: failed to decompress snapshot");
			throw error;
		}
	}

	/**
	 * Removes the referVersion field from contentMetadata.
	 * Returns a new contentMetadata object without the referVersion field.
	 *
	 * @param contentMetadata the original contentMetadata
	 * @returns new contentMetadata without referVersion, or undefined if input is undefined
	 */
	removeReferVersion(contentMetadata: DocContentMetadata | undefined): DocContentMetadata | undefined {
		if (!contentMetadata) {
			return;
		}

		const metadata = { ...contentMetadata } as Record<string, unknown>;
		if ("referVersion" in metadata) {
			delete metadata.referVersion;
			log.debug("removeReferVersion: removed referVersion from contentMetadata");
		}

		return metadata as DocContentMetadata;
	}

	/**
	 * Determines whether a version history record should be created for the given document.
	 * Returns true if the document exists and has no referVersion in its contentMetadata.
	 *
	 * @param doc the document to check (can be undefined if doc doesn't exist)
	 * @returns true if version history should be saved, false otherwise
	 */
	shouldSaveVersionHistory(doc: Doc | undefined): boolean {
		if (!doc) {
			log.debug("shouldSaveVersionHistory: doc does not exist, skipping version history");
			return false;
		}

		const referVersion = this.getReferVersion(doc);
		if (referVersion !== undefined) {
			log.debug(
				"shouldSaveVersionHistory: doc %d has referVersion %d, skipping version history",
				doc.id,
				referVersion,
			);
			return false;
		}

		log.debug("shouldSaveVersionHistory: doc %d should save version history", doc.id);
		return true;
	}

	/**
	 * Sets the referVersion field in contentMetadata.
	 * Returns a new contentMetadata object with the referVersion field set.
	 *
	 * @param contentMetadata the original contentMetadata
	 * @param referVersion the version number to set
	 * @returns new contentMetadata with referVersion set
	 */
	setReferVersion(contentMetadata: DocContentMetadata | undefined, referVersion: number): DocContentMetadata {
		const metadata = contentMetadata ? { ...contentMetadata } : {};
		(metadata as Record<string, unknown>).referVersion = referVersion;
		log.debug("setReferVersion: set referVersion to %d", referVersion);
		return metadata as DocContentMetadata;
	}
}
