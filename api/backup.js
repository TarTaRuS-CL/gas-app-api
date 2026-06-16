// POST /api/backup
// Body: { email, data }
// Valida que el correo tenga licencia activa, luego guarda (o actualiza)
// el respaldo en la tabla user_backups de Supabase.
// Solo usuarios con membersía vigente pueden usar esta función.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'metodo-no-permitido' });

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPA_URL || !SUPA_KEY) return res.status(500).json({ ok: false, error: 'config-faltante' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  if (!body || typeof body !== 'object') body = {};

  const email = (body.email || '').toString().trim().toLowerCase();
  const data  = body.data;

  if (!email) return res.status(400).json({ ok: false, error: 'falta-email' });
  if (!data || typeof data !== 'object') return res.status(400).json({ ok: false, error: 'falta-data' });

  // ── 1. Validar que el correo tiene licencia activa ─────────────────────────────────────
  const hoy = new Date().toISOString().slice(0, 10);
  try {
    const filtro = `email=eq.${encodeURIComponent(email)}&activo=eq.true`;
    const urlLic = `${SUPA_URL}/rest/v1/usuarios_pagados?select=email,activo,vence&${filtro}`;
    const rLic = await fetch(urlLic, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    });
    if (!rLic.ok) return res.status(502).json({ ok: false, error: 'error-validacion' });
    const rows = await rLic.json();
    const vigente = Array.isArray(rows) && rows.some(u => u.activo && (!u.vence || u.vence >= hoy));
    if (!vigente) return res.status(403).json({ ok: false, error: 'sin-membresia' });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'excepcion-validacion' });
  }

  // ── 2. Guardar/actualizar respaldo ─────────────────────────────────────────
  try {
    const payload = JSON.stringify({
      email,
      data,
      updated_at: new Date().toISOString()
    });
    const urlBackup = `${SUPA_URL}/rest/v1/user_backups`;
    const rBackup = await fetch(urlBackup, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: payload
    });
    if (!rBackup.ok) {
      const errText = await rBackup.text();
      return res.status(502).json({ ok: false, error: 'error-guardado', detalle: errText });
    }
    return res.status(200).json({ ok: true, mensaje: 'Respaldo guardado correctamente.' });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'excepcion-guardado' });
  }
};
