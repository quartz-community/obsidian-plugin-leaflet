import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      // tsup bundles inline scripts and styles as strings (see tsup.config.ts); tests only need
      // a string, not the browser code running in Node
      name: "inline-assets-as-strings",
      enforce: "pre",
      load(id) {
        if (/\.inline\.ts$|\.scss$/.test(id)) return `export default ${JSON.stringify(id)};`;
        return null;
      },
    },
  ],
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    reporters: ["default"],
  },
});
