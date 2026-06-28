import { defineConfig } from 'vitepress';
import {
  groupIconMdPlugin,
  groupIconVitePlugin,
} from 'vitepress-plugin-group-icons';
import pkg from '../../package.json';

type VitePlugins = NonNullable<
  NonNullable<Parameters<typeof defineConfig>[0]['vite']>['plugins']
>;

const repoUrl = 'https://github.com/taugr/stylemakar';
const siteUrl = 'https://taugr.github.io/stylemakar/';
const description =
  'Local-first writing style rewriter for OpenAI-compatible model providers.';

export default defineConfig({
  base: '/stylemakar/',
  cleanUrls: true,
  description,
  head: [
    [
      'link',
      { href: '/stylemakar/logo.svg', rel: 'icon', type: 'image/svg+xml' },
    ],
    ['meta', { content: description, name: 'description' }],
    ['meta', { content: 'StyleMakar', property: 'og:title' }],
    ['meta', { content: description, property: 'og:description' }],
    ['meta', { content: siteUrl, property: 'og:url' }],
    ['meta', { content: 'summary_large_image', name: 'twitter:card' }],
    ['meta', { content: '#0f172a', name: 'theme-color' }],
  ],
  lang: 'en-US',
  lastUpdated: true,
  sitemap: {
    hostname: siteUrl,
  },
  srcExclude: ['design/**/*.md', 'reports/**/*.md', 'specs/**/*.md'],
  themeConfig: {
    editLink: {
      pattern: `${repoUrl}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub',
    },
    footer: {
      copyright: 'Copyright © 2026 Tom Auger',
      message: 'Released under the MIT License.',
    },
    logo: '/logo.svg',
    nav: [
      {
        items: [
          { link: '/guide/', text: 'Overview' },
          { link: '/guide/getting-started', text: 'Getting Started' },
          { link: '/guide/install', text: 'Install Prototype' },
          { link: '/guide/cli', text: 'CLI' },
          { link: '/guide/providers', text: 'Provider Setup' },
          { link: '/guide/tutorials', text: 'Tutorials' },
          { link: '/guide/desktop', text: 'Desktop App' },
          { link: '/guide/reference', text: 'Reference' },
        ],
        text: 'Guide',
      },
      {
        items: [{ link: repoUrl, text: `stylemakar v${pkg.version}` }],
        text: `v${pkg.version}`,
      },
    ],
    search: {
      provider: 'local',
    },
    sidebar: {
      '/guide/': [
        {
          collapsed: false,
          items: [
            { link: '/guide/', text: 'Overview' },
            { link: '/guide/getting-started', text: 'Getting Started' },
            { link: '/guide/install', text: 'Install Prototype' },
            { link: '/guide/cli', text: 'CLI' },
            { link: '/guide/providers', text: 'Provider Setup' },
            { link: '/guide/tutorials', text: 'Tutorials' },
            { link: '/guide/desktop', text: 'Desktop App' },
            { link: '/guide/reference', text: 'Reference' },
          ],
          text: 'Guide',
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: repoUrl }],
  },
  title: 'StyleMakar',
  markdown: {
    config(md) {
      md.use(groupIconMdPlugin);
    },
  },
  vite: {
    plugins: [groupIconVitePlugin()] as unknown as VitePlugins,
  },
});
