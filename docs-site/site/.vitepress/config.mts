import {defineConfig} from 'vitepress';
import typedocSidebar from '../api/typescript/typedoc-sidebar.json';

const cleanBase = (value: string | undefined) => {
  const clean = value?.trim().replace(/^\/+|\/+$/g, '') ?? '';
  return clean ? `/${clean}/` : '/';
};

export default defineConfig({
  lang: 'en-US', title: 'MasterSeed', description: 'Verifiable data seeds for Keymaster Seed V1.', base: cleanBase(process.env.DOCS_BASE), appearance: true, cleanUrls: true,
  head: [['meta', {name: 'theme-color', content: '#071716'}]],
  themeConfig: {
    logo: {src: '/mark.svg', alt: 'MasterSeed'}, siteTitle: 'MasterSeed',
    nav: [{text: 'Guide', link: '/guide/getting-started'}, {text: 'Concepts', link: '/concepts/seed-v1'}, {text: 'API', items: [{text: 'TypeScript API', link: '/api/typescript/'}, {text: 'Go API', link: '/api/go/'}]}, {text: 'GitHub', link: 'https://github.com/bsv8/MasterSeed'}],
    sidebar: {
      '/guide/': [{text: 'Getting started', items: [{text: 'Overview', link: '/guide/getting-started'}, {text: 'TypeScript core', link: '/guide/typescript-core'}, {text: 'Node adapter', link: '/guide/node-adapter'}, {text: 'Go streaming API', link: '/guide/go-streaming'}, {text: 'Go file helpers', link: '/guide/go-files'}, {text: 'Verification & errors', link: '/guide/verification-errors'}]}],
      '/concepts/': [{text: 'Concepts', items: [{text: 'Seed V1 byte format', link: '/concepts/seed-v1'}, {text: 'Interoperability', link: '/concepts/interoperability'}, {text: 'Security boundary', link: '/concepts/security'}]}],
      '/api/typescript/': [{text: 'TypeScript API', items: typedocSidebar}],
      '/api/go/': [{text: 'Go API', items: [{text: 'Package reference', link: '/api/go/'}]}]
    },
    search: {provider: 'local'}, socialLinks: [{icon: 'github', link: 'https://github.com/bsv8/MasterSeed'}], editLink: {pattern: 'https://github.com/bsv8/MasterSeed/edit/main/docs-site/site/:path'}, footer: {message: 'Source blocks → digest stream → seed hash', copyright: 'MasterSeed contributors'}
  }
});
