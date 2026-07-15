require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHAT_ID;
const SENT_PRODUCTS_FILE = path.join(__dirname, '../data/sent_products.json');

// Funzione per estrarre ASIN da un testo
function extractASINs(text) {
    const asinPattern = /\/dp\/([A-Z0-9]{10})/gi;
    const matches = [...text.matchAll(asinPattern)];
    return matches.map(match => match[1]);
}

// Funzione per caricare i prodotti già inviati
function loadSentProducts() {
    try {
        const data = fs.readFileSync(SENT_PRODUCTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log('File sent_products.json non trovato, creazione nuovo registro');
        return { sent_asins: [], last_updated: new Date().toISOString() };
    }
}

// Funzione per salvare i prodotti inviati
function saveSentProducts(data) {
    fs.writeFileSync(SENT_PRODUCTS_FILE, JSON.stringify(data, null, 2));
}

// Funzione principale
async function syncTelegramMessages() {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
        console.error('❌ TELEGRAM_BOT_TOKEN o TELEGRAM_CHANNEL_ID non configurati nel file .env');
        process.exit(1);
    }
    
    console.log('🔍 Sincronizzazione messaggi Telegram...');
    console.log(`📢 Canale: ${TELEGRAM_CHANNEL_ID}`);
    
    try {
        // Ottieni gli ultimi 100 messaggi usando getUpdates
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;
        const response = await axios.get(url, {
            params: {
                limit: 100,
                timeout: 30
            }
        });
        
        if (response.data.ok) {
            const updates = response.data.result;
            const sentData = loadSentProducts();
            const existingAsins = new Set(sentData.sent_asins);
            const newAsins = [];
            
            console.log(`📨 Aggiornamenti trovati: ${updates.length}`);
            
            for (const update of updates) {
                if (update.channel_post && update.channel_post.text) {
                    const text = update.channel_post.text;
                    const asins = extractASINs(text);
                    
                    for (const asin of asins) {
                        if (!existingAsins.has(asin) && !newAsins.includes(asin)) {
                            newAsins.push(asin);
                            console.log(`✅ Nuovo ASIN trovato: ${asin}`);
                        }
                    }
                }
            }
            
            if (newAsins.length > 0) {
                // Aggiungi i nuovi ASIN alla lista
                sentData.sent_asins = [...sentData.sent_asins, ...newAsins];
                sentData.last_updated = new Date().toISOString();
                
                saveSentProducts(sentData);
                
                console.log(`\n🎉 Sincronizzazione completata!`);
                console.log(`📊 ASIN aggiunti: ${newAsins.length}`);
                console.log(`📦 Totale ASIN nel registro: ${sentData.sent_asins.length}`);
            } else {
                console.log(`\nℹ️ Nessun nuovo ASIN trovato nei messaggi Telegram.`);
            }
        } else {
            console.error('❌ Errore API Telegram:', response.data.description);
        }
    } catch (error) {
        console.error('❌ Errore durante la sincronizzazione:', error.message);
    }
}

// Esecuzione
syncTelegramMessages().then(() => {
    console.log('\n✅ Script completato');
    process.exit(0);
}).catch((error) => {
    console.error('❌ Errore fatale:', error);
    process.exit(1);
});
