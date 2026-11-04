// LP を WordPress の「カスタムHTML」ブロックに貼り付けられる1つの HTML に書き出す。
//   npm run export:wordpress -- [--url https://example.com/lp/] [--signup https://app.example.com/signup]
// --url は構造化データ（JSON-LD）に載せる LP の公開 URL、--signup は申込ボタンのリンク先。
// 出力: wordpress/minpaku-lp.html（貼り付け用）と wordpress/preview.html（ブラウザでの確認用）
//
// テーマの CSS と干渉しないよう、Tailwind の CSS はすべて #minpaku-lp 配下に限定し、
// テーマ側の CSS（レイヤーなし）に負けないよう @layer も外している。
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import tailwindcss from "@tailwindcss/postcss";
import postcss, { type Plugin } from "postcss";
import { renderToStaticMarkup } from "react-dom/server";

const SCOPE = "#minpaku-lp";
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "wordpress");

async function main() {
  const { values } = parseArgs({
    options: { url: { type: "string" }, signup: { type: "string" } },
  });
  // site.ts が import 時に読むので、コンポーネントを読み込む前に設定する
  process.env.NEXT_PUBLIC_APP_URL = values.url ?? "";
  process.env.NEXT_PUBLIC_SIGNUP_URL = values.signup ?? "/signup";

  const body = await renderBody();
  await mkdir(OUT_DIR, { recursive: true });

  // Tailwind が使用クラスを拾えるよう、先に HTML を書き出してから CSS を生成する
  const scanPath = path.join(OUT_DIR, ".scan.html");
  await writeFile(scanPath, body);
  const css = await buildCss(scanPath);

  const snippet = [
    "<!-- Minpaku Report LP: WordPress のカスタムHTMLブロックにこのまま貼り付けてください -->",
    `<style>${css}</style>`,
    body,
  ].join("\n");

  await writeFile(path.join(OUT_DIR, "minpaku-lp.html"), snippet);
  await writeFile(
    path.join(OUT_DIR, "preview.html"),
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>WordPress 貼り付けプレビュー</title></head><body style="margin:0">\n${snippet}\n</body></html>`,
  );
  await rm(scanPath);

  console.log(`wordpress/minpaku-lp.html を書き出しました（${Math.round(Buffer.byteLength(snippet) / 1024)} KB）`);
  if (!values.url) console.log("※ --url 未指定のため、構造化データに URL は含めていません");
  if (!values.signup) console.log("※ --signup 未指定のため、申込ボタンは /signup に移動します");
}

async function renderBody(): Promise<string> {
  const [{ Hero }, { Problems }, { Features }, { Benefits }, { Pricing }, { Faq }, { Footer }, { JsonLd }] =
    await Promise.all([
      import("@/components/lp/Hero"),
      import("@/components/lp/Problems"),
      import("@/components/lp/Features"),
      import("@/components/lp/Benefits"),
      import("@/components/lp/Pricing"),
      import("@/components/lp/Faq"),
      import("@/components/lp/Footer"),
      import("@/components/lp/JsonLd"),
    ]);

  // ヘッダーは WordPress テーマ側のものを使うので含めない
  const html = renderToStaticMarkup(
    <>
      <div id="minpaku-lp" className="bg-white font-sans text-ink antialiased">
        <Hero />
        <Problems />
        <Features />
        <Benefits />
        <Pricing />
        <Faq />
        <Footer />
      </div>
      <JsonLd />
    </>,
  );

  return (
    html
      // 固定ヘッダー分の上余白は不要
      .replace("pt-28 pb-20 sm:pt-36 sm:pb-28", "pt-16 pb-20 sm:pt-24 sm:pb-28")
      .replaceAll('"url":"",', "")
  );
}

async function buildCss(scanPath: string): Promise<string> {
  const globals = await readFile(path.join(ROOT, "src/app/globals.css"), "utf8");
  const input = [
    '@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap");',
    globals.replace(
      '@import "tailwindcss";',
      `@import "tailwindcss" source(none);\n@source "${scanPath.replaceAll("\\", "/")}";`,
    ),
    `${SCOPE} { --font-noto-sans-jp: "Noto Sans JP"; }`,
  ].join("\n");

  const result = await postcss([tailwindcss({ base: ROOT, optimize: { minify: false } }), scopeToContainer()]).process(
    input,
    { from: path.join(ROOT, "src/app/globals.css") },
  );
  return result.css;
}

function scopeToContainer(): Plugin {
  const scope = (selector: string) => {
    const s = selector.trim();
    if (s === SCOPE || s.startsWith(`${SCOPE} `)) return s;
    if (/^(html|body|:root|:host)$/.test(s)) return SCOPE;
    return `${SCOPE} ${s}`;
  };
  return {
    postcssPlugin: "scope-to-container",
    OnceExit(root) {
      root.walkAtRules("layer", (at) => {
        if (at.nodes && at.nodes.length > 0) at.replaceWith(at.nodes);
        else at.remove();
      });
      root.walkRules((rule) => {
        const parent = rule.parent;
        if (parent?.type === "atrule" && /keyframes$/.test((parent as postcss.AtRule).name)) return;
        if (parent?.type === "rule") return;
        rule.selectors = [...new Set(rule.selectors.map(scope))];
      });
    },
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
