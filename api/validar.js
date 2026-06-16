// Endpoint de validacion de licencia — Vercel Serverless Function
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ desbloqueada: false });
  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPA_URL || !SUPA_KEY) return res.status(500).json({ desbloqueada: false, error: 'config-faltante' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  if (!body || typeof body !== 'object') body = {};
  const idRaw = (body.id || '').toString().trim().toLowerCase();
  if (!idRaw) return res.status(400).json({ desbloqueada: false, error: 'falta-id' });
  const rut = idRaw.replace(/[.-s]/g, '');
  const hoy = new Date().toISOString().slice(0, 10);
  try {
    const filtro = 'or=(email.eq.' + encodeURIComponent(idRaw) + ',rut.eq.' + encodeURIComponent(rut) + ')';
    const url = SUPA_URL + '/rest/v1/usuarios_pagados?select=email,rut,activo,vence,catalogo,catalogo_vence&' + filtro;
    const r = await fetch(url, { headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY } });
    if (!r.ok) return res.status(502).json({ desbloqueada: false, error: 'error-consulta' });
    const rows = await r.json();
    const vigentes = Array.isArray(rows) ? rows.filter(u => u.activo && (!u.vence || u.vence >= hoy)) : [];
    const ok = vigentes.length > 0;
    const cat = vigentes.some(u => u.catalogo && (!u.catalogo_vence || u.catalogo_vence >= hoy));
    return res.status(200).json({ desbloqueada: !!ok, catalogo: !!cat });
  } catch (e) {
    return res.status(502).json({ desbloqueada: false, error: 'excepcion' });
  }
    };
