const TABS = ['binek', 'yumurta', 'beceri', 'cekic', 'iksir'];
const ROW_FIELDS = ['name', 'quantity', 'secondary', 'cost'];
const SETTING_COLUMNS: Record<string, string> = {
  unitPoints: 'unit_points',
  secondaryPoints: 'secondary_points',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function toNumber(value: unknown): number | null | undefined {
  if (value === null || value === '' || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

async function readBoard(db: any, tab: string) {
  const rows = await db
    .prepare('SELECT idx, name, quantity, secondary, cost FROM board_rows WHERE tab = ? ORDER BY idx')
    .bind(tab)
    .all();
  const s = await db
    .prepare('SELECT unit_points, secondary_points FROM settings WHERE tab = ?')
    .bind(tab)
    .first();

  return {
    rows: rows.results.map((r: any) => ({
      index: r.idx,
      name: r.name ?? '',
      quantity: r.quantity,
      secondary: r.secondary,
      cost: r.cost,
    })),
    settings: {
      unitPoints: s?.unit_points ?? null,
      secondaryPoints: s?.secondary_points ?? null,
    },
    isAdmin: false,
    ownerConfigured: false,
  };
}

export async function onRequest(context: any) {
  const { request, env } = context;
  const db = env.DB;
  const tab = new URL(request.url).searchParams.get('tab');

  if (!tab || !TABS.includes(tab)) {
    return json({ error: 'Geçersiz sekme.' }, 400);
  }

  if (request.method === 'GET') {
    return json(await readBoard(db, tab));
  }

  if (request.method === 'DELETE') {
    await db
      .prepare("UPDATE board_rows SET name = '', quantity = NULL, secondary = NULL, cost = NULL WHERE tab = ?")
      .bind(tab)
      .run();
    return json(await readBoard(db, tab));
  }

  if (request.method === 'PATCH') {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Geçersiz istek.' }, 400);
    }

    if (body.kind === 'settings') {
      const column = SETTING_COLUMNS[body.field];
      const value = toNumber(body.value);
      if (!column) return json({ error: 'Geçersiz ayar.' }, 400);
      if (value === undefined) return json({ error: 'Geçersiz puan değeri.' }, 400);
      await db
        .prepare(`UPDATE settings SET ${column} = ? WHERE tab = ?`)
        .bind(value, tab)
        .run();
    } else if (body.kind === 'row') {
      const index = Number(body.index);
      if (!Number.isInteger(index) || index < 0 || index > 49) {
        return json({ error: 'Geçersiz satır.' }, 400);
      }
      if (!ROW_FIELDS.includes(body.field)) {
        return json({ error: 'Geçersiz alan.' }, 400);
      }

      let value: string | number | null;
      if (body.field === 'name') {
        value = typeof body.value === 'string' ? body.value.slice(0, 40) : '';
      } else {
        const n = toNumber(body.value);
        if (n === undefined) return json({ error: 'Geçersiz sayı.' }, 400);
        value = n;
      }

      await db
        .prepare(`UPDATE board_rows SET ${body.field} = ? WHERE tab = ? AND idx = ?`)
        .bind(value, tab, index)
        .run();
    } else {
      return json({ error: 'Geçersiz istek türü.' }, 400);
    }

    return json({ ok: true });
  }

  return json({ error: 'Desteklenmeyen istek.' }, 405);
    }
