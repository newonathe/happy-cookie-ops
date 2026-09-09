import type { StorybookConfig } from '@storybook/nextjs';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx|mdx)'],
  framework: { name: '@storybook/nextjs', options: {} },
  staticDirs: ['../public'],
  typescript: { reactDocgen: 'react-docgen-typescript' }
};

export default config;
