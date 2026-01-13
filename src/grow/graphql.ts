export interface GraphQLArgument {
  name: string;
  type: string;
  description?: string;
  required: boolean;
}

export interface GraphQLField {
  name: string;
  type: string;
  description?: string;
  required: boolean;
}

export interface GraphQLOperation {
  name: string;
  operationType: "query" | "mutation";
  description?: string;
  arguments?: GraphQLArgument[];
  returnType: string;
  returnFields?: GraphQLField[];
}

export interface GraphQLOperationWithFieldMapping extends GraphQLOperation {
  selectedReturnFields?: string[];
}

interface ParsedGraphQLSchema {
  title?: string;
  queries: GraphQLOperation[];
  mutations: GraphQLOperation[];
}

type ParseResult =
  | { ok: true; value: ParsedGraphQLSchema }
  | { ok: false; error: string };

const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      types {
        name
        kind
        description
        fields {
          name
          description
          args {
            name
            description
            type {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                  }
                }
              }
            }
          }
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`;

interface IntrospectionTypeRef {
  kind: string;
  name: string | null;
  ofType?: IntrospectionTypeRef | null;
}

interface IntrospectionArg {
  name: string;
  description?: string | null;
  type: IntrospectionTypeRef;
}

interface IntrospectionField {
  name: string;
  description?: string | null;
  args: IntrospectionArg[];
  type: IntrospectionTypeRef;
}

interface IntrospectionType {
  name: string;
  kind: string;
  description?: string | null;
  fields?: IntrospectionField[] | null;
}

interface IntrospectionSchema {
  queryType: { name: string } | null;
  mutationType: { name: string } | null;
  types: IntrospectionType[];
}

interface IntrospectionResponse {
  data?: {
    __schema: IntrospectionSchema;
  };
  errors?: { message: string }[];
}

function unwrapType(typeRef: IntrospectionTypeRef): {
  typeName: string;
  required: boolean;
} {
  let current: IntrospectionTypeRef | null | undefined = typeRef;
  let required = false;

  while (current) {
    if (current.kind === "NON_NULL") {
      required = true;
      current = current.ofType;
    } else if (current.kind === "LIST") {
      current = current.ofType;
    } else {
      break;
    }
  }

  const typeName = current?.name || "Unknown";
  return { typeName, required };
}

function formatTypeString(typeRef: IntrospectionTypeRef): string {
  if (typeRef.kind === "NON_NULL" && typeRef.ofType) {
    return `${formatTypeString(typeRef.ofType)}!`;
  }
  if (typeRef.kind === "LIST" && typeRef.ofType) {
    return `[${formatTypeString(typeRef.ofType)}]`;
  }
  return typeRef.name || "Unknown";
}

function parseIntrospectionArg(arg: IntrospectionArg): GraphQLArgument {
  const { required } = unwrapType(arg.type);
  return {
    name: arg.name,
    type: formatTypeString(arg.type),
    description: arg.description || undefined,
    required,
  };
}

function parseIntrospectionField(
  field: IntrospectionField,
  types: Map<string, IntrospectionType>,
  operationType: "query" | "mutation",
): GraphQLOperation {
  const { typeName } = unwrapType(field.type);
  const returnType = types.get(typeName);

  const returnFields: GraphQLField[] = [];
  if (returnType?.fields) {
    for (const f of returnType.fields) {
      const { required } = unwrapType(f.type);
      returnFields.push({
        name: f.name,
        type: formatTypeString(f.type),
        description: f.description || undefined,
        required,
      });
    }
  }

  return {
    name: field.name,
    operationType,
    description: field.description || undefined,
    arguments:
      field.args.length > 0
        ? field.args.map((a) => parseIntrospectionArg(a))
        : undefined,
    returnType: formatTypeString(field.type),
    returnFields: returnFields.length > 0 ? returnFields : undefined,
  };
}

export function parseIntrospectionSchema(
  schema: IntrospectionSchema,
): ParsedGraphQLSchema {
  const types = new Map<string, IntrospectionType>();
  for (const type of schema.types) {
    types.set(type.name, type);
  }

  const queries: GraphQLOperation[] = [];
  const mutations: GraphQLOperation[] = [];

  if (schema.queryType?.name) {
    const queryType = types.get(schema.queryType.name);
    if (queryType?.fields) {
      for (const field of queryType.fields) {
        if (field.name.startsWith("__")) continue;
        queries.push(parseIntrospectionField(field, types, "query"));
      }
    }
  }

  if (schema.mutationType?.name) {
    const mutationType = types.get(schema.mutationType.name);
    if (mutationType?.fields) {
      for (const field of mutationType.fields) {
        mutations.push(parseIntrospectionField(field, types, "mutation"));
      }
    }
  }

  return { queries, mutations };
}

const INTROSPECTION_TIMEOUT_MS = 30000;

export async function fetchGraphQLSchema(url: string): Promise<ParseResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: INTROSPECTION_QUERY }),
      signal: AbortSignal.timeout(INTROSPECTION_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `Failed to fetch schema: ${response.status} ${response.statusText}`,
      };
    }

    const result = (await response.json()) as IntrospectionResponse;

    if (result.errors && result.errors.length > 0) {
      return {
        ok: false,
        error: `GraphQL errors: ${result.errors.map((e) => e.message).join(", ")}`,
      };
    }

    if (!result.data?.__schema) {
      return {
        ok: false,
        error: "Invalid introspection response: missing __schema",
      };
    }

    const parsed = parseIntrospectionSchema(result.data.__schema);
    return { ok: true, value: parsed };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
