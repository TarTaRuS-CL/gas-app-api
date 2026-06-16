// GET /api/restore?email=...
// Valida que el correo tenga licencia activa, luego devuelve
// el respaldo guardado en user_backups.
// Solo usuarios con membresía vigente pueden restaurar.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'metodo-no-permitido' });

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPA_URL || !SUPA_KEY) return res.status(500).json({ ok: false, error: 'config-faltante' });

  const email = ((req.query && req.query.email) || '').toString().trim().toLowerCase();
  if (!email) return res.status(400).json({ ok: false, error: 'falta-email' });

  // ── 1. Validar licencia activa ─────────────────────────────────────────────
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

  // ── 2. Recuperar respaldo ─────────────────────────────────────────────────
  try {
    const urlBackup = `${SUPA_URL}/rest/v1/user_backups?email=eq.${encodeURIComponent(email)}&select=data,updated_at`;
    const rBackup = await fetch(urlBackup, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    });
    if (!rBackup.ok) return res.status(502).json({ ok: false, error: 'error-lectura' });
    const rows = await rBackup.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'sin-respaldo' });
    }
    return res.status(200).json({ ok: true, data: rows[0].data, updated_at: rows[0].updated_at });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'excepcion-lectura' });
  }
};
