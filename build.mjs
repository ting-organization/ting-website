#!/usr/bin/env node
// Builds the Ting home page and wiki into dist/, a static site.
//
// The home page and the look of the site are this repository's own (src/).
// The wiki's content is not: its pages, their order, the diagrams and the
// logo are read from the ting repository, so the site holds the same wiki
// every node serves at /wiki. The registry of pages is node/src/wiki.rs
// there, and this script follows what that file does with them.
//
//   node build.mjs             build from ting's master (cloned into .cache/)
//   node build.mjs --offline   build from the clone as it is, without fetching
//   TING_SRC=../ting node build.mjs    build from a checkout of your own
//   TING_REF=v1.2.3 node build.mjs     a branch or tag other than master
//   SITE_URL=https://example.org/ node build.mjs   adds canonical links and a sitemap
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'dist');
const SRC = path.join(HERE, 'src');
const GITHUB = 'https://github.com/ting-organization/ting';
const NODE = 'https://node1.ting-node.com';
// The typefaces site.css names, as files of their @fontsource-variable packages.
const FONTS = [
  'newsreader/files/newsreader-latin-opsz-normal.woff2', 'newsreader/files/newsreader-latin-opsz-italic.woff2',
  'inter/files/inter-latin-wght-normal.woff2', 'inter/files/inter-latin-wght-italic.woff2',
  'jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
];
const REF = process.env.TING_REF || 'master';
const SITE_URL = (process.env.SITE_URL || '').replace(/\/*$/, '/').replace(/^\/$/, '');

const read = file => fs.readFileSync(file, 'utf8');
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();

// ---- The ting repository ------------------------------------------------------

function checkout() {
  if (process.env.TING_SRC) return path.resolve(process.env.TING_SRC);
  const dir = path.join(HERE, '.cache', 'ting');
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    execFileSync('git', ['clone', '--quiet', '--depth', '1', '--branch', REF, GITHUB + '.git', dir], { stdio: 'inherit' });
  } else if (!process.argv.includes('--offline')) {
    git(dir, 'fetch', '--quiet', '--depth', '1', 'origin', REF);
    git(dir, 'checkout', '--quiet', '--detach', 'FETCH_HEAD');
  }
  return dir;
}
const TING = checkout();
const ting = file => path.join(TING, file);
if (!fs.existsSync(ting('node/src/wiki.rs'))) throw Error(`${TING} is not a checkout of the ting repository`);

// The commit the wiki was built from, for the footer of every wiki page.
function revision() {
  try {
    const commit = git(TING, 'rev-parse', 'HEAD');
    const date = git(TING, 'show', '-s', '--format=%cs', 'HEAD');
    const dirty = git(TING, 'status', '--porcelain', '--', 'node/wiki', 'ting-protocol-rules.md', 'node/web') !== '';
    return { commit, date, dirty };
  } catch { return null; }
}
const REVISION = revision();

// ---- The wiki's registry, from node/src/wiki.rs ------------------------------

const unquote = text => text.replace(/\\(.)/g, '$1');
function registry() {
  const rs = read(ting('node/src/wiki.rs'));
  const groups = [];
  const entry = /Group\s*\{\s*label:\s*"((?:[^"\\]|\\.)*)"|page!\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,?\s*\)/g;
  for (const m of rs.matchAll(entry)) {
    if (m[1] !== undefined) groups.push({ label: unquote(m[1]), pages: [] });
    else if (groups.length) groups.at(-1).pages.push({ path: unquote(m[2]), title: unquote(m[3]), file: unquote(m[4]), summary: unquote(m[5]) });
  }
  // Files the documents link to that are not pages: the reference programs.
  const files = [...rs.matchAll(/"(programs\/[\w.-]+)"\s*=>/g)].map(m => m[1]);
  return { groups, files };
}
const { groups: GROUPS, files: FILES } = registry();
const PAGES = GROUPS.flatMap(group => group.pages.map(page => Object.assign(page, { group })));
if (PAGES.length < 10 || !PAGES.some(page => page.path === ''))
  throw Error('Could not read the wiki pages from node/src/wiki.rs: has its format changed?');

const find = pagePath => PAGES.find(page => page.path === pagePath);
const parent = page => page.path.includes('/') ? find(page.path.slice(0, page.path.lastIndexOf('/'))) : undefined;
const children = page => PAGES.filter(other => parent(other) === page);

/** `file` with its `.` and `..` parts resolved, or null when it leaves the repository. */
function normalize(file) {
  const parts = [];
  for (const part of file.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') { if (!parts.length) return null; parts.pop(); } else parts.push(part);
  }
  return parts.join('/');
}
// A page's source file as a path from the repository's root.
const inRepository = file => normalize('node/' + file);
for (const page of PAGES) page.repoFile = inRepository(page.file);

const DIAGRAMS = new Map(fs.readdirSync(ting('node/wiki/diagrams')).filter(name => name.endsWith('.svg'))
  .map(name => [name, read(ting('node/wiki/diagrams/' + name)).trim()]));

// ---- Markdown, as node/src/wiki.rs renders it --------------------------------

const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
// A heading's anchor, as GitHub makes it.
const slug = text => [...text.trim().toLowerCase()].map(c => c === ' ' ? '-' : /[\p{L}\p{N}_-]/u.test(c) ? c : '').join('');
// Where a page is in the built site, from the site's root.
const sitePath = page => page.path === '' ? 'wiki/' : `wiki/${page.path}/`;
const rootOf = page => '../'.repeat(sitePath(page).split('/').length - 1);

const warnings = new Set();
/** A link in a repository document, as it should be in the built site. */
function rewrite(env, url) {
  const hash = url.indexOf('#');
  const base = hash < 0 ? url : url.slice(0, hash), fragment = hash < 0 ? '' : url.slice(hash);
  // What a node serves beside its wiki, the explorer and the API, is the public node's here.
  if (base.startsWith('/') && !base.startsWith('//')) return NODE + url;
  if (base === '' || base.includes(':')) return url;
  const folder = env.page.repoFile.includes('/') ? env.page.repoFile.slice(0, env.page.repoFile.lastIndexOf('/')) : '';
  const target = normalize(folder + '/' + base);
  if (target === null) return url;
  const page = PAGES.find(other => other.repoFile === target);
  if (page) return env.root + sitePath(page) + fragment;
  if (FILES.includes(target)) return env.root + 'wiki/' + target;
  // Anything else in the repository is read on GitHub.
  if (fs.existsSync(ting(target)))
    return `${GITHUB}/${fs.statSync(ting(target)).isDirectory() ? 'tree' : 'blob'}/${REF}/${target}${fragment}`;
  warnings.add(`${env.page.file}: link to ${url} leads nowhere`);
  return url;
}
const rewriteHtml = (env, html) => html.replace(/href="([^"]*)"/g, (_, url) => `href="${rewrite(env, url)}"`);
const plain = tokens => (tokens || []).filter(t => t.type === 'text' || t.type === 'code_inline').map(t => t.content).join('');
const diagramOf = token => DIAGRAMS.get((token.attrGet('src') || '').split('/').pop());
const figure = token => `<figure class='diagram'>${diagramOf(token)}<figcaption>${escape(plain(token.children))}</figcaption></figure>`;

