'use strict';
// What every page has: the theme switch and the copy buttons. The home page
// also fills the line of network figures under its opening, and Daler's
// issuance, read from a public node. Everything here is optional: without
// it, or without a node to reach, the pages read the same and link to the
// explorer instead.
(() => {
  const byId = id => document.getElementById(id);
  const root = document.documentElement;
  const dark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  byId('theme-toggle').addEventListener('click', () => {
    const theme = dark() ? 'light' : 'dark';
    root.dataset.theme = theme;
    try { localStorage.setItem('ting-theme', theme); } catch {}
  });

  for (const button of document.querySelectorAll('[data-copy]')) {
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(button.parentElement.querySelector('code').textContent);
        button.textContent = 'Copied';
      } catch { button.textContent = 'Select and copy'; }
      setTimeout(() => { button.textContent = 'Copy'; }, 1600);
    });
  }

  // Only the home page shows figures from the network.
  const panel = byId('network'), badge = byId('net-badge');
  if (!panel) return;

  // Public nodes of the production network, tried in this order.
  const NODES = ['https://node1.ting-node.com', 'https://node2.ting-node.com'];
  const DALER = '305378d17f6af84a563d0f8a8455084948aff7330b62b4f2f98a44b82ba113c4';
  // The record of Daler's coin program that starts with what has been issued.
  const ISSUANCE = '0000000000000000000000000000000000000000000000000000000000000001';
  const DECIMALS = 8n, MAX_SUPPLY = 210000000n, WINDOW = 60, EVERY_MS = 20000;

  const targets = name => document.querySelectorAll('[data-net="' + name + '"]');
  const show = (name, value) => targets(name).forEach(element => { element.textContent = value; });
  const count = value => BigInt(value).toLocaleString('en-US');
  const seconds = value => value < 90 ? Math.round(value) + ' s' : value < 5400 ? Math.round(value / 60) + ' min' : (value / 3600).toFixed(1) + ' h';
  function rate(perSecond) {
    const units = ['H/s', 'kH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s'];
    let unit = 0;
    while (perSecond >= 1000 && unit < units.length - 1) { perSecond /= 1000; unit++; }
    return (perSecond >= 100 ? perSecond.toFixed(0) : perSecond >= 10 ? perSecond.toFixed(1) : perSecond.toFixed(2)) + ' ' + units[unit];
  }
  // A little-endian number, as programs store them.
  function le(hex) {
    let value = 0n;
    for (let i = hex.length - 2; i >= 0; i -= 2) value = (value << 8n) | BigInt(parseInt(hex.slice(i, i + 2), 16));
    return value;
  }

  let node = 0, tipTime = null;
  async function get(path) {
    const response = await fetch(NODES[node] + path, {cache: 'no-store'});
    if (!response.ok) throw Error('Request failed: ' + response.status);
    return response.json();
  }
  const age = () => { if (tipTime !== null) show('age', seconds(Math.max(0, Date.now() / 1000 - tipTime)) + ' ago'); };

  async function read() {
    const status = await get('/v1/status');
    if (status.network !== 'production') throw Error('Not the production network');
    const height = BigInt(status.height);
    panel.dataset.state = 'online';
    badge.textContent = status.replaying ? 'Replaying' : 'Live';
    show('height', count(height));
    const source = byId('net-source');
    source.href = NODES[node] + '/'; source.textContent = new URL(NODES[node]).host;
    const from = height > BigInt(WINDOW) ? height - BigInt(WINDOW) + 1n : 1n;
    const [blocks, issuance] = await Promise.all([
      get('/v1/blocks?from=' + from + '&limit=' + WINDOW).catch(() => null),
      get('/v1/contracts/' + DALER + '/storage/' + ISSUANCE).catch(() => null),
    ]);
    const items = blocks && Array.isArray(blocks.items) ? blocks.items.filter(block => block.canonical !== false) : [];
    if (items.length) {
      const first = items[0], last = items[items.length - 1], span = last.timestamp - first.timestamp;
      tipTime = last.timestamp; age();
      if (items.length > 1 && span > 0) {
        show('spacing', seconds(span / (items.length - 1)));
        show('rate', rate(Number(BigInt(last.work) - BigInt(first.work)) / span));
      }
    }
    if (issuance && typeof issuance.value_hex === 'string' && issuance.value_hex.length >= 32) {
      const issued = le(issuance.value_hex.slice(0, 32)) / 10n ** DECIMALS;
      show('issued', issued.toLocaleString('en-US') + ' DLR');
      // Its share of the most there can ever be, as a figure and as a bar.
      const percent = Number(issued * 10000n / MAX_SUPPLY) / 100;
      show('issued-share', ', ' + percent.toFixed(2) + '% of ' + MAX_SUPPLY.toLocaleString('en-US') + ' DLR');
      const bar = byId('issued-bar');
      if (bar) bar.style.width = Math.min(100, Math.max(percent, 0.4)) + '%';
    }
  }
  async function poll() {
    if (document.hidden) return;
    for (let attempt = 0; attempt < NODES.length; attempt++) {
      try { await read(); return; } catch { node = (node + 1) % NODES.length; }
    }
    panel.dataset.state = 'offline'; badge.textContent = 'No answer from the public nodes';
  }
  poll();
  setInterval(poll, EVERY_MS);
  setInterval(age, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
})();
