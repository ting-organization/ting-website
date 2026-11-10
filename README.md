# Ting website

The home page of [Ting](https://github.com/ting-organization/ting), and the wiki
with it: one static site that says what Ting is and links to everything else, the
explorer, the miner, Ting ID, the applications and the repositories.

It is plain HTML, CSS and a little JavaScript, built by one script, and can be
hosted anywhere that serves files, GitHub Pages included.

## What is in it

- **The home page** (`src/home.html`): what Ting is, then Ting ID, the wallet and
  identity app to use it with, then why Ting is built as it is, how its consensus
  can be checked, where to start as a reader, miner, user or builder, the software
  that runs on it, Daler, the project's weak points stated plainly, and where to ask.
  The line of figures under its opening, and Daler's issuance, are read in the
  visitor's browser from a public node's REST API (`node1.ting-node.com`, then
  `node2`); without an answer the page reads the same and links to the explorer.
- **The wiki** (`/wiki/`): every page of the wiki a Ting node serves, in the same
  order, with its diagrams and the protocol rules. Its content is not kept here. The
  build reads it from the ting repository (`node/wiki/`, `ting-protocol-rules.md`,
  and the list of pages in `node/src/wiki.rs`), so the wiki is written in one place
  and this site follows it.

## Build and look at it

Node 20 or newer.

```sh
npm ci
npm run build
npm run serve
```

`npm run build` writes the site to `dist/`. It clones the ting repository's
`master` into `.cache/ting` the first time and fetches it again on each build;
`node build.mjs --offline` builds from the clone as it is. `npm run serve` shows
`dist/` at <http://127.0.0.1:4173/>, and `BASE=/ting-website/ npm run serve` under
a folder, as GitHub Pages serves a project.

| Setting | What it does |
|---|---|
| `TING_SRC=../ting` | Build the wiki from a checkout of your own, uncommitted changes included |
| `TING_REF=<branch or tag>` | Build the wiki from that branch or tag, not `master` |
| `SITE_URL=https://example.org/` | The site's address: adds canonical links, `sitemap.xml` and `robots.txt` |

The build fails if a link between the site's own pages leads nowhere, or names a
section its page does not have.

## Layout

| Path | Contents |
|---|---|
| `src/home.html` | The home page's content |
| `src/shell.html` | What every page has around its content: the head and the header |
| `src/site.css` | The whole look, for the home page and the wiki, in light and dark |
| `src/site.js` | The theme switch, the copy buttons and the figures read from a node |
| `src/404.html` | The page for an address that has none |
| `src/assets/` | The applications' icons and Ting ID's screenshots, copied from their repositories, and Ting's logo on black for the header and the favicon |
| `build.mjs` | The build: the wiki's pages as `node/src/wiki.rs` renders them, then the link check |
| `serve.mjs` | A small server for `dist/` |
| `.github/workflows/pages.yml` | Builds on every push and every night, and publishes to GitHub Pages once it is on |

Every link in the built pages is relative, so the site works the same at a domain's
root and in a folder such as `/ting-website/`.

## How the wiki is built

`build.mjs` does what the node's `wiki.rs` does, so a page reads here as it does at
a node's `/wiki`:

- the groups and pages, their order, titles and summaries come from the `page!`
  entries of `node/src/wiki.rs`;
- a link between documents becomes a link between pages, a link to anything else in
  the repository opens it on GitHub, and a link to what a node serves beside its
  wiki (`/`, `/docs`) goes to the public node;
- headings get GitHub's anchors, diagrams are drawn into the page so that they take
  its colors, and `> [!NOTE]` blocks are marked as the node marks them;
- the reference programs the documents link to are copied next to the pages.

The look is this site's own. The wiki's documents use a few classes of their own
(`hero`, `pillars`, `benefits`, `cards`), which `src/site.css` styles; a new class
in a document needs a rule there. If `wiki.rs` changes how it lists its pages, the
build stops and says so.

## Publishing with GitHub Pages

1. In the repository's Settings → Pages, set Source to **GitHub Actions**.
2. Run the *Pages* workflow, or push to `main`.

The workflow finds out by itself whether Pages is on, and publishes when it is.
GitHub's free plan publishes Pages only from a public repository, so while this
repository is private the workflow builds and checks the site without publishing
it. A custom domain is set in the same settings page and needs nothing here.

The site is built again every night, which is how a change to the wiki in the ting
repository reaches it; *Run workflow* does the same at once.

## Licence

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT license](LICENSE-MIT), at your option. The typefaces,
[Newsreader](https://github.com/productiontype/Newsreader),
[Inter](https://github.com/rsms/inter) and
[JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), are under the SIL
Open Font License and are served from the site itself.
