import { describe, expect, test } from "bun:test";

import { parseIntrospectionSchema } from "./graphql.js";

describe("parseIntrospectionSchema", () => {
  test("parses introspection response with queries", () => {
    const schema = {
      queryType: { name: "Query" },
      mutationType: null,
      types: [
        {
          name: "Query",
          kind: "OBJECT",
          fields: [
            {
              name: "users",
              description: "Get all users",
              args: [],
              type: {
                kind: "LIST",
                name: null,
                ofType: {
                  kind: "OBJECT",
                  name: "User",
                  ofType: null,
                },
              },
            },
            {
              name: "user",
              description: null,
              args: [
                {
                  name: "id",
                  description: "User ID",
                  type: {
                    kind: "NON_NULL",
                    name: null,
                    ofType: {
                      kind: "SCALAR",
                      name: "ID",
                      ofType: null,
                    },
                  },
                },
              ],
              type: {
                kind: "OBJECT",
                name: "User",
                ofType: null,
              },
            },
          ],
        },
        {
          name: "User",
          kind: "OBJECT",
          fields: [
            {
              name: "id",
              description: null,
              args: [],
              type: {
                kind: "NON_NULL",
                name: null,
                ofType: {
                  kind: "SCALAR",
                  name: "ID",
                  ofType: null,
                },
              },
            },
            {
              name: "name",
              description: null,
              args: [],
              type: {
                kind: "SCALAR",
                name: "String",
                ofType: null,
              },
            },
          ],
        },
      ],
    };

    const result = parseIntrospectionSchema(schema);

    expect(result.queries).toHaveLength(2);
    expect(result.mutations).toHaveLength(0);

    const usersQuery = result.queries.find((q) => q.name === "users");
    expect(usersQuery).toBeDefined();
    expect(usersQuery?.description).toBe("Get all users");
    expect(usersQuery?.returnType).toBe("[User]");
    expect(usersQuery?.returnFields).toHaveLength(2);

    const userQuery = result.queries.find((q) => q.name === "user");
    expect(userQuery).toBeDefined();
    expect(userQuery?.arguments).toHaveLength(1);
    const userQueryArg = userQuery?.arguments?.[0];
    expect(userQueryArg?.name).toBe("id");
    expect(userQueryArg?.required).toBe(true);
    expect(userQueryArg?.description).toBe("User ID");
  });

  test("parses introspection response with mutations", () => {
    const schema = {
      queryType: { name: "Query" },
      mutationType: { name: "Mutation" },
      types: [
        {
          name: "Query",
          kind: "OBJECT",
          fields: [
            {
              name: "users",
              args: [],
              type: {
                kind: "LIST",
                name: null,
                ofType: { kind: "OBJECT", name: "User" },
              },
            },
          ],
        },
        {
          name: "Mutation",
          kind: "OBJECT",
          fields: [
            {
              name: "createUser",
              args: [
                {
                  name: "name",
                  type: {
                    kind: "NON_NULL",
                    name: null,
                    ofType: { kind: "SCALAR", name: "String" },
                  },
                },
              ],
              type: { kind: "OBJECT", name: "User", ofType: null },
            },
          ],
        },
        {
          name: "User",
          kind: "OBJECT",
          fields: [
            {
              name: "id",
              args: [],
              type: {
                kind: "NON_NULL",
                name: null,
                ofType: { kind: "SCALAR", name: "ID" },
              },
            },
          ],
        },
      ],
    };

    const result = parseIntrospectionSchema(schema);

    expect(result.queries).toHaveLength(1);
    expect(result.mutations).toHaveLength(1);

    const createUser = result.mutations[0];
    expect(createUser?.name).toBe("createUser");
    expect(createUser?.operationType).toBe("mutation");
    const createUserArg = createUser?.arguments?.[0];
    expect(createUserArg?.name).toBe("name");
  });

  test("skips introspection fields", () => {
    const schema = {
      queryType: { name: "Query" },
      mutationType: null,
      types: [
        {
          name: "Query",
          kind: "OBJECT",
          fields: [
            {
              name: "__schema",
              args: [],
              type: { kind: "OBJECT", name: "__Schema", ofType: null },
            },
            {
              name: "__type",
              args: [],
              type: { kind: "OBJECT", name: "__Type", ofType: null },
            },
            {
              name: "users",
              args: [],
              type: {
                kind: "LIST",
                name: null,
                ofType: { kind: "OBJECT", name: "User" },
              },
            },
          ],
        },
        {
          name: "User",
          kind: "OBJECT",
          fields: [],
        },
      ],
    };

    const result = parseIntrospectionSchema(schema);

    expect(result.queries).toHaveLength(1);
    expect(result.queries[0]?.name).toBe("users");
  });

  test("handles empty types", () => {
    const schema = {
      queryType: null,
      mutationType: null,
      types: [],
    };

    const result = parseIntrospectionSchema(schema);

    expect(result.queries).toHaveLength(0);
    expect(result.mutations).toHaveLength(0);
  });

  test("handles NON_NULL wrapped LIST types", () => {
    const schema = {
      queryType: { name: "Query" },
      mutationType: null,
      types: [
        {
          name: "Query",
          kind: "OBJECT",
          fields: [
            {
              name: "users",
              args: [],
              type: {
                kind: "NON_NULL",
                name: null,
                ofType: {
                  kind: "LIST",
                  name: null,
                  ofType: {
                    kind: "NON_NULL",
                    name: null,
                    ofType: {
                      kind: "OBJECT",
                      name: "User",
                    },
                  },
                },
              },
            },
          ],
        },
        {
          name: "User",
          kind: "OBJECT",
          fields: [
            {
              name: "id",
              args: [],
              type: { kind: "SCALAR", name: "ID", ofType: null },
            },
          ],
        },
      ],
    };

    const result = parseIntrospectionSchema(schema);

    expect(result.queries[0]?.returnType).toBe("[User!]!");
    expect(result.queries[0]?.returnFields).toHaveLength(1);
  });
});
