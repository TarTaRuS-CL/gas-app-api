// Endpoint para generar un token de acceso temporal (uso del administrador)
// Uso: GET /api/admin-token?master=TU_CLAVE_MAESTRA
// Responde { token, expira_en_minutos, uso } si la clave es correcta.
// El token generado es válido en /api/validar durante 2 horas.
// La clave maestra vive SOLO en las variables de entorno de Vercel (ADMIN_MASTER_KEY).

const crypto = require('crypto');

const VENTANA_MS = 2 * 60 * 60 * 1000; // ventana de 2 horas
const PREFIJO    = 'ACCESO-';           // formato visible del token

function tokenParaVentana(secret, ventana) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update('admin-token-v1-' + ventana);
  return PREFIJO + hmac.digest('hex').slice(0, 6).toUpperCase();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'metodo-no-permitido' });

  const MASTER = process.env.ADMIN_MASTER_KEY;
  if (!MASTER) return res.status(500).json({ error: 'ADMIN_MASTER_KEY no configurada en Vercel' });

  const { master } = req.query || {};
  if (!master || master !== MASTER) {
    return res.status(403).json({ error: 'acceso-denegado' });
  }

  const ventana = Math.floor(Date.now() / VENTANA_MS);
  const token   = tokenParaVentana(MASTER, ventana);

  const expiraEn = Math.floor(((ventana + 1) * VENTANA_MS - Date.now()) / 60000);

  return res.status(200).json({
    token,
    expira_en_minutos: expiraEn,
    uso: `Dile al cliente que ingrese este código en "Validar acceso": ${token} (expira en ${expiraEn} min)`
  });
};
