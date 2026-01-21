import type { OpenAPIV2, OpenAPIV3, OpenAPIV3_1 } from "openapi-types";

export type OpenAPISpec = OpenAPIV2.Document | OpenAPIV3.Document | OpenAPIV3_1.Document;

export interface ScanResult {
	filePath: string;
	fileName: string;
	version: string;
	title: string;
	description: string;
	endpointCount: number;
	spec: OpenAPISpec;
	valid: boolean;
	errors?: Array<string>;
}

export interface ScanProgress {
	current: number;
	total: number;
	percentage: number;
}

export interface EndpointInfo {
	path: string;
	method: string;
	summary?: string;
	description?: string;
	operationId?: string;
	tags?: Array<string>;
	parameters?: Array<OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject>;
	requestBody?: OpenAPIV3.RequestBodyObject | OpenAPIV3.ReferenceObject;
	responses?: OpenAPIV3.ResponsesObject;
}

export interface ParsedAPI {
	title: string;
	version: string;
	description?: string;
	servers?: Array<string>;
	endpoints: Array<EndpointInfo>;
	tags?: Array<string>;
	securitySchemes?: OpenAPIV3.ComponentsObject["securitySchemes"];
}
