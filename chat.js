// Función serverless de Vercel: valida la clave del equipo y reenvía la conversación a la API de Claude.
// La API key vive solo aquí (variable de entorno), nunca en el navegador.

const crypto = require('crypto');
const { buildSystem } = require('../lib/agent');

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
const MAX_TOKENS = 2000;
const MAX_MESSAGES = 40;
const MAX_TEXT_CHARS = 200000;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanBlock(b) {
  if (!b || typeof b !== 'object') return null;
  if (b.type === 'text' && typeof b.text === 'string' && b.text.length <= MAX_TEXT_CHARS) {
    return { type: 'text', text: b.text };
  }
  if (b.type === 'document' && b.source && b.source.type === 'base64' &&
      b.source.media_type === 'application/pdf' && typeof b.source.data === 'string') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b.source.data } };
  }
  if (b.type === 'image' && b.source && b.source.type === 'base64' &&
      IMAGE_TYPES.includes(b.source.media_type) && typeof b.source.data === 'string') {
    return { type: 'image', source: { type: 'base64', media_type: b.source.media_type, data: b.source.data } };
  }
  return null;
}

// Devuelve la lista limpia de mensajes o null si algo no es válido.
function cleanMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return null;
  const out = [];
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return null;
    if (typeof m.content === 'string') {
      if (!m.content.trim() || m.content.length > MAX_TEXT_CHARS) return null;
      out.push({ role: m.role, content: m.content });
    } else if (Array.isArray(m.content) && m.content.length > 0 && m.role === 'user') {
      const blocks = m.content.map(cleanBlock);
      if (blocks.some((b) => b === null)) return null;
      out.push({ role: 'user', content: blocks });
    } else {
      return null;
    }
  }
  if (out[0].role !== 'user' || out[out.length - 1].role !== 'user') return null;

  // Cachea el primer documento para que las preguntas siguientes de la misma conversación salgan más baratas.
  for (const m of out) {
    if (Array.isArray(m.content)) {
      const idx = m.content.findIndex((b) => b.type === 'document' || b.type === 'image');
      if (idx >= 0) {
        m.content[idx].cache_control = { type: 'ephemeral' };
        break;
      }
    }
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const appPassword = process.env.APP_PASSWORD;
  if (!apiKey || !appPassword) {
    res.status(500).json({ error: 'El servidor no está configurado. Faltan ANTHROPIC_API_KEY o APP_PASSWORD.' });
    return;
  }

  const given = req.headers['x-access-key'] || '';
  if (!safeEqual(given, appPassword)) {
    await sleep(700);
    res.status(401).json({ error: 'Clave incorrecta.' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (body.check) {
    res.status(200).json({ ok: true });
    return;
  }

  const messages = cleanMessages(body.messages);
  if (!messages) {
    res.status(400).json({ error: 'La solicitud no es válida.' });
    return;
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystem(),
        messages,
        stream: true
      })
    });

    if (!upstream.ok) {
      let message = '';
      try { message = (await upstream.json()).error.message || ''; } catch (e) { /* sin detalle */ }
      console.error('Error de la API de Claude', upstream.status, message);
      if (upstream.status === 400 || upstream.status === 413 || upstream.status === 429) {
        res.status(upstream.status).json({ error: message || 'La API rechazó la solicitud.' });
      } else {
        res.status(502).json({ error: 'El servicio del asesor no está disponible en este momento.' });
      }
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    });
    for await (const chunk of upstream.body) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    console.error(err);
    if (res.headersSent) {
      res.end();
    } else {
      res.status(502).json({ error: 'No se pudo conectar con el servicio del asesor.' });
    }
  }
};
