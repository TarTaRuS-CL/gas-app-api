// Endpoint de validación de licencia — Vercel Serverless Function
// Recibe { id } (RUT, correo, o token temporal de administrador) y responde
// { desbloqueada: true|false, catalogo: true|false }.
// - desbloqueada: licencia vigente (o token admin válido)
// - catalogo: suscripción al catálogo de precios activa
// Consulta Supabase usando la SERVICE KEY, que vive SOLO aquí (variable de entorno).
// Los tokens temporales (ACCESO-XXXXXX) se validan sin consultar Supabase.

const crypto = require('crypto');
const VENTANA_MS = 2 * 60 * 60 * 1000; // ventana de 2 horas (igual que admin-token.js)

function esTokenAdminValido(idLower, secret) {
  // Acepta el token de la ventana actual y la anterior (tolerancia en el cambio de ventana)
  const ventana = Math.floor(Date.now() / VENTANA_MS);
  for (const v of [ventana, ventana - 1]) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update('admin-token-v1-' + v);
    if (idLower === 'acceso-' + hmac.digest('hex').slice(0, 6)) return true;
  }
  return false;
}

module.exports = async function handler(req, res) {
  // CORS (permite que la app en Netlify llame a este endpoint)
  res.setHeader('Access-Control-Allow-Origin', '*'); // puedes restringir a tu dominio de Netlify
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ desbloqueada: false, error: 'metodo-no-permitido' });

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPA_URL || !SUPA_KEY) return res.status(500).json({ desbloqueada: false, error: 'config-faltante' });

  // Leer el cuerpo (Vercel suele entregar req.body ya parseado)
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  if (!body || typeof body !== 'object') body = {};

  const idRaw = (body.id || '').toString().trim().toLowerCase();
  if (!idRaw) return res.status(400).json({ desbloqueada: false, error: 'falta-id' });

  // ── Token temporal de administrador (ACCESO-XXXXXX) ──────────────────────
  // Si el id tiene el formato de un token admin, lo validamos sin tocar Supabase.
  const MASTER = process.env.ADMIN_MASTER_KEY;
  if (MASTER && /^acceso-[0-9a-f]{6}$/.test(idRaw)) {
    if (esTokenAdminValido(idRaw, MASTER)) {
      return res.status(200).json({ desbloqueada: true, catalogo: false });
    }
    return res.status(200).json({ desbloqueada: false, error: 'token-expirado' });
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Normaliza un posible RUT (quita puntos, guion y espacios)
  const rut = idRaw.replace(/[.\-\s]/g, '');
  const hoy = new Date().toISOString().slice(0, 10);

  try {
    // Busca por correo O por rut, en la tabla usuarios_pagados
    const filtro = `or=(email.eq.${encodeURIComponent(idRaw)},rut.eq.${encodeURIComponent(rut)})`;
    const url = `${SUPA_URL}/rest/v1/usuarios_pagados?select=email,rut,activo,vence,catalogo,catalogo_vence&${filtro}`;
    const r = await fetch(url, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    });
    if (!r.ok) return res.status(502).json({ desbloqueada: false, error: 'error-consulta' });
    const rows = await r.json();
    const vigentes = Array.isArray(rows) ? rows.filter(u => u.activo && (!u.vence || u.vence >= hoy)) : [];
    const ok = vigentes.length > 0;
    // Suscripción al catálogo: requiere licencia vigente + flag catalogo + (sin vencimiento o no vencida)
    const cat = vigentes.some(u => u.catalogo && (!u.catalogo_vence || u.catalogo_vence >= hoy));
    return res.status(200).json({ desbloqueada: !!ok, catalogo: !!cat });
  } catch (e) {
    return res.status(502).json({ desbloqueada: false, error: 'excepcion' });
  }
};
