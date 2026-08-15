import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import operations from '../../data/operations.generated.json';
import catalog from '../../../i18n/api.zh-CN.json';
import {useSdkPreference, type SdkName} from '../../hooks/useSdkPreference';

const labels = {en: {operation: 'Operation', function: 'Function', input: 'Input', output: 'Output', purpose: 'Purpose', compare: 'Compare SDKs', compareHint: 'Keep the same capability model while showing each language’s real contract.'}, 'zh-CN': {operation: '操作', function: '函数', input: '传入参数', output: '输出参数', purpose: '用途', compare: '对照 SDK', compareHint: '能力模型保持一致，同时诚实呈现各语言的真实契约。'}} as const;
type Operation = (typeof operations)[number];
const operationText = (item: Operation, locale: string) => locale === 'zh-CN' ? catalog.operations[item.id as keyof typeof catalog.operations].translation : {title: item.title, purpose: item.purpose};

export default function OperationMap(): React.JSX.Element {
  const {i18n} = useDocusaurusContext();
  const locale = i18n.currentLocale === 'zh-CN' ? 'zh-CN' : 'en';
  const text = labels[locale];
  const [sdk, setSdk] = useSdkPreference();
  const render = (selected: SdkName) => Array.from(new Set(operations.map((x) => x.category))).map((category) => <section className="operation-section" key={`${selected}-${category}`}><h2>{locale === 'zh-CN' ? catalog.categories[category as keyof typeof catalog.categories] : category}</h2><div className="operation-table-wrap"><table className="operation-table"><thead><tr><th>{text.operation}</th><th>{text.function}</th><th>{text.input}</th><th>{text.output}</th><th>{text.purpose}</th></tr></thead><tbody>{operations.filter((x) => x.category === category).map((item) => { const contract = item.sdks[selected]; const label = operationText(item, locale); return <tr key={item.id} data-operation-row={item.id} data-operation-sdk={selected} data-operation-symbol={contract.symbol}><td data-label={text.operation}>{label.title}</td><td data-label={text.function}><Link to={contract.href}><code>{contract.symbol}</code></Link></td><td data-label={text.input}><code>{contract.input}</code></td><td data-label={text.output}><code>{contract.output}</code></td><td data-label={text.purpose}>{label.purpose}</td></tr>; })}</tbody></table></div></section>);
  return <div className="operation-map"><div className="sdk-toggle" role="tablist" aria-label="SDK"><button type="button" role="tab" aria-selected={sdk === 'typescript'} className={sdk === 'typescript' ? 'sdk-toggle__active' : ''} onClick={() => setSdk('typescript')}>TypeScript</button><button type="button" role="tab" aria-selected={sdk === 'go'} className={sdk === 'go' ? 'sdk-toggle__active' : ''} onClick={() => setSdk('go')}>Go</button></div>{render(sdk)}<section className="sdk-compare" aria-labelledby="compare-sdks"><h2 id="compare-sdks">{text.compare}</h2><p>{text.compareHint}</p><div className="operation-table-wrap"><table className="operation-table compare-table"><thead><tr><th>{text.operation}</th><th>TypeScript</th><th>Go</th></tr></thead><tbody>{operations.map((item) => { const label = operationText(item, locale); return <tr key={item.id} data-compare-row={item.id}><td data-label={text.operation}>{label.title}</td><td data-label="TypeScript"><Link to={item.sdks.typescript.href}><code>{item.sdks.typescript.symbol}</code></Link><br/><code>{item.sdks.typescript.output}</code></td><td data-label="Go"><Link to={item.sdks.go.href}><code>{item.sdks.go.symbol}</code></Link><br/><code>{item.sdks.go.output}</code></td></tr>; })}</tbody></table></div></section></div>;
}
