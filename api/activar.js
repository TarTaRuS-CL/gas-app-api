export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' });

  const { nombre, correo, imagen } = req.body || {};
  if (!nombre || !correo) return res.status(400).json({ error: 'Nombre y correo son obligatorios' });

  const RESEND_KEY = process.env.RESEND_API_KEY;
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  if (!RESEND_KEY) return res.status(500).json({ error: 'Servicio de correo no configurado' });

  const attachments = [];
  if (imagen) {
    const base64Data = imagen.replace(/^data:image\/\w+;base64,/, '');
    attachments.push({
      filename: 'comprobante_' + nombre.replace(/\s+/g, '_') + '_' + Date.now() + '.jpg',
      content: base64Data
    });
  }

  const fechaHora = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });
  const htmlBody = '<div style="font-family:Arial,sans-serif"><h2 style="color:#0b5cab">Nueva solicitud de activacion</h2><p><b>Nombre:</b> ' + nombre + '</p><p><b>Correo:</b> ' + correo + '</p><p><b>Fecha:</b> ' + fechaHora + '</p><p>Ir a Supabase > usuarios_pagados > activar correo: ' + correo + '</p>' + (imagen ? '<p>Comprobante adjunto</p>' : '<p>Sin imagen adjunta</p>') + '</div>';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'App Gas Instaladores <onboarding@resend.dev>',
        to: [ADMIN_EMAIL],
        subject: 'Activacion solicitada — ' + nombre,
        html: htmlBody,
        ...(attachments.length > 0 && { attachments })
      })
    });
    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: 'Error al enviar correo' });
    }
    return res.status(200).json({ ok: true, mensaje: 'Solicitud enviada correctamente' });
  } catch (error) {
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
