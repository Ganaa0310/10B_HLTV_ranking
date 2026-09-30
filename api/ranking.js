// Vercel serverless function. Data lives in Supabase (table "players").
// Env vars needed: SUPABASE_URL, SUPABASE_SERVICE_KEY, ADMIN_PASSWORD
const crypto = require('crypto');

const URL_BASE = () => process.env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/players';
const headers = () => ({
  apikey: process.env.SUPABASE_SERVICE_KEY,
  Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
  'Content-Type': 'application/json',
});

function passwordOk(given) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(process.env.ADMIN_PASSWORD || '');
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const action = req.query.action;
  try {
    if (action === 'list') {
      const r = await fetch(URL_BASE() + '?select=id,name,score&order=score.desc', { headers: headers() });
      if (!r.ok) throw new Error('db');
      return res.status(200).json({ players: await r.json() });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
    const body = req.body || {};

    if (!passwordOk(body.password)) {
      await new Promise(r => setTimeout(r, 800)); // slow down guessing
      return res.status(401).json({ error: 'wrong password' });
    }
    if (action === 'login') return res.status(200).json({ ok: true });

    if (action === 'save') {
      const list = body.players;
      if (!Array.isArray(list) || list.length > 200) return res.status(400).json({ error: 'bad data' });
      const players = [];
      for (const p of list) {
        const name = String((p && p.name) || '').trim().slice(0, 24);
        const score = Number(p && p.score);
        const id = String((p && p.id) || crypto.randomUUID()).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
        if (!name || !id || !Number.isFinite(score)) return res.status(400).json({ error: 'bad data' });
        players.push({ id, name, score: Math.round(score) });
      }
      // 1) add or update everyone in the list
      if (players.length) {
        const up = await fetch(URL_BASE() + '?on_conflict=id', {
          method: 'POST',
          headers: { ...headers(), Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify(players),
        });
        if (!up.ok) throw new Error('db');
      }
      // 2) remove anyone who is no longer in the list
      const filter = players.length
        ? 'id=not.in.(' + players.map(p => p.id).join(',') + ')'
        : 'id=neq.__none__';
      const del = await fetch(URL_BASE() + '?' + filter, { method: 'DELETE', headers: headers() });
      if (!del.ok) throw new Error('db');
      return res.status(200).json({ ok: true });
    }

    return res.status(404).json({ error: 'not found' });
  } catch (e) {
    return res.status(500).json({ error: 'server error' });
  }
};