const md = new MarkdownIt({ html: true });
md.core.ruler.push('ting', state => {
  const env = state.env, tokens = state.tokens, ids = new Set();
  const html = (type, content) => Object.assign(new state.Token(type, '', 0), { content });
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i], next = tokens[i + 1];
    if (token.type === 'html_block') token.content = rewriteHtml(env, token.content);
    // A paragraph holding only a diagram becomes the diagram, drawn into the page.
    if (token.type === 'paragraph_open' && next?.type === 'inline' && next.children.length === 1
        && next.children[0].type === 'image' && diagramOf(next.children[0])) {
      tokens.splice(i, 3, html('html_block', figure(next.children[0]) + '\n'));
      continue;
    }
    // > [!NOTE] and its kin.
    if (token.type === 'blockquote_open' && next?.type === 'paragraph_open' && tokens[i + 2]?.type === 'inline') {
      const kids = tokens[i + 2].children, kind = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/i.exec(kids[0]?.type === 'text' ? kids[0].content.trim() : '');
      if (kind) {
        kids.splice(0, kids[1]?.type === 'softbreak' ? 2 : 1);
        token.attrJoin('class', 'markdown-alert-' + kind[1].toLowerCase());
      }
    }
    if (token.type === 'heading_open' && next?.type === 'inline') {
      const text = plain(next.children), level = Number(token.tag.slice(1));
      let id = slug(text);
      for (let n = 1; ids.has(id); n++) id = `${slug(text)}-${n}`;
      ids.add(id);
      token.attrSet('id', id);
      if (level !== 1) next.children.push(html('html_inline', `<a class='anchor' href='#${id}' aria-label='Link to this section'>#</a>`));
      env.headings.push({ level, id, text });
    }
    if (token.type !== 'inline') continue;
    token.children = token.children.map(child => {
      if (child.type === 'link_open') child.attrSet('href', rewrite(env, child.attrGet('href') || ''));
      if (child.type === 'html_inline') child.content = rewriteHtml(env, child.content);
      return child.type === 'image' && diagramOf(child) ? html('html_inline', figure(child)) : child;
    });
  }
});

