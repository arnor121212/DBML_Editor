import type * as Monaco from "monaco-editor";

export const DBML_LANGUAGE_ID = "dbml";

const KEYWORDS = [
  "Table",
  "table",
  "Ref",
  "ref",
  "Enum",
  "enum",
  "Project",
  "project",
  "TableGroup",
  "Note",
  "note",
  "indexes",
  "as",
];

const ATTR_KEYWORDS = [
  "pk",
  "primary",
  "key",
  "increment",
  "unique",
  "not",
  "null",
  "default",
  "ref",
  "name",
  "type",
  "headercolor",
  "database_type",
];

export function registerDbmlLanguage(monaco: typeof Monaco) {
  if (monaco.languages.getLanguages().some((l) => l.id === DBML_LANGUAGE_ID)) {
    return;
  }

  monaco.languages.register({ id: DBML_LANGUAGE_ID });

  monaco.languages.setLanguageConfiguration(DBML_LANGUAGE_ID, {
    comments: { lineComment: "//", blockComment: ["/*", "*/"] },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: "`", close: "`" },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: "`", close: "`" },
    ],
  });

  monaco.languages.setMonarchTokensProvider(DBML_LANGUAGE_ID, {
    defaultToken: "",
    tokenPostfix: ".dbml",
    keywords: KEYWORDS,
    attrKeywords: ATTR_KEYWORDS,
    operators: [">", "<", "-", "<>"],
    symbols: /[=><!~?:&|+\-*/^%]+/,
    tokenizer: {
      root: [
        // Comments
        [/\/\/.*$/, "comment"],
        [/\/\*/, { token: "comment", next: "@comment" }],

        // Strings
        [/"/, { token: "string.quote", next: "@string_double" }],
        [/'/, { token: "string.quote", next: "@string_single" }],
        [/`/, { token: "string.escape", next: "@string_backtick" }],

        // Numbers
        [/\d+\.\d+/, "number.float"],
        [/\d+/, "number"],

        // Settings block: [pk, not null, ref: > users.id, default: 'x']
        [/\[/, { token: "delimiter.bracket", next: "@settings" }],

        // Cardinality glyphs in Ref lines
        [/[<>-]/, "operator.glyph"],

        // Identifiers and keywords
        [
          /[A-Za-z_][\w]*/,
          {
            cases: {
              "@keywords": "keyword",
              "@default": "identifier",
            },
          },
        ],

        // Whitespace
        [/[\s]+/, "white"],

        // Delimiters
        [/[{}()]/, "@brackets"],
        [/[.,:;]/, "delimiter"],
      ],
      settings: [
        [/\]/, { token: "delimiter.bracket", next: "@pop" }],
        [/\/\/.*$/, "comment"],
        [/"/, { token: "string.quote", next: "@string_double" }],
        [/'/, { token: "string.quote", next: "@string_single" }],
        [/`/, { token: "string.escape", next: "@string_backtick" }],
        [/[<>-]+/, "operator.glyph"],
        [
          /[A-Za-z_][\w]*/,
          {
            cases: {
              "@attrKeywords": "type.identifier",
              "@default": "identifier",
            },
          },
        ],
        [/[\s]+/, "white"],
        [/[.,:;]/, "delimiter"],
      ],
      string_double: [
        [/[^"]+/, "string"],
        [/"/, { token: "string.quote", next: "@pop" }],
      ],
      string_single: [
        [/[^']+/, "string"],
        [/'/, { token: "string.quote", next: "@pop" }],
      ],
      string_backtick: [
        [/[^`]+/, "string"],
        [/`/, { token: "string.escape", next: "@pop" }],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, { token: "comment", next: "@pop" }],
        [/[/*]/, "comment"],
      ],
    },
  });
}

export function defineDbmlThemes(monaco: typeof Monaco) {
  monaco.editor.defineTheme("schemasync-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6e7891", fontStyle: "italic" },
      { token: "keyword", foreground: "9bb8ff", fontStyle: "bold" },
      { token: "type.identifier", foreground: "c8a8ff" },
      { token: "string", foreground: "8fdab1" },
      { token: "string.quote", foreground: "8fdab1" },
      { token: "string.escape", foreground: "f0c987" },
      { token: "number", foreground: "ffc28a" },
      { token: "number.float", foreground: "ffc28a" },
      { token: "operator.glyph", foreground: "ff8fb1" },
      { token: "delimiter", foreground: "8896b3" },
      { token: "delimiter.bracket", foreground: "8896b3" },
      { token: "identifier", foreground: "e2e6f0" },
    ],
    colors: {
      "editor.background": "#181b25",
      "editor.foreground": "#e5e9f4",
      "editorLineNumber.foreground": "#3a4258",
      "editorLineNumber.activeForeground": "#8a93b0",
      "editor.selectionBackground": "#2c3956",
      "editor.lineHighlightBackground": "#1f2331",
      "editorCursor.foreground": "#7aa6ff",
      "editorIndentGuide.background1": "#252a39",
      "editorIndentGuide.activeBackground1": "#3a4258",
      "editorBracketMatch.background": "#2c3956",
      "editorBracketMatch.border": "#5a7bd6",
      "editor.findMatchBackground": "#3a4258",
      "editor.findMatchHighlightBackground": "#2c3956",
      "editorGutter.background": "#181b25",
      "scrollbarSlider.background": "#2a3045aa",
      "scrollbarSlider.hoverBackground": "#3a4258aa",
      "scrollbarSlider.activeBackground": "#4a5478aa",
      "editorWidget.background": "#1f2331",
      "editorWidget.border": "#2a3045",
      "editorError.foreground": "#ff6b8b",
      "editorError.border": "#ff6b8b",
    },
  });

  monaco.editor.defineTheme("schemasync-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6a7280", fontStyle: "italic" },
      { token: "keyword", foreground: "2563eb", fontStyle: "bold" },
      { token: "type.identifier", foreground: "7c3aed" },
      { token: "string", foreground: "047857" },
      { token: "string.quote", foreground: "047857" },
      { token: "string.escape", foreground: "b45309" },
      { token: "number", foreground: "b45309" },
      { token: "number.float", foreground: "b45309" },
      { token: "operator.glyph", foreground: "be185d" },
      { token: "delimiter", foreground: "6b7280" },
      { token: "delimiter.bracket", foreground: "6b7280" },
      { token: "identifier", foreground: "1f2937" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#1f2937",
      "editorLineNumber.foreground": "#cbd5e1",
      "editorLineNumber.activeForeground": "#475569",
      "editor.selectionBackground": "#dbeafe",
      "editor.lineHighlightBackground": "#f8fafc",
    },
  });
}
