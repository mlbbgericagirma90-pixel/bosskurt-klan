const TABS = ['binek', 'yumurta', 'beceri', 'cekic', 'iksir'];
const ROWS = 50;

function redisUrl() {
  return process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL;
}
function redisToken() {
  return process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN;
}

async function redis(cmd) {
  const url = redisUrl(), token = redisToken();
  if (!url || !token) throw new Error('Veritabanı bağlantısı bulunamadı (ortam değişkenleri eksik).');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function toBoard(flat) {
  const h = {};
  for (let i = 0; i < flat.length; i += 2) h[flat[i]] = flat[i + 1];
  return {
    rows: Array.from({ length: ROWS }, (_, i) => ({
      index: i,
      name: h[`r${i}:name`] ?? '',
      quantity: num(h[`r${i}:quantity`]),
      secondary: num(h[`r${i}:secondary`]),
      cost: num(h[`r${i}:cost`]),
    })),
    settings: {
      unitPoints: num(h['s:unitPoints']),
      secondaryPoints: num(h['s:secondaryPoints']),
    },
    isAdmin: false,
    ownerConfigured: false,
  };
}

function fieldKey(c) {
  if (c.kind === 'settings') {
    return ['unitPoints', 'secondaryPoints'].includes(c.field) ? `s:${c.field}` : null;
  }
  const i = Number(c.index);
  if (c.kind !== 'row' || !Number.isInteger(i) || i < 0 || i >= ROWS) return null;
  if (!['name', 'quantity', 'secondary', 'cost'].includes(c.field)) return null;
  return `r${i}:${c.field}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const tab = String(req.query.tab || '');
  if (!TABS.includes(tab)) return res.status(400).json({ error: 'Geçersiz sekme.' });
  const key = `board:${tab}`;

  try {
    if (req.method === 'GET') {
      const flat = (await redis(['HGETALL', key])) || [];
      return res.status(200).json(toBoard(flat));
    }
    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const f = fieldKey(body);
      if (!f) return res.status(400).json({ error: 'Geçersiz değişiklik.' });
      const isName = f.endsWith(':name');
      const v = isName ? String(body.value ?? '').slice(0, 40) : num(body.value);
      if (v === null) await redis(['HDEL', key, f]);
      else await redis(['HSET', key, f, String(v)]);
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ error: 'Desteklenmeyen istek.' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Sunucu hatası.' });
  }
};
