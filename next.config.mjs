
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

    return config;
  },
};

export default nextConfig;
