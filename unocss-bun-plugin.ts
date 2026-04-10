import { join } from "node:path";
import { loadConfig } from "@unocss/config";
import { createGenerator } from "unocss";
import type { BunPlugin } from "bun";

const plugin: BunPlugin = {
  name: "unocss-fullstack",
  async setup(build) {
    const projectRoot = import.meta.dir;
    const { config } = await loadConfig(projectRoot, join(projectRoot, "uno.config.ts"));
    const generator = await createGenerator(config);
    build.onLoad({ filter: /\.html$/ }, async ({ path: htmlPath }) => {
      const html = await Bun.file(htmlPath).text();
      const chunks = [html];
      const glob = new Bun.Glob("src/**/*");
      for await (const rel of glob.scan({ cwd: projectRoot })) {
        if (!/\.(m?[jt]sx?)$/.test(rel)) continue;
        chunks.push(await Bun.file(join(projectRoot, rel)).text());
      }
      const { css } = await generator.generate(chunks.join("\n"));
      const contents = html.replace("</head>", `<style>${css}</style>\n</head>`);
      return { contents, loader: "html" };
    });
  },
};

export default plugin;
