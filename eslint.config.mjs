import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...nextTypescript,
  {
    files: ["src/**/*.tsx"],
    rules: {
      "react/jsx-no-literals": [
        "error",
        {
          noStrings: true,
          ignoreProps: true,
          noAttributeStrings: false,
        },
      ],
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "supabase/.temp/**", ".opencode/**"],
  },
];

export default eslintConfig;