// ---- Pages --------------------------------------------------------------------

const version = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10);
const SHELL = read(path.join(SRC, 'shell.html'));
let assetVersion = '';
function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, name) => {
    if (!(name in values)) throw Error(`Nothing to put in {{${name}}}`);
    return values[name];
  });
}
function shell({ title, description, section, root, body, canonical }) {
  const meta = SITE_URL ? `<link rel="canonical" href="${SITE_URL}${canonical}">\n  <meta property="og:url" content="${SITE_URL}${canonical}">` : '';
  return fill(SHELL, {
    title: escape(title), description: escape(description), section, root, body, meta, v: assetVersion,
    wiki_active: section === 'wiki' ? 'aria-current="page"' : '',
  });
}
function write(file, content) {
  const target = path.join(OUT, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function navigation(selected, root) {
  const section = parent(selected) || selected;
  const link = (page, cls) => `<a href='${root}${sitePath(page)}'${cls ? ` class='${cls}'` : ''}${page === selected ? " aria-current='page'" : ''}>${escape(page.title)}</a>`;
  let links = '';
  for (const group of GROUPS) {
    links += `<p class='nav-label'>${escape(group.label)}</p>`;
    for (const page of group.pages.filter(p => !parent(p))) {
      const below = children(page), open = below.length > 0 && section === page;
      links += link(page, below.length === 0 || open ? '' : 'has-children');
      if (open) links += `<div class='nav-children'>${below.map(child => link(child, '')).join('')}</div>`;
    }
  }
  return `<nav class='side-nav wiki-nav' aria-label='Wiki chapters'>${links}</nav>` +
    `<details class='wiki-mobile-nav'><summary>Contents<span>${escape(selected.title)}</span></summary>` +
    `<nav aria-label='Wiki chapters, compact'>${links}</nav></details>`;
}
const contents = headings => '<ol>' + headings.filter(h => h.level === 2).map(h => `<li><a href='#${h.id}'>${escape(h.text)}</a></li>`).join('') + '</ol>';
function pager(index, root) {
  const prev = PAGES[index - 1], next = PAGES[index + 1];
  return "<nav class='pager' aria-label='Previous and next page'>" +
    (prev ? `<a class='prev' href='${root}${sitePath(prev)}'><span>Previous</span>${escape(prev.title)}</a>` : '') +
    (next ? `<a class='next' href='${root}${sitePath(next)}'><span>Next</span>${escape(next.title)}</a>` : '') + '</nav>';
}
function wikiFooter(page) {
  const source = `<a href="${GITHUB}/blob/${REF}/${page.repoFile}">This page on GitHub</a>`;
  const built = REVISION
    ? `<span>Built from <a href="${GITHUB}/commit/${REVISION.commit}">ting ${REVISION.commit.slice(0, 7)}</a>${REVISION.dirty ? ' with local changes' : ''}, ${REVISION.date}</span>`
    : '<span>Built from the ting repository</span>';
  return `<footer class="site-footer">${built}<span class="sep" aria-hidden="true">·</span>${source}` +
    `<span class="sep" aria-hidden="true">·</span><a href="${NODE}/wiki">The wiki on a node</a></footer>`;
}
function wikiPage(page, index) {
  const root = rootOf(page), env = { page, root, headings: [] };
  const source = read(ting(page.repoFile));
  let body = md.render(source, env);
  const toc = page.path !== '' && env.headings.filter(h => h.level === 2).length >= 3;
  let html = '';
  if (page.path === '') {
    html += "<div class='wiki-page wiki-home'><article class='wiki-article'>" + body;
  } else {
    if (toc) {
      const end = body.indexOf('</h1>');
      if (end >= 0) body = body.slice(0, end + 5) + `<details class='toc-inline'><summary>On this page</summary>${contents(env.headings)}</details>` + body.slice(end + 5);
    }
    const minutes = Math.max(1, Math.ceil(source.split(/\s+/).filter(Boolean).length / 220));
    const above = parent(page);
    html += `<div class='wiki-page${toc ? ' has-toc' : ''}'><article class='wiki-article'><nav class='wiki-meta' aria-label='Breadcrumb'><span>${escape(page.group.label)}</span>` +
      (above ? `<span class='sep'>›</span><a href='${root}${sitePath(above)}'>${escape(above.title)}</a>` : '') +
      `<span class='sep'>·</span><span>${minutes} min read</span></nav>` + body;
  }
  const below = children(page);
  if (below.length) {
    html += "<section class='subpages' aria-label='In this section'><h2>In this section</h2><div class='cards'>" +
      below.map(child => `<a class='card' href='${root}${sitePath(child)}'><strong>${escape(child.title)}</strong><span>${escape(child.summary)}</span></a>`).join('') +
      '</div></section>';
  }
  html += pager(index, root) + '</article>';
  if (toc) html += `<nav class='toc' aria-label='On this page'><p class='toc-label'>On this page</p>${contents(env.headings)}</nav>`;
  html += '</div>';
  const layout = `<div class="layout">${navigation(page, root)}<div class="content"><main id="main">${html}</main>${wikiFooter(page)}</div></div>`;
  write(sitePath(page) + 'index.html', shell({
    title: page.path === '' ? 'The Ting wiki' : `${page.title} · Ting wiki`, description: page.summary,
    section: 'wiki', root, body: layout, canonical: sitePath(page),
  }));
}

// ---- Build ---------------------------------------------------------------------

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });

