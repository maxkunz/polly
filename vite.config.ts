import { fileURLToPath, URL } from "node:url";

import { defineConfig, loadEnv, type Connect, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { DEFAULT_GENESYS_REGION } from "./src/constants/genesysConstants";

/**
 * Content-Security-Policy der öffentlichen Umfrageseite (nur im Build; der Dev-Server braucht
 * Inline-Styles und HMR). Erlaubt nur eigene Skripte/Styles und Aufrufe an den eigenen Origin
 * (Backend über API_PREFIX). `frame-ancestors` wirkt nicht per <meta>; die Seite darf ohnehin
 * eingebettet werden (siehe documentation/polly_web.md).
 */
const WEB_SURVEY_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/**
 * Umfrageseite (survey.html, src/webSurvey/):
 * - Dev/Preview: `/s/<jwt>` wird wie die Amplify-Rewrite-Regel auf survey.html umgeschrieben.
 * - Build: CSP direkt nach dem charset-Meta von survey.html, vor allen Skripten und Styles.
 */
function webSurveyPage(): Plugin {
  const rewriteTokenPath: Connect.NextHandleFunction = (req, _res, next) => {
    if (req.url?.startsWith("/s/")) {
      const query = req.url.indexOf("?");
      req.url = `/survey.html${query >= 0 ? req.url.slice(query) : ""}`;
    }
    next();
  };

  return {
    name: "polly-web-survey-page",
    configureServer(server) {
      server.middlewares.use(rewriteTokenPath);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewriteTokenPath);
    },
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (ctx.server || !ctx.path.endsWith("/survey.html")) return html;
        // Ohne Treffer ginge die öffentliche Seite ohne CSP raus: dann lieber den Build abbrechen
        const charsetMeta = /<meta\s+charset=["']?utf-8["']?\s*\/?>/i;
        if (!charsetMeta.test(html)) {
          throw new Error("[polly-web-survey-page] survey.html: <meta charset=\"UTF-8\"> fehlt, CSP kann nicht eingefügt werden");
        }
        return html.replace(
          charsetMeta,
          (charset) => `${charset}\n    <meta http-equiv="Content-Security-Policy" content="${WEB_SURVEY_CSP}" />`
        );
      },
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Region aus GENESYS_REGION (Shell, .env oder Amplify-Hosting-Umgebungsvariable), sonst Default.
  const env = loadEnv(mode, process.cwd(), "");
  const genesysRegion = env.GENESYS_REGION?.trim() || DEFAULT_GENESYS_REGION;

  return {
    plugins: [vue(), tailwindcss(), webSurveyPage()],
    define: {
      __GENESYS_REGION__: JSON.stringify(genesysRegion),
    },
    server: {
      proxy: {
        "/api/archy-upload": {
          target: "https://dev.ora.atip.cloud",
          changeOrigin: true,
          secure: true,
        },
        // Muss vor "/api" stehen: Vite prüft per Präfix, "/api" würde sonst auch "/api_websurveys" treffen.
        "/api_websurveys": {
          target: "https://feature-websurveys.d1a6p4nkkob4i7.amplifyapp.com",
          changeOrigin: true,
          secure: true,
        },
        "/api": {
          target: "https://main.d1a6p4nkkob4i7.amplifyapp.com",
          changeOrigin: true,
          secure: true,
        },
        "/genesys-downloads": {
          target: `https://api-downloads.${genesysRegion}`,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/genesys-downloads/, ""),
          configure: (proxy, _options) => {
            proxy.on("error", (err, _req, _res) => {
              console.log("proxy error", err);
            });
            proxy.on("proxyReq", (_proxyReq, req, _res) => {
              console.log("Sending Request to the Target:", req.method, req.url);
            });
            proxy.on("proxyRes", (proxyRes, req, _res) => {
              console.log(
                "Received Response from the Target:",
                proxyRes.statusCode,
                req.url,
              );
              proxyRes.headers["access-control-allow-origin"] = "*";
              proxyRes.headers["access-control-allow-methods"] = "GET, OPTIONS";
            });
          },
        },
      },
    },
    build: {
      rollupOptions: {
        // Genesys-App und öffentliche Umfrageseite (/s/<jwt> → survey.html per Amplify-Rewrite)
        input: {
          main: fileURLToPath(new URL("./index.html", import.meta.url)),
          survey: fileURLToPath(new URL("./survey.html", import.meta.url)),
        },
      },
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  };
});
