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

  const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
  let lastError = null;

  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.3
        }
      });
      if (response?.text) {
        return response.text;
      }
    } catch (error) {
      lastError = error;
      console.warn(`[Asistente] Falló con modelo ${model}:`, error?.message || error);
    }
  }

  const errMsg = lastError?.message || String(lastError || '');
  if (errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('UNAVAILABLE')) {
    return 'Google Gemini está experimentando alta demanda en este momento (Error 503 temporal). Por favor intenta de nuevo en unos segundos.';
  }
  return `Error al consultar con Gemini: ${errMsg}`;
}
