
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Fix for the 'require.extensions' error with handlebars
    config.module.rules.push({
      test: /node_modules\/handlebars\/lib\/index\.js$/,
      loader: 'string-replace-loader',
      options: {
        search: 'require.extensions',
        replace: 'null',
      },
    });

    // Ignore noisy protobufjs critical dependency warning coming from opentelemetry/protobufjs
    config.ignoreWarnings = config.ignoreWarnings || [];
    config.ignoreWarnings.push({
      message: /Critical dependency: the request of a dependency is an expression/
    });

    return config;
  },
};

export default nextConfig;
