/**
 * Tests for FrameworkDetector module.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	detectFramework,
	detectFrameworkForLanguage,
	getAllSupportedFrameworks,
	getExtractionStrategy,
	getSupportedFrameworks,
	getSupportedFrameworksForLanguage,
} from "./FrameworkDetector.js";

describe("FrameworkDetector", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "framework-detector-test-"));
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	describe("detectFramework", () => {
		it("should return unknown when no package.json exists", async () => {
			const result = await detectFramework(tempDir);

			expect(result.framework.name).toBe("unknown");
			expect(result.confidence).toBe(0.0);
		});

		it("should detect Fastify with @fastify/swagger (schema-enforced)", async () => {
			const pkg = {
				dependencies: {
					fastify: "^4.0.0",
					"@fastify/swagger": "^8.0.0",
				},
			};
			await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify(pkg));

			const result = await detectFramework(tempDir);

			expect(result.framework.name).toBe("fastify-swagger");
			expect(result.framework.category).toBe("schema-enforced");
			expect(result.hasOpenApiSupport).toBe(true);
			expect(result.confidence).toBe(0.95);
		});

		it("should detect plain Fastify (minimal)", async () => {
			const pkg = {
				dependencies: {
					fastify: "^4.0.0",
				},
			};
			await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify(pkg));

			const result = await detectFramework(tempDir);

			expect(result.framework.name).toBe("fastify");
			expect(result.framework.category).toBe("minimal");
			expect(result.hasOpenApiSupport).toBe(false);
		});

		it("should detect NestJS with swagger (schema-enforced)", async () => {
			const pkg = {
				dependencies: {
					"@nestjs/core": "^10.0.0",
					"@nestjs/swagger": "^7.0.0",
				},
			};
			await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify(pkg));

			const result = await detectFramework(tempDir);

			expect(result.framework.name).toBe("nestjs-swagger");
			expect(result.framework.category).toBe("schema-enforced");
		});

		it("should detect Express (minimal)", async () => {
			const pkg = {
				dependencies: {
					express: "^4.0.0",
				},
			};
			await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify(pkg));

			const result = await detectFramework(tempDir);

			expect(result.framework.name).toBe("express");
			expect(result.framework.category).toBe("minimal");
		});

		it("should detect Express with swagger-jsdoc (semi-structured)", async () => {
			const pkg = {
				dependencies: {
					express: "^4.0.0",
					"swagger-jsdoc": "^6.0.0",
				},
			};
			await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify(pkg));

			const result = await detectFramework(tempDir);

			expect(result.framework.name).toBe("express-swagger-jsdoc");
			expect(result.framework.category).toBe("semi-structured");
		});

		it("should detect Hono with zod-openapi (schema-enforced)", async () => {
			const pkg = {
				dependencies: {
					hono: "^3.0.0",
					"@hono/zod-openapi": "^0.5.0",
				},
			};
			await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify(pkg));

			const result = await detectFramework(tempDir);

			expect(result.framework.name).toBe("hono-openapi");
			expect(result.framework.category).toBe("schema-enforced");
		});

		it("should detect Koa (minimal)", async () => {
			const pkg = {
				dependencies: {
					koa: "^2.0.0",
				},
			};
			await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify(pkg));

			const result = await detectFramework(tempDir);

			expect(result.framework.name).toBe("koa");
			expect(result.framework.category).toBe("minimal");
		});

		it("should detect Next.js (minimal)", async () => {
			const pkg = {
				dependencies: {
					next: "^14.0.0",
				},
			};
			await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify(pkg));

			const result = await detectFramework(tempDir);

			expect(result.framework.name).toBe("nextjs");
			expect(result.framework.category).toBe("minimal");
		});

		it("should prefer schema-enforced over minimal when both present", async () => {
			const pkg = {
				dependencies: {
					fastify: "^4.0.0",
					"@fastify/swagger": "^8.0.0",
					express: "^4.0.0",
				},
			};
			await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify(pkg));

			const result = await detectFramework(tempDir);

			expect(result.framework.category).toBe("schema-enforced");
		});

		it("should include all matching frameworks", async () => {
			const pkg = {
				dependencies: {
					fastify: "^4.0.0",
					express: "^4.0.0",
				},
			};
			await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify(pkg));

			const result = await detectFramework(tempDir);

			expect(result.allMatches.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe("getExtractionStrategy", () => {
		it("should return full-schema for schema-enforced", () => {
			expect(getExtractionStrategy("schema-enforced")).toBe("full-schema");
		});

		it("should return jsdoc-annotation for semi-structured", () => {
			expect(getExtractionStrategy("semi-structured")).toBe("jsdoc-annotation");
		});

		it("should return basic-pattern for minimal", () => {
			expect(getExtractionStrategy("minimal")).toBe("basic-pattern");
		});
	});

	describe("getSupportedFrameworks", () => {
		it("should return all framework profiles", () => {
			const frameworks = getSupportedFrameworks();

			expect(frameworks.length).toBeGreaterThan(5);
			expect(frameworks.some(f => f.name === "fastify-swagger")).toBe(true);
			expect(frameworks.some(f => f.name === "express")).toBe(true);
		});
	});

	describe("detectFrameworkForLanguage", () => {
		describe("Python", () => {
			it("should detect FastAPI (schema-enforced)", async () => {
				await fs.writeFile(path.join(tempDir, "requirements.txt"), "fastapi==0.100.0\nuvicorn==0.23.0");

				const result = await detectFrameworkForLanguage(tempDir, "python");

				expect(result.framework.name).toBe("fastapi");
				expect(result.framework.category).toBe("schema-enforced");
				expect(result.confidence).toBeGreaterThan(0.5);
			});

			it("should detect Flask (minimal)", async () => {
				await fs.writeFile(path.join(tempDir, "requirements.txt"), "flask==2.3.0");

				const result = await detectFrameworkForLanguage(tempDir, "python");

				expect(result.framework.name).toBe("flask");
				expect(result.framework.category).toBe("minimal");
			});

			it("should detect Flask + flask-openapi3 (semi-structured)", async () => {
				await fs.writeFile(path.join(tempDir, "requirements.txt"), "flask==2.3.0\nflask-openapi3==2.0.0");

				const result = await detectFrameworkForLanguage(tempDir, "python");

				expect(result.framework.name).toBe("flask-openapi");
				expect(result.framework.category).toBe("semi-structured");
			});

			it("should parse pyproject.toml dependencies", async () => {
				const pyproject = `
[project]
dependencies = [
    "fastapi>=0.100.0",
    "uvicorn>=0.23.0",
]`;
				await fs.writeFile(path.join(tempDir, "pyproject.toml"), pyproject);

				const result = await detectFrameworkForLanguage(tempDir, "python");

				expect(result.framework.name).toBe("fastapi");
			});
		});

		describe("Java", () => {
			it("should detect Spring Boot (minimal)", async () => {
				const pom = `<?xml version="1.0"?>
<project>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
    </dependencies>
</project>`;
				await fs.writeFile(path.join(tempDir, "pom.xml"), pom);

				const result = await detectFrameworkForLanguage(tempDir, "java");

				expect(result.framework.name).toBe("spring-boot");
				expect(result.framework.category).toBe("minimal");
			});

			it("should detect Spring Boot + springdoc (schema-enforced)", async () => {
				const pom = `<?xml version="1.0"?>
<project>
    <dependencies>
        <dependency>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
        </dependency>
    </dependencies>
</project>`;
				await fs.writeFile(path.join(tempDir, "pom.xml"), pom);

				const result = await detectFrameworkForLanguage(tempDir, "java");

				expect(result.framework.name).toBe("spring-springdoc");
				expect(result.framework.category).toBe("schema-enforced");
			});

			it("should parse build.gradle dependencies", async () => {
				const gradle = `
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
}`;
				await fs.writeFile(path.join(tempDir, "build.gradle"), gradle);

				const result = await detectFrameworkForLanguage(tempDir, "java");

				expect(result.framework.name).toBe("spring-boot");
			});
		});

		describe("Go", () => {
			it("should detect Gin (minimal)", async () => {
				const gomod = `module example.com/test

go 1.21

require github.com/gin-gonic/gin v1.9.0`;
				await fs.writeFile(path.join(tempDir, "go.mod"), gomod);

				const result = await detectFrameworkForLanguage(tempDir, "go");

				expect(result.framework.name).toBe("gin");
				expect(result.framework.category).toBe("minimal");
			});

			it("should detect Gin + swag (semi-structured)", async () => {
				const gomod = `module example.com/test

go 1.21

require (
	github.com/gin-gonic/gin v1.9.0
	github.com/swaggo/swag v1.16.0
	github.com/swaggo/gin-swagger v1.6.0
)`;
				await fs.writeFile(path.join(tempDir, "go.mod"), gomod);

				const result = await detectFrameworkForLanguage(tempDir, "go");

				expect(result.framework.name).toBe("gin-swag");
				expect(result.framework.category).toBe("semi-structured");
			});

			it("should detect Echo (minimal)", async () => {
				const gomod = `module example.com/test

require github.com/labstack/echo/v4 v4.11.0`;
				await fs.writeFile(path.join(tempDir, "go.mod"), gomod);

				const result = await detectFrameworkForLanguage(tempDir, "go");

				expect(result.framework.name).toBe("echo");
			});
		});

		describe("Ruby", () => {
			it("should detect Rails (minimal)", async () => {
				await fs.writeFile(path.join(tempDir, "Gemfile"), "gem 'rails', '~> 7.0'");

				const result = await detectFrameworkForLanguage(tempDir, "ruby");

				expect(result.framework.name).toBe("rails");
				expect(result.framework.category).toBe("minimal");
			});

			it("should detect Rails + rswag (semi-structured)", async () => {
				const gemfile = `source 'https://rubygems.org'
gem 'rails', '~> 7.0'
gem 'rswag'`;
				await fs.writeFile(path.join(tempDir, "Gemfile"), gemfile);

				const result = await detectFrameworkForLanguage(tempDir, "ruby");

				expect(result.framework.name).toBe("rails-rswag");
				expect(result.framework.category).toBe("semi-structured");
			});

			it("should detect Sinatra (minimal)", async () => {
				await fs.writeFile(path.join(tempDir, "Gemfile"), "gem 'sinatra'");

				const result = await detectFrameworkForLanguage(tempDir, "ruby");

				expect(result.framework.name).toBe("sinatra");
			});
		});

		describe("C#", () => {
			it("should detect ASP.NET Core (minimal)", async () => {
				const csproj = `<Project Sdk="Microsoft.NET.Sdk.Web">
    <ItemGroup>
        <FrameworkReference Include="Microsoft.AspNetCore.App" />
    </ItemGroup>
</Project>`;
				await fs.writeFile(path.join(tempDir, "test.csproj"), csproj);

				const result = await detectFrameworkForLanguage(tempDir, "csharp");

				expect(result.framework.name).toBe("aspnet-core");
				expect(result.framework.category).toBe("minimal");
			});

			it("should detect ASP.NET + Swashbuckle (schema-enforced)", async () => {
				const csproj = `<Project Sdk="Microsoft.NET.Sdk.Web">
    <ItemGroup>
        <FrameworkReference Include="Microsoft.AspNetCore.App" />
        <PackageReference Include="Swashbuckle.AspNetCore" Version="6.5.0" />
    </ItemGroup>
</Project>`;
				await fs.writeFile(path.join(tempDir, "test.csproj"), csproj);

				const result = await detectFrameworkForLanguage(tempDir, "csharp");

				expect(result.framework.name).toBe("aspnet-swashbuckle");
				expect(result.framework.category).toBe("schema-enforced");
			});
		});

		describe("Rust", () => {
			it("should detect Actix-web (minimal)", async () => {
				const cargo = `[package]
name = "test"
version = "0.1.0"

[dependencies]
actix-web = "4.3"`;
				await fs.writeFile(path.join(tempDir, "Cargo.toml"), cargo);

				const result = await detectFrameworkForLanguage(tempDir, "rust");

				expect(result.framework.name).toBe("actix-web");
				expect(result.framework.category).toBe("minimal");
			});

			it("should detect Actix-web + utoipa (schema-enforced)", async () => {
				const cargo = `[package]
name = "test"

[dependencies]
actix-web = "4.3"
utoipa = "4.0"`;
				await fs.writeFile(path.join(tempDir, "Cargo.toml"), cargo);

				const result = await detectFrameworkForLanguage(tempDir, "rust");

				expect(result.framework.name).toBe("actix-utoipa");
				expect(result.framework.category).toBe("schema-enforced");
			});

			it("should detect Axum (minimal)", async () => {
				const cargo = `[package]
name = "test"

[dependencies]
axum = "0.6"`;
				await fs.writeFile(path.join(tempDir, "Cargo.toml"), cargo);

				const result = await detectFrameworkForLanguage(tempDir, "rust");

				expect(result.framework.name).toBe("axum");
			});
		});

		describe("PHP", () => {
			it("should detect Laravel (minimal)", async () => {
				const composer = {
					require: {
						"laravel/framework": "^10.0",
					},
				};
				await fs.writeFile(path.join(tempDir, "composer.json"), JSON.stringify(composer));

				const result = await detectFrameworkForLanguage(tempDir, "php");

				expect(result.framework.name).toBe("laravel");
				expect(result.framework.category).toBe("minimal");
			});

			it("should detect Laravel + L5-Swagger (schema-enforced)", async () => {
				const composer = {
					require: {
						"laravel/framework": "^10.0",
						"darkaonline/l5-swagger": "^8.0",
					},
				};
				await fs.writeFile(path.join(tempDir, "composer.json"), JSON.stringify(composer));

				const result = await detectFrameworkForLanguage(tempDir, "php");

				expect(result.framework.name).toBe("laravel-swagger");
				expect(result.framework.category).toBe("schema-enforced");
			});

			it("should detect Symfony (minimal)", async () => {
				const composer = {
					require: {
						"symfony/framework-bundle": "^6.3",
					},
				};
				await fs.writeFile(path.join(tempDir, "composer.json"), JSON.stringify(composer));

				const result = await detectFrameworkForLanguage(tempDir, "php");

				expect(result.framework.name).toBe("symfony");
			});
		});

		describe("Unsupported language", () => {
			it("should return unknown for unsupported language", async () => {
				const result = await detectFrameworkForLanguage(tempDir, "cobol");

				expect(result.framework.name).toBe("unknown");
				expect(result.confidence).toBe(0.0);
			});
		});
	});

	describe("getSupportedFrameworksForLanguage", () => {
		it("should return Python frameworks", () => {
			const frameworks = getSupportedFrameworksForLanguage("python");

			expect(frameworks.length).toBeGreaterThan(3);
			expect(frameworks.some(f => f.name === "fastapi")).toBe(true);
			expect(frameworks.some(f => f.name === "flask")).toBe(true);
		});

		it("should return Go frameworks", () => {
			const frameworks = getSupportedFrameworksForLanguage("go");

			expect(frameworks.length).toBeGreaterThan(3);
			expect(frameworks.some(f => f.name === "gin")).toBe(true);
			expect(frameworks.some(f => f.name === "echo")).toBe(true);
		});

		it("should return empty array for unsupported language", () => {
			const frameworks = getSupportedFrameworksForLanguage("cobol");

			expect(frameworks).toEqual([]);
		});
	});

	describe("getAllSupportedFrameworks", () => {
		it("should return frameworks from all languages", () => {
			const frameworks = getAllSupportedFrameworks();

			// Should include frameworks from multiple languages
			expect(frameworks.length).toBeGreaterThan(30);
			expect(frameworks.some(f => f.name === "fastify")).toBe(true); // JS
			expect(frameworks.some(f => f.name === "fastapi")).toBe(true); // Python
			expect(frameworks.some(f => f.name === "spring-boot")).toBe(true); // Java
			expect(frameworks.some(f => f.name === "gin")).toBe(true); // Go
			expect(frameworks.some(f => f.name === "rails")).toBe(true); // Ruby
			expect(frameworks.some(f => f.name === "actix-web")).toBe(true); // Rust
			expect(frameworks.some(f => f.name === "laravel")).toBe(true); // PHP
		});
	});
});
