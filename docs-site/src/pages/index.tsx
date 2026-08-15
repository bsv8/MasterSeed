import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import './home.css';

export default function Home() {
  const {i18n} = useDocusaurusContext();
  const zh = i18n.currentLocale === 'zh-CN';
  const copy = zh ? {
    eyebrow: 'MASTERSEED / KEYMASTER SEED V1', title: <>让数据<br/><em>可验证。</em></>,
    lede: '由 TypeScript 与 Go 实现的确定性摘要流。', start: '快速开始', explore: '查看操作 →',
    flow: '源数据分块到摘要流，再到 seed hash', formatKicker: '01 / 格式流程', formatTitle: '源分块 → 摘要流 → seed hash。',
    formatBody: '每个 256 KiB 分块生成一个原始 32 字节 SHA-256 摘要；按顺序拼接后再次哈希，得到 seed_hash。',
    boundaryKicker: '02 / SDK 边界', boundaryTitle: '原生入口，共享契约。', ts: '异步可迭代核心', tsSmall: 'bigint 大小与 Node 路径适配器', go: 'Reader / writer 流', goSmall: 'uint64 计数与文件助手', api: '生成的源码参考', apiSmall: '每次构建前运行 TypeDoc + Go AST', ready: '准备验证', cta: '构建清晰的数据边界。', build: '开始构建 →',
  } : {
    eyebrow: 'MASTERSEED / KEYMASTER SEED V1', title: <>Make data<br/><em>checkable.</em></>,
    lede: 'One deterministic digest stream, implemented by TypeScript and Go.', start: 'Get started', explore: 'Explore operations →',
    flow: 'source blocks to digest stream to seed hash', formatKicker: '01 / FORMAT FLOW', formatTitle: 'Source blocks → digest stream → seed hash.',
    formatBody: 'Every 256 KiB block produces one raw 32-byte SHA-256 digest. The exact concatenation is hashed again to produce `seed_hash`.',
    boundaryKicker: '02 / SDK BOUNDARY', boundaryTitle: 'Native edges. Shared contract.', ts: 'Async iterable core', tsSmall: 'bigint sizes and Node path adapter', go: 'Reader / writer streams', goSmall: 'uint64 counters and file helpers', api: 'Generated source references', apiSmall: 'TypeDoc + Go AST before every build', ready: 'READY TO VERIFY', cta: 'Build a clear data boundary.', build: 'Start building →',
  };
  return <Layout><main className="home"><section className="hero-poster"><div className="hero-copy"><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p className="hero-lede">{copy.lede}</p><div className="hero-actions"><Link className="button button--primary" to="/guide/getting-started">{copy.start}</Link><Link className="text-link" to="/operations">{copy.explore}</Link></div><p className="install">$ npm install masterseed <span>·</span> go get github.com/bsv8/MasterSeed</p></div><div className="flow-visual" role="img" aria-label={copy.flow}><div className="flow-ring"><b>BLOCKS</b><b>DIGESTS</b><b>HASH</b></div></div></section><section className="home-section"><p className="section-kicker">{copy.formatKicker}</p><h2>{copy.formatTitle}</h2><p>{copy.formatBody}</p></section><section className="home-section boundary"><p className="section-kicker">{copy.boundaryKicker}</p><h2>{copy.boundaryTitle}</h2><div className="rows"><Link to="/guide/create-verify"><span>TS</span><strong>{copy.ts}</strong><small>{copy.tsSmall}</small><b aria-hidden="true">↗</b></Link><Link to="/guide/create-verify"><span>GO</span><strong>{copy.go}</strong><small>{copy.goSmall}</small><b aria-hidden="true">↗</b></Link><Link to="/api/typescript"><span>API</span><strong>{copy.api}</strong><small>{copy.apiSmall}</small><b aria-hidden="true">↗</b></Link></div></section><section className="home-cta"><p className="eyebrow">{copy.ready}</p><h2>{copy.cta}</h2><Link className="text-link" to="/guide/getting-started">{copy.build}</Link></section></main></Layout>;
}
