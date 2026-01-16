import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import {
  extractParameters,
  formatParametersSummary,
  parseOpenApiSpec,
} from "./openapi.js";

describe("parseOpenApiSpec (OpenAPI 3 fixture)", () => {
  const specPath = join(
    process.cwd(),
    "tests",
    "testdata",
    "petstore-openapi-3.yaml",
  );

  test("parses version, title, and endpoints from petstore spec", async () => {
    const result = await parseOpenApiSpec(specPath);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.version).toBe("3.0.4");
    expect(result.value.title).toBe("Swagger Petstore - OpenAPI 3.0");

    const endpoint = result.value.endpoints.find(
      (e) => e.method === "GET" && e.path === "/pet/findByStatus",
    );
    expect(endpoint).toBeDefined();

    const params = extractParameters(endpoint?.parameters);
    expect(params).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "status",
          location: "query",
          required: true,
        }),
      ]),
    );
    expect(formatParametersSummary(endpoint?.parameters)).toBe(
      "status: string",
    );
  });

  test("filters header parameters from extracted list", async () => {
    const result = await parseOpenApiSpec(specPath);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const endpoint = result.value.endpoints.find(
      (e) => e.method === "DELETE" && e.path === "/pet/{petId}",
    );
    expect(endpoint).toBeDefined();

    const params = extractParameters(endpoint?.parameters);
    const names = params.map((p) => p.name);
    expect(names).toEqual(["petId"]);
  });
});
