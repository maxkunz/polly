import { defineFunction } from "@aws-amplify/backend";
import { Duration } from "aws-cdk-lib";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const pollyArchyUpload = defineFunction((scope) => {
  return new NodejsFunction(scope, "PollyArchyUpload", {
    entry: join(__dirname, "handler.ts"),
    handler: "handler",
    runtime: Runtime.NODEJS_20_X,
    architecture: Architecture.X86_64,
    timeout: Duration.seconds(30),
    bundling: {
      format: OutputFormat.ESM,
      minify: true,
      sourceMap: true,
    },
    environment: {
      ALLOWED_UPLOAD_HOSTS: "fileupload.mypurecloud.de,fileupload.mypurecloud.com",
      TEMPLATE_API_BASE: "",
    },
  });
}, { resourceGroupName: "AppInfrastructure" });
