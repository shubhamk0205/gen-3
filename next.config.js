const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root to this project so Next doesn't infer the user's home directory.
  outputFileTracingRoot: path.join(__dirname),
  // pdf-parse must be required at runtime, not bundled.
  serverExternalPackages: ["pdf-parse"],
};

module.exports = nextConfig;
