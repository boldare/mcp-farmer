export interface MarkdownTool {
  id: string;
  name: string;
  description: string;
}

export const MARKDOWN_TOOLS: MarkdownTool[] = [
  {
    id: "list",
    name: "docs_list_files",
    description: "List markdown files with basic metadata (path, name, size)",
  },
  {
    id: "read",
    name: "docs_read_file",
    description: "Read the content of a markdown file by path",
  },
  {
    id: "search",
    name: "docs_search",
    description: "Search for text across all markdown files",
  },
];
