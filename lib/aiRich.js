/**
 * Module: AIRich Message Builder for WhatsApp (Meta AI Rich Response)
 * Supports WhatsApp AI Rich Response HTML Primitives (GenAIaeacdsnwHtmlPrimitive)
 * Specially designed for rich Pinterest galleries, AI cards, and interactive responses.
 */

'use strict';

const crypto = require('crypto');
const {
    generateWAMessageFromContent,
    generateMessageIDV2
} = require('@whiskeysockets/baileys');

function stringifyEscaped(obj) {
    return JSON.stringify(obj).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

function generateVerificationMetadata() {
    const signatureMaterial = Buffer.from('NIXEL.MessageBuilderV4.7-VerificationSignature.Metadata');
    const certificateMaterial = Buffer.from('NIXEL.MessageBuilderV4.7-CertificateChain.Metadata');
    const signature = Buffer.concat([
        signatureMaterial,
        crypto.randomBytes(Math.max(0, 64 - signatureMaterial.length))
    ]).toString('base64');

    const certificateChain = [
        Buffer.concat([
            certificateMaterial,
            crypto.randomBytes(Math.max(0, 684 - certificateMaterial.length))
        ]).toString('base64')
    ];

    return {
        signature,
        certificateChain
    };
}

class AIRich {
    /**
     * @param {import('@whiskeysockets/baileys').WASocket} client 
     */
    constructor(client, options = {}) {
        if (!client) {
            throw new Error('Socket client is required for AIRich');
        }
        this._client = client;
        this._title = options.title || '📌 Pinterest AI Rich Response';
        this._footer = options.footer || '';
        this._sections = [];
        this._submessages = [];
        this._contextInfo = {};
        this._responseId = crypto.randomUUID();
        this._botResponseId = crypto.randomUUID();
        this._lastMessageKey = null;
    }

    setTitle(title) {
        if (typeof title === 'string') this._title = title;
        return this;
    }

    setFooter(footer) {
        if (typeof footer === 'string') this._footer = footer;
        return this;
    }

    setContextInfo(contextInfo) {
        if (contextInfo && typeof contextInfo === 'object') {
            this._contextInfo = { ...this._contextInfo, ...contextInfo };
        }
        return this;
    }

    /**
     * Menambahkan payload HTML yang akan di-render langsung oleh WhatsApp
     * Menggunakan Meta AI primitive GenAIaeacdsnwHtmlPrimitive
     * @param {string} html 
     */
    addHtml(html, options = {}) {
        if (typeof html !== 'string' || !html.trim()) {
            throw new Error('HTML payload string is required');
        }

        const section = {
            view_model: {
                primitive: {
                    __typename: 'GenAIaeacdsnwHtmlPrimitive',
                    payload: html,
                    trusted_sources: options.trusted_sources || []
                },
                __typename: 'GenAISingleLayoutViewModel'
            }
        };

        this._sections.push(section);
        return this;
    }

    /**
     * Menambahkan teks Markdown ke Rich Response
     * @param {string} text 
     */
    addText(text) {
        if (typeof text !== 'string') return this;

        const section = {
            view_model: {
                primitive: {
                    __typename: 'GenAIMarkdownTextUXPrimitive',
                    text: text
                },
                __typename: 'GenAISingleLayoutViewModel'
            }
        };

        this._sections.push(section);
        this._submessages.push({
            messageType: 2,
            messageText: text
        });

        return this;
    }

    /**
     * Menambahkan Submessage fallback (untuk perangkat yang belum mendukung HTML primitive)
     * @param {object} submsg 
     */
    addSubmessage(submsg) {
        if (submsg && typeof submsg === 'object') {
            this._submessages.push(submsg);
        }
        return this;
    }

    /**
     * Membangun WAMessage botForwardedMessage richResponseMessage
     */
    async build(jid, { quoted, quotedParticipant, forwarded = true, messageId, ...options } = {}) {
        const forward = forwarded ? {
            forwardingScore: 1,
            isForwarded: true,
            forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
            forwardOrigin: 4
        } : {};

        const qObj = quoted ? {
            stanzaId: quoted?.key?.id || quoted?.id,
            participant: quotedParticipant || quoted?.key?.participant || quoted?.participant || quoted?.key?.remoteJid,
            quotedType: 0,
            quotedMessage: typeof quoted === 'object' && quoted !== null ? (quoted.message ?? quoted) : undefined
        } : {};

        const allSections = [...this._sections];
        if (this._footer) {
            allSections.push({
                view_model: {
                    primitive: {
                        __typename: 'GenAIMetadataTextPrimitive',
                        text: this._footer
                    },
                    __typename: 'GenAISingleLayoutViewModel'
                }
            });
        }

        const unifiedResponseData = Buffer.from(
            stringifyEscaped({
                response_id: this._responseId,
                sections: allSections
            })
        ).toString('base64');

        const messageContent = {
            messageContextInfo: {
                deviceListMetadata: {},
                deviceListMetadataVersion: 2,
                botMetadata: {
                    messageDisclaimerText: this._title,
                    verificationMetadata: generateVerificationMetadata(),
                    botResponseId: this._botResponseId
                }
            },
            botForwardedMessage: {
                message: {
                    richResponseMessage: {
                        messageType: 1,
                        submessages: this._submessages,
                        unifiedResponse: {
                            data: unifiedResponseData
                        },
                        contextInfo: {
                            ...forward,
                            ...qObj,
                            ...this._contextInfo
                        }
                    }
                }
            }
        };

        return generateWAMessageFromContent(
            jid,
            messageContent,
            { messageId: messageId || generateMessageIDV2(), userJid: jid, ...options }
        );
    }

    /**
     * Membangun pesan edit (ProtocolMessage Type 14) untuk memicu auto-load instan di WhatsApp client
     */
    async buildEdit(targetJid, targetId, { msg, messageId, ...options } = {}) {
        if (!msg) {
            msg = (await this.build(targetJid, options)).message;
        }

        return generateWAMessageFromContent(
            targetJid,
            {
                botForwardedMessage: {
                    message: {
                        protocolMessage: {
                            key: {
                                remoteJid: targetJid,
                                fromMe: true,
                                id: targetId
                            },
                            type: 14,
                            editedMessage: msg
                        }
                    }
                }
            },
            { messageId: messageId || generateMessageIDV2(), userJid: targetJid, ...options }
        );
    }

    /**
     * Mengirim Rich Response dan melakukan sendEdit agar langsung di-render oleh WhatsApp client
     */
    async send(jid, { quoted, bypassDownload = true, additionalNodes = [], ...options } = {}) {
        const msg = await this.build(jid, { quoted, ...options });

        await this._client.relayMessage(msg.key.remoteJid, msg.message, {
            messageId: msg.key.id,
            additionalNodes,
            ...options
        });

        this._lastMessageKey = msg.key;

        if (bypassDownload) {
            try {
                const msgEdit = await this.buildEdit(jid, msg.key.id, { msg: msg.message });
                await this._client.relayMessage(jid, msgEdit.message, {
                    messageId: msgEdit.key.id,
                    additionalNodes
                });
            } catch (editErr) {
                console.warn('[AIRich] Bypass download edit warning:', editErr.message);
            }
        }

        return msg;
    }
}

/**
 * Menghasilkan UI HTML Pinterest modern, responsif, dan elegan untuk di-load WhatsApp
 * @param {string} query
 * @param {string[]} images
 * @param {object} meta
 */
function generatePinterestHtml(query, images = [], meta = {}) {
    const total = images.length;
    const safeQuery = String(query || 'Pinterest').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    const botName = meta.botName || 'EndLess Bot';

    const cardsHtml = images.map((imgUrl, idx) => {
        const safeUrl = String(imgUrl).replace(/[<>&"]/g, '');
        return `
        <div class="pin-card">
            <div class="pin-thumb-wrapper">
                <img src="${safeUrl}" alt="Pin #${idx + 1}" loading="lazy" class="pin-img" onerror="this.parentElement.parentElement.style.display='none'" />
                <span class="pin-badge">#${idx + 1}</span>
            </div>
            <div class="pin-info">
                <div class="pin-title">${safeQuery} • Pin ${idx + 1}</div>
                <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="pin-btn">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12c0 4.18 2.56 7.76 6.22 9.27-.09-.79-.16-2 .03-2.87.18-.78 1.16-4.94 1.16-4.94s-.3-.6-.3-1.48c0-1.39.81-2.43 1.81-2.43.85 0 1.26.64 1.26 1.41 0 .86-.55 2.14-.83 3.33-.24 1 .49 1.82 1.48 1.82 1.78 0 3.14-1.87 3.14-4.57 0-2.39-1.72-4.06-4.18-4.06-2.85 0-4.52 2.14-4.52 4.34 0 .86.33 1.78.74 2.28.08.1.09.19.07.29-.08.31-.25 1.02-.28 1.16-.04.18-.15.22-.34.13-1.27-.59-2.06-2.44-2.06-3.93 0-3.2 2.33-6.14 6.71-6.14 3.52 0 6.26 2.51 6.26 5.86 0 3.5-2.21 6.32-5.27 6.32-1.03 0-2-.54-2.33-1.17l-.64 2.43c-.23.89-.86 2.01-1.28 2.7 1.01.31 2.07.48 3.18.48 5.52 0 10-4.48 10-10S17.52 2 12 2z"/>
                    </svg>
                    <span>Buka HD</span>
                </a>
            </div>
        </div>
        `;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<title>Pinterest Discovery - ${safeQuery}</title>
<style>
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #0b0f19;
    color: #f8fafc;
    padding: 14px;
    -webkit-font-smoothing: antialiased;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 12px;
    margin-bottom: 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .brand-icon {
    width: 28px;
    height: 28px;
    background: #e60023;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(230, 0, 35, 0.4);
  }
  .brand-icon svg {
    fill: #ffffff;
    width: 17px;
    height: 17px;
  }
  .brand-title {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.2px;
    color: #ffffff;
  }
  .query-tag {
    font-size: 12px;
    font-weight: 600;
    padding: 4px 10px;
    background: rgba(230, 0, 35, 0.15);
    color: #ff6b81;
    border: 1px solid rgba(230, 0, 35, 0.3);
    border-radius: 999px;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .info-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    font-size: 12px;
    color: #94a3b8;
  }
  .count-badge {
    color: #e2e8f0;
    font-weight: 600;
  }
  .grid-container {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
  }
  .pin-card {
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 14px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .pin-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
  }
  .pin-thumb-wrapper {
    position: relative;
    width: 100%;
    background: #0f172a;
    aspect-ratio: 3/4;
    overflow: hidden;
  }
  .pin-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.3s ease;
  }
  .pin-card:hover .pin-img {
    transform: scale(1.04);
  }
  .pin-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    color: #ffffff;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 6px;
  }
  .pin-info {
    padding: 8px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    justify-content: space-between;
  }
  .pin-title {
    font-size: 11px;
    font-weight: 600;
    color: #cbd5e1;
    line-height: 1.3;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .pin-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    background: #e60023;
    color: #ffffff;
    text-decoration: none;
    font-size: 11px;
    font-weight: 600;
    padding: 6px 10px;
    border-radius: 8px;
    transition: background 0.2s;
  }
  .pin-btn:hover {
    background: #b8001c;
  }
  .footer {
    margin-top: 18px;
    text-align: center;
    font-size: 11px;
    color: #64748b;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    padding-top: 10px;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="brand-icon">
        <svg viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12c0 4.18 2.56 7.76 6.22 9.27-.09-.79-.16-2 .03-2.87.18-.78 1.16-4.94 1.16-4.94s-.3-.6-.3-1.48c0-1.39.81-2.43 1.81-2.43.85 0 1.26.64 1.26 1.41 0 .86-.55 2.14-.83 3.33-.24 1 .49 1.82 1.48 1.82 1.78 0 3.14-1.87 3.14-4.57 0-2.39-1.72-4.06-4.18-4.06-2.85 0-4.52 2.14-4.52 4.34 0 .86.33 1.78.74 2.28.08.1.09.19.07.29-.08.31-.25 1.02-.28 1.16-.04.18-.15.22-.34.13-1.27-.59-2.06-2.44-2.06-3.93 0-3.2 2.33-6.14 6.71-6.14 3.52 0 6.26 2.51 6.26 5.86 0 3.5-2.21 6.32-5.27 6.32-1.03 0-2-.54-2.33-1.17l-.64 2.43c-.23.89-.86 2.01-1.28 2.7 1.01.31 2.07.48 3.18.48 5.52 0 10-4.48 10-10S17.52 2 12 2z"/>
        </svg>
      </div>
      <span class="brand-title">Pinterest Gallery</span>
    </div>
    <span class="query-tag">🔍 ${safeQuery}</span>
  </div>

  <div class="info-bar">
    <span>Ditemukan <span class="count-badge">${total} pin berkualitas tinggi</span></span>
    <span>⚡ AIRich Interactive</span>
  </div>

  <div class="grid-container">
    ${cardsHtml}
  </div>

  <div class="footer">
    <span>${botName} • WhatsApp AI Rich Response HTML</span>
  </div>
</body>
</html>`;
}

/**
 * Fungsi siap pakai untuk mengirim Pinterest via AIRich Response HTML
 * @param {import('@whiskeysockets/baileys').WASocket} sock 
 * @param {string} jid 
 * @param {object} params
 */
async function sendPinterestAIRich(sock, jid, { query, results, quoted, botName = 'EndLess Bot' }) {
    if (!results || results.length === 0) {
        throw new Error('Tidak ada gambar Pinterest untuk dikirim');
    }

    const html = generatePinterestHtml(query, results.slice(0, 16), { botName });
    const rich = new AIRich(sock, {
        title: `📌 Pinterest • ${query}`
    });

    // 1. Tambahkan Payload HTML (di-load langsung oleh WhatsApp yang mendukung Meta AI Rich HTML)
    rich.addHtml(html);

    // 2. Tambahkan submessage Text & Grid Image Fallback (agar WhatsApp Web / iOS tetap melihat gambar & detail)
    const captionText = `📌 *PINTEREST AI RICH RESPONSE*\n\n` +
        `🔍 *Kueri:* ${query}\n` +
        `📸 *Total Pin:* ${results.length} foto HD\n` +
        `🌐 *Tampilan:* Interactive HTML Board dimuat oleh WhatsApp.\n\n` +
        `💡 *Tips:* Jika perangkat Anda mendukung WhatsApp Meta AI Rich UI, galeri HTML interaktif akan tampil di atas.`;

    rich.addSubmessage({
        messageType: 2,
        messageText: captionText
    });

    // Grid Image Preview metadata
    if (results.length > 0) {
        const previewImages = results.slice(0, 4).map((url) => ({
            imagePreviewUrl: url,
            imageHighResUrl: url,
            sourceUrl: url
        }));

        rich.addSubmessage({
            messageType: 1,
            gridImageMetadata: {
                gridImageUrl: {
                    imagePreviewUrl: results[0]
                },
                imageUrls: previewImages
            }
        });
    }

    return await rich.send(jid, {
        quoted,
        bypassDownload: true
    });
}

let cachedAcademyHtml = null;
let lastAcademyFetchTime = 0;

/**
 * Mengambil HTML terbaru dari academy-endless.vercel.app dengan in-memory cache
 */
async function getAcademyHtml() {
    const now = Date.now();
    if (cachedAcademyHtml && (now - lastAcademyFetchTime < 5 * 60 * 1000)) {
        return cachedAcademyHtml;
    }

    try {
        const res = await fetch('https://academy-endless.vercel.app/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let html = await res.text();

        // Tambahkan base tag agar semua resource relatif bekerja di webview WhatsApp
        if (!html.includes('<base')) {
            html = html.replace(/<head[^>]*>/i, '$&\n<base href="https://academy-endless.vercel.app/">');
        }

        cachedAcademyHtml = html;
        lastAcademyFetchTime = now;
        return html;
    } catch (err) {
        if (cachedAcademyHtml) return cachedAcademyHtml;
        throw err;
    }
}

/**
 * Mengirim tampilan Web Academy (academy-endless.vercel.app) melalui WhatsApp Meta AI AIRich HTML Response
 * @param {import('@whiskeysockets/baileys').WASocket} sock 
 * @param {string} jid 
 * @param {object} options
 */
async function sendAcademyAIRich(sock, jid, { quoted, botName = 'EndLess Bot' } = {}) {
    const html = await getAcademyHtml();
    const rich = new AIRich(sock, {
        title: '🌐 EndLess Academy • Forge Your Skills'
    });

    // 1. Tambahkan Payload HTML halaman academy-endless.vercel.app
    rich.addHtml(html, {
        trusted_sources: ['https://academy-endless.vercel.app/']
    });

    // 2. Tambahkan submessage fallback untuk perangkat non-HTML view
    const captionText = `🌐 *ENDLESS ACADEMY*\n\n` +
        `📚 *Forge Your Skills, Shape Your Era*\n` +
        `🔗 *URL:* https://academy-endless.vercel.app/\n\n` +
        `✨ *Halaman web HTML interaktif sedang dimuat oleh WhatsApp.*\n` +
        `💡 *Tips:* Jika perangkat Anda mendukung WhatsApp Meta AI Rich UI, tampilan web lengkap akan muncul di atas.`;

    rich.addSubmessage({
        messageType: 2,
        messageText: captionText
    });

    return await rich.send(jid, {
        quoted,
        bypassDownload: true
    });
}

module.exports = {
    AIRich,
    generateVerificationMetadata,
    generatePinterestHtml,
    sendPinterestAIRich,
    getAcademyHtml,
    sendAcademyAIRich
};