// The logo is the ting repository's; the typefaces come from their packages
// and are served from the site itself, so a page asks nothing of anyone else.
fs.mkdirSync(path.join(OUT, 'assets/fonts'), { recursive: true });
fs.copyFileSync(ting('node/web/logo.svg'), path.join(OUT, 'assets/logo.svg'));
for (const font of FONTS) fs.copyFileSync(path.join(HERE, 'node_modules/@fontsource-variable', font), path.join(OUT, 'assets/fonts', path.basename(font)));
for (const name of fs.readdirSync(path.join(SRC, 'assets'))) fs.copyFileSync(path.join(SRC, 'assets', name), path.join(OUT, 'assets', name));
for (const name of ['site.css', 'site.js']) fs.copyFileSync(path.join(SRC, name), path.join(OUT, 'assets', name));
assetVersion = ['site.css', 'site.js'].map(name => version(path.join(OUT, 'assets', name))).join('').slice(0, 12);

write('index.html', shell({
  title: 'Ting: a foundation that doesn’t move',
  description: 'Ting is a general-purpose proof-of-work blockchain built as a permanent foundation. Its consensus is a small set of rules, written once and fixed for good.',
  section: 'home', root: './', body: fill(read(path.join(SRC, 'home.html')), { root: './' }), canonical: '',
}));
PAGES.forEach(wikiPage);
for (const file of FILES) {
  fs.mkdirSync(path.dirname(path.join(OUT, 'wiki', file)), { recursive: true });
  fs.copyFileSync(ting(file), path.join(OUT, 'wiki', file));
}
write('404.html', read(path.join(SRC, '404.html')));
write('.nojekyll', '');
if (SITE_URL) {
  const urls = ['', ...PAGES.map(sitePath)].map(url => `  <url><loc>${SITE_URL}${url}</loc></url>`).join('\n');
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n`);
}

// Every link between the site's own pages must lead to a file that was built.
let broken = 0;
function check(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { check(file); continue; }
    if (!entry.name.endsWith('.html') || entry.name === '404.html') continue;
    const html = read(file), ids = new Set([...html.matchAll(/\sid=["']([^"']+)["']/g)].map(m => m[1]));
    for (const [, url] of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) continue;
      const [base, fragment] = url.split('#');
      if (base === '') {
        if (fragment && !ids.has(decodeURIComponent(fragment))) { broken++; console.error(`${path.relative(OUT, file)}: no #${fragment} on the page`); }
        continue;
      }
      let target = path.resolve(path.dirname(file), base.split('?')[0]);
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
      if (!fs.existsSync(target)) { broken++; console.error(`${path.relative(OUT, file)}: ${url} is not in the site`); continue; }
      if (fragment && target.endsWith('.html') && !new RegExp(`\\sid=["']${fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(read(target))) {
        broken++; console.error(`${path.relative(OUT, file)}: ${url} names no section of that page`);
      }
    }
  }
}
check(OUT);
for (const warning of warnings) console.error('warning: ' + warning);
console.log(`Built ${PAGES.length} wiki pages and the home page into dist/` +
  (REVISION ? `, from ting ${REVISION.commit.slice(0, 7)} (${REVISION.date})${REVISION.dirty ? ' with local changes' : ''}` : ''));
if (broken) { console.error(`${broken} broken link${broken === 1 ? '' : 's'}`); process.exit(1); }
