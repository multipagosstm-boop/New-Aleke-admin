import { GoogleGenAI } from '@google/genai';

const SYSTEM_INSTRUCTION = `Eres Aleke Asistente, el asistente virtual del sistema contable y financiero Aleke System.
Ayudas a los administradores a consultar saldos, registrar movimientos, revisar extractos por pagar, compras por tarjeta, arriendos Rooftop, préstamos Pakredito y clientes.
Cuando te compartan imágenes de vouchers o recibos, analiza detalladamente el soporte extrayendo: valor total, fecha, concepto/referencia, beneficiario o tercero, y número de comprobante o transacción.
Responde siempre en español, de forma clara, profesional y estructurada.`;
export async function askAlekeAssistant({ message, conversationHistory = [], imageBase64 = null, mimeType = 'image/jpeg' }) {
  const apiKey =
    import.meta.env.VITE_GEMINI_API_KEY ||
    (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '') ||
    '';
  const ai = new GoogleGenAI(apiKey ? { apiKey } : {});

  const contents = [];
  for (const msg of conversationHistory) {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    });
  }

  const currentParts = [];
  if (imageBase64) {
    currentParts.push({
      inlineData: {
        data: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
        mimeType
      }
    });
  }
  if (message) {
    currentParts.push({ text: message });
  }

  contents.push({
    role: 'user',
    parts: currentParts
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.3
      }
    });
    return response.text || 'No se obtuvo respuesta del asistente.';
  } catch (error) {
    console.error('Gemini error:', error);
    return `Error al consultar con Gemini: ${error.message}`;
  }
}
