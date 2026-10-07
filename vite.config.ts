import { fileURLToPath, URL } from "node:url";

import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { DEFAULT_GENESYS_REGION } from "./src/constants/genesysConstants";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Region aus GENESYS_REGION (Shell, .env oder Amplify-Hosting-Umgebungsvariable), sonst Default.
  const env = loadEnv(mode, process.cwd(), "");
  const genesysRegion = env.GENESYS_REGION?.trim() || DEFAULT_GENESYS_REGION;

  return {
    plugins: [vue(), tailwindcss()],
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
        "/api/survey-responses": {
          target: "https://main.d1a6p4nkkob4i7.amplifyapp.com",
          changeOrigin: true,
          secure: true,
        },
        "/api": {
          //target: process.env.AWS_BRANCH ?? "",   // holt url aus env (funktioniert nur in aws?)
          target: "https://v9u2ed8v37.execute-api.eu-central-1.amazonaws.com/",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
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
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  };
});
