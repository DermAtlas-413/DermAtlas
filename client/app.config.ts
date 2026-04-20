import { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const appEnv = process.env.APP_ENV ?? "development";
  const apiBase = process.env.API_BASE ?? "http://localhost:8000/api/v1";
  const useMock = process.env.USE_MOCK === "true";

  // Guards fire for staging AND production — both use real GCP (docs/ENVIRONMENTS.md)
  const isCloudEnv = appEnv === "production" || appEnv === "staging";

  if (isCloudEnv && useMock) {
    throw new Error(
      `[app.config.ts] BUILD FAILED: USE_MOCK=true is not allowed in APP_ENV=${appEnv}.`
    );
  }
  if (isCloudEnv && apiBase.includes("localhost")) {
    throw new Error(
      `[app.config.ts] BUILD FAILED: API_BASE contains "localhost" in APP_ENV=${appEnv}. Got: ${apiBase}`
    );
  }

  return {
    ...config,
    name: config.name ?? "DermAtlas",
    slug: config.slug ?? "derm-atlas",
    extra: {
      apiBase,
      useMock,
    },
  };
};
