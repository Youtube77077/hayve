// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'ios/*', 'android/*'],
  },
  {
    rules: {
      // Apostrophes inside React Native <Text> are rendered literally.
      'react/no-unescaped-entities': 'off',
    },
  },
]);
