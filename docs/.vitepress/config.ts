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
  themeConfig: {
    editLink: {
      pattern: `${repoUrl}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub',
    },
    footer: {
      copyright: 'Released under the MIT License.',
      message: 'StyleMakar documentation',
    },
    logo: '/logo.svg',
    nav: [
      { link: '/guide/', text: 'Guide' },
      { link: '/guide/getting-started', text: 'Getting Started' },
      { link: '/guide/install', text: 'Install' },
      { link: '/guide/providers', text: 'Providers' },
      { link: '/guide/tutorials', text: 'Tutorials' },
      {
        items: [
          { link: '/design/stylemakar-option-three-qa', text: 'Design QA' },
          { link: '/specs/evals', text: 'Eval Spec' },
          {
            link: '/design/mobile-ux-review/review',
            text: 'Mobile UX Review',
          },
        ],
        text: 'Project Notes',
      },
      { link: '/guide/reference', text: 'Reference' },
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
            { link: '/guide/providers', text: 'Provider Setup' },
            { link: '/guide/tutorials', text: 'Tutorials' },
            { link: '/guide/desktop', text: 'Desktop App' },
            { link: '/guide/reference', text: 'Reference' },
            { link: '/guide/development', text: 'Development' },
          ],
          text: 'Guide',
        },
      ],
      '/design/': [
        {
          collapsed: false,
          items: [
            {
              link: '/design/stylemakar-option-three-qa',
              text: 'Option Three QA',
            },
            {
              link: '/design/mobile-ux-review/review',
              text: 'Mobile UX Review',
            },
            {
              link: '/design/mobile-ux-review/hybrid-mobile-plan',
              text: 'Hybrid Mobile Plan',
            },
          ],
          text: 'Design',
        },
      ],
      '/specs/': [
        {
          collapsed: false,
          items: [
            {
              link: '/specs/app-release-readiness-checklist',
              text: 'App Release Readiness',
            },
            { link: '/specs/evals', text: 'Eval Harness' },
            {
              link: '/specs/student-feedback-meaning-policy',
              text: 'Student Feedback Meaning Policy',
            },
            { link: '/specs/tauri-desktop-app-plan', text: 'Desktop App Plan' },
            {
              link: '/specs/tauri-desktop-deployment-plan',
              text: 'Desktop Deployment Plan',
            },
            {
              link: '/specs/ui-option-three-plan',
              text: 'Option Three UI Plan',
            },
            {
              link: '/specs/release-notes-template',
              text: 'Release Notes Template',
            },
          ],
          text: 'Specs',
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
