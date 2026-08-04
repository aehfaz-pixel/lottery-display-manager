const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve HTML files from src/renderer (Electron) or same directory (legacy)
const rendererDir = path.join(__dirname, 'src', 'renderer');
const staticDir = fs.existsSync(rendererDir) ? rendererDir : __dirname;
app.use(express.static(staticDir));

// ── helpers ──────────────────────────────────────────────────────────────────

async function fetchText(url, retries = 3, delay = 800) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LotteryApp/1.0)' },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (i < retries - 1) await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
  throw lastErr;
}

// Parse draw game data from TLC homepage
function parseAllJackpots(html) {
  const triplets = [];
  const re = /Est\.\s*Annuitized Jackpot for (\d{2}\/\d{2}\/\d{4}):[^<]*<\/p>\s*<h1>\$([^<]+)<\/h1>\s*<div><p>Est\. Cash Value: <strong>\$([^<]+)<\/strong>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    triplets.push({ nextDraw: m[1], jackpot: m[2].trim(), cashValue: m[3].trim() });
  }
  return triplets;
}

function parseTwoStep(html) {
  const stripped = html.replace(/<!--[\s\S]*?-->/g, '');
  const re = /Current Advertised Jackpot for (\d{2}\/\d{2}\/\d{4}):<p>\s*<h1[^>]*>\$([^<]+)<\/h1>/i;
  const m = stripped.match(re);
  if (!m) return null;
  return { nextDraw: m[1], jackpot: m[2].trim(), cashValue: null };
}

function parseScratchDetail(html, gameNumber) {
  const nameM = html.match(/Game No\.\s*\d+\s*-\s*([^<]+)</i);
  const name = nameM ? nameM[1].trim() : null;
  const priceM = html.match(/alt="\$(\d+)\s+Dollar/i);
  const price = priceM ? `$${priceM[1]}` : null;
  const closing = /closing\s+soon|game\s+will\s+be\s+closing/i.test(html);
  const prizes = [];
  const tableM = html.match(/Top Prizes[\s\S]*?<table[\s\S]*?<\/table>/i) ||
                 html.match(/Prize Amount[\s\S]*?<table[\s\S]*?<\/table>/i) ||
                 html.match(/<table[^>]*>[\s\S]*?Prize[\s\S]*?<\/table>/i);
  const tableHtml = tableM ? tableM[0] : html;
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm;
  while ((rm = rowRe.exec(tableHtml)) !== null) {
    const cells = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cm;
    while ((cm = cellRe.exec(rm[1])) !== null) {
      const text = cm[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
      if (text) cells.push(text);
    }
    if (cells.length >= 2 && /^\$[\d,]+$/.test(cells[0])) {
      prizes.push({ amount: cells[0], printed: cells[1] || '---', claimed: cells[2] || '---' });
    }
  }
  const packM = html.match(/Pack Size:\s*(\d+)\s*tickets/i);
  const packSize = packM ? packM[1] : null;
  const asOfM = html.match(/(?:Prizes Claimed as of|as of)\s+([\w]+ \d+,\s*\d{4}|\d{2}\/\d{2}\/\d{4})/i);
  const asOf = asOfM ? asOfM[1] : null;
  return { gameNumber, name, price, closing, prizes, asOf, packSize,
    imgFront:`https://www.texaslottery.com/export/sites/lottery/Images/scratchoffs/${gameNumber}_img1.gif`,
    imgThumb:`https://www.texaslottery.com/export/sites/lottery/Images/scratchoffs/${gameNumber}_200X200.gif`,
  };
}

async function getDetailUrl(gameNumber) {
  const html = await fetchText('https://www.texaslottery.com/export/sites/lottery/Games/Scratch_Offs/all.html');
  const re1 = new RegExp('<a[^>]*title="[^"]*' + gameNumber + '[^"]*"[^>]*href="([^"]+details\\.html_[^"]+)"', 'i');
  const re2 = new RegExp('<a[^>]*href="([^"]+details\\.html_[^"]+)"[^>]*title="[^"]*' + gameNumber + '[^"]*"', 'i');
  const m1 = html.match(re1) || html.match(re2);
  if (m1) {
    const url = m1[1].trim();
    return url.startsWith('http') ? url : 'https://www.texaslottery.com' + url;
  }
  return null;
}

// ── routes ───────────────────────────────────────────────────────────────────

app.get('/api/tlc/draw', async (req, res) => {
  try {
    const base = 'https://www.texaslottery.com/export/sites/lottery/Games';
    const [pbHtml, tsHtml, cfHtml, aonHtml] = await Promise.all([
      fetchText(base + '/Powerball/index.html'),
      fetchText(base + '/Texas_Two_Step/index.html'),
      fetchText(base + '/Cash_Five/index.html'),
      fetchText(base + '/All_or_Nothing/index.html'),
    ]);
    const triplets = parseAllJackpots(pbHtml);
    const games = [];
    const bannerNames = ['Powerball', 'Mega Millions', 'Lotto Texas'];
    bannerNames.forEach((name, i) => {
      if (triplets[i]) games.push({ name, ...triplets[i] });
    });
    const tsOwn = parseTwoStep(tsHtml);
    if (tsOwn) games.push({ name: 'Texas Two Step', ...tsOwn });
    const getNextDraw = html => { const m = html.match(/(?:Jackpot|Advertised|for)\s+(\d{2}\/\d{2}\/\d{4})/i); return m ? m[1] : null; };
    games.push({ name: 'Cash Five',      jackpot: '25,000',  cashValue: null, nextDraw: getNextDraw(cfHtml) });
    games.push({ name: 'All or Nothing', jackpot: '250,000', cashValue: null, nextDraw: getNextDraw(aonHtml) });
    res.json({ ok: true, games, fetchedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/tlc/scratch/:gameNumber', async (req, res) => {
  const { gameNumber } = req.params;
  if (!/^\d{4}$/.test(gameNumber)) {
    return res.status(400).json({ ok: false, error: 'Game number must be 4 digits' });
  }
  try {
    const detailUrl = await getDetailUrl(gameNumber);
    if (!detailUrl) {
      return res.status(404).json({ ok: false, error: `Game #${gameNumber} not found in current games list` });
    }
    const html = await fetchText(detailUrl);
    const data = parseScratchDetail(html, gameNumber);
    res.json({ ok: true, ...data, fetchedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/tlc/scratch-csv', async (req, res) => {
  try {
    const csv = await fetchText('https://www.texaslottery.com/export/sites/lottery/Games/Scratch_Offs/scratchoff.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/tlc/image', async (req, res) => {
  const { url } = req.query;
  if (!url || !url.includes('texaslottery.com')) return res.status(400).json({ ok: false });
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return res.status(404).json({ ok: false });
    const buf = await r.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');
    const mime = r.headers.get('content-type') || 'image/gif';
    res.json({ ok: true, dataUrl: `data:${mime};base64,${b64}` });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🎫 Lottery App server running at http://localhost:${PORT}`);
});
