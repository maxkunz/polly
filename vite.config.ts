import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

// Importiere Amplify Outputs
import outputs from "./amplify_outputs.json";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    proxy: {
      "/api/archy-upload": {
        target: "https://dev.ora.atip.cloud",
        changeOrigin: true,
        secure: true,
      },
      "/api": {
        //target: outputs.custom.apiUrl,          // holt url aus amplify_outputs.json
        //target: process.env.AWS_BRANCH ?? "",   // holt url aus env (funktioniert nur in aws?)
        target: "https://v9u2ed8v37.execute-api.eu-central-1.amazonaws.com/",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/genesys-downloads": {
        target: "https://api-downloads.mypurecloud.de",
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
});
