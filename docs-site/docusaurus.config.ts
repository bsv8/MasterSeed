import type {Config} from '@docusaurus/types';
import {themes as prismThemes} from 'prism-react-renderer';

const base = (process.env.DOCS_BASE_URL ?? '').replace(/^\/+|\/+$/g, '');
const owner = process.env.DOCS_GITHUB_OWNER ?? 'bsv8';
const repo = process.env.DOCS_GITHUB_REPO ?? 'MasterSeed';
const branch = process.env.DOCS_GITHUB_BRANCH ?? 'main';
const github = `https://github.com/${owner}/${repo}`;
const editUrl = ({locale, docPath}: {locale: string; docPath: string}) => {
  if (docPath.startsWith('api/')) {
    if (locale === 'zh-CN') return `${github}/edit/${branch}/docs-site/i18n/api.zh-CN.json`;
    if (docPath.startsWith('api/typescript/')) return `${github}/edit/${branch}/typescript/src/index.ts`;
    if (docPath.startsWith('api/go/')) return `${github}/edit/${branch}/core.go`;
  }
  return locale === 'zh-CN' ? `${github}/edit/${branch}/docs-site/i18n/zh-CN/docusaurus-plugin-content-docs/current/${docPath}` : `${github}/edit/${branch}/docs-site/docs/${docPath}`;
};

const config: Config = {
  title: 'MasterSeed', tagline: 'Verifiable data seeds across TypeScript and Go.', favicon: 'img/masterseed-mark.svg',
  url: process.env.DOCS_URL ?? 'https://masterseed.dev', baseUrl: base ? `/${base}/` : '/', organizationName: owner, projectName: repo,
  deploymentBranch: process.env.DOCS_DEPLOY_BRANCH ?? 'gh-pages', trailingSlash: false, onBrokenLinks: 'throw', markdown: {hooks: {onBrokenMarkdownLinks: 'throw'}},
  i18n: {defaultLocale: 'en', locales: ['en', 'zh-CN'], localeConfigs: {en: {label: 'English', htmlLang: 'en-US'}, 'zh-CN': {label: '简体中文', htmlLang: 'zh-CN'}}},
  presets: [['classic', {docs: {routeBasePath: '/', sidebarPath: './sidebars.ts', showLastUpdateTime: false, breadcrumbs: true, editUrl}, blog: false, theme: {customCss: ['./src/css/custom.css', './src/css/sdk-toggle.css']}}]],
  themeConfig: {image: 'img/masterseed-social.svg', navbar: {title: 'MasterSeed', logo: {alt: 'MasterSeed', src: 'img/masterseed-mark.svg'}, items: [{to: '/guide/getting-started', label: 'Guide', position: 'left'}, {to: '/operations', label: 'Operations', position: 'left'}, {label: 'API', type: 'dropdown', position: 'left', items: [{label: 'TypeScript API', to: '/api/typescript'}, {label: 'Go API', to: '/api/go'}]}, {type: 'docSidebar', sidebarId: 'concepts', label: 'Concepts', position: 'left'}, {type: 'localeDropdown', position: 'right'}, {href: github, label: 'GitHub', position: 'right'}]}, footer: {style: 'dark', links: [{title: 'Explore', items: [{label: 'Getting started', to: '/guide/getting-started'}, {label: 'Operations', to: '/operations'}, {label: 'Release notes', to: '/release-notes'}]}, {title: 'API', items: [{label: 'TypeScript', to: '/api/typescript'}, {label: 'Go', to: '/api/go'}]}], copyright: `MasterSeed contributors · ${new Date().getFullYear()}`}, prism: {theme: prismThemes.github, darkTheme: prismThemes.dracula}},
};
export default config;
