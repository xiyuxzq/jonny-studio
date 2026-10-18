// Updates absolute publication URLs without adding a build dependency.
import { readFileSync, writeFileSync } from 'node:fs';
const base=(process.env.PAGES_BASE_URL || 'https://xiyuxzq.github.io/jonny-studio/').replace(/\/?$/, '/');
const items=JSON.parse(readFileSync(new URL('./assets/content.json',import.meta.url),'utf8'));
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const articles=items.filter(x=>x.category!=='实验' && x.status!=='todo');
writeFileSync(new URL('./feed.xml',import.meta.url),`<?xml version="1.0" encoding="utf-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Jonny Studio</title><link>${escape(base)}</link><description>实时渲染、材质研究与个人创作记录。</description><language>zh-CN</language><atom:link href="${escape(base)}feed.xml" rel="self" type="application/rss+xml"/>${articles.map(x=>`<item><title>${escape(x.title)}</title><link>${escape(base+x.url)}</link><guid isPermaLink="true">${escape(base+x.url)}</guid><description>${escape(x.description)}</description><pubDate>Sun, 18 Oct 2026 00:00:00 +0800</pubDate></item>`).join('')}</channel></rss>`);
writeFileSync(new URL('./sitemap.xml',import.meta.url),`<?xml version="1.0" encoding="utf-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['',...items.filter(x=>x.status!=='todo').map(x=>x.url)].map(x=>`<url><loc>${escape(base+x)}</loc></url>`).join('')}</urlset>`);
writeFileSync(new URL('./robots.txt',import.meta.url),`User-agent: *\nAllow: /\nSitemap: ${base}sitemap.xml\n`);
console.log('Publication metadata ready:',base);
