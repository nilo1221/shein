const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const winston = require('winston');
require('dotenv').config();

// Configurazione logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// Configurazione
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SITE_URL = process.env.SITE_URL;
const TELEGRAM_CHANNEL_URL = process.env.TELEGRAM_CHANNEL_URL || 'https://t.me/ilmigliorprezzo';
const INSTAGRAM_URL = process.env.INSTAGRAM_URL || 'https://www.instagram.com/smartchoiceguideamazon/';

// Nicchie da controllare (solo nicchie esistenti)
const NICCHIE_DA_CONTROLLARE = [
    'moda/abbigliamento-lavoro',
    'moda/abbigliamento-bambino',
    'moda/abbigliamento-donna',
    'moda/abbigliamento-uomo',
    'moda/serie-tv-cinema',
    'moda/abbigliamento-serie-tv-cinema',
    'tech/smartphone-tech',
    'tech/elite-gaming-gear',
    'casa/arredamento-casa',
    'casa/cucina-elettrodomestici',
    'casa/caffe-capsule',
    'casa/climatizzazione',
    'fai-da-te',
    'giochi-tavolo',
    'manga-anime',
    'outdoor-camping',
    'pet-care',
    'sport/abbigliamento-sportivo',
    'bambini-regali',
    'sport/home-fitness',
    'sport/integratori-pre-workout',
    'viaggi-vacanze',
    'viaggi-vacanze/mare-spiaggia'
];

// Percorsi dei file
const SENT_PRODUCTS_FILE = path.join(__dirname, '../data/sent_products.json');
const PRICE_RANGES_FILE = path.join(__dirname, '../data/price_ranges.json');
const PUBLIC_DIR = path.join(__dirname, '../public');

// User-Agent rotation
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
];

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Retry mechanism con exponential backoff
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === maxRetries - 1) throw error;
            
            const delay = baseDelay * Math.pow(2, attempt);
            console.log(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Carica il registro dei prodotti già inviati
function loadSentProducts() {
    try {
        const data = fs.readFileSync(SENT_PRODUCTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.warn('File sent_products.json non trovato, creazione nuovo registro');
        return { sent_asins: [], last_updated: null };
    }
}

// Salva il registro dei prodotti inviati
function saveSentProducts(data) {
    data.last_updated = new Date().toISOString();
    fs.writeFileSync(SENT_PRODUCTS_FILE, JSON.stringify(data, null, 2));
    logger.info('Registro prodotti salvato');
}

// Carica le fasce di prezzo per nicchia
function loadPriceRanges() {
    try {
        const data = fs.readFileSync(PRICE_RANGES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.warn('File price_ranges.json non trovato, uso default 0-50€');
        return {};
    }
}

// Estrae ASIN da un link Amazon
function extractASIN(url) {
    const match = url.match(/\/dp\/([A-Z0-9]{10})/i);
    return match ? match[1] : null;
}

// Estrae prezzo e immagine dalla pagina Amazon
async function extractProductData(asin) {
    return retryWithBackoff(async () => {
        try {
            const url = `https://www.amazon.it/dp/${asin}`;
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7'
                }
            });
            
            const $ = cheerio.load(response.data);
            
            // Estrae prezzo con molteplici selettori
            let price = null;
            
            // Funzione helper per convertire prezzo italiano in numero
            function parseItalianPrice(priceStr) {
                if (!priceStr) return null;
                // Rimuovi spazi e caratteri non numerici eccetto . e ,
                const cleaned = priceStr.replace(/[^\d.,]/g, '');
                if (!cleaned) return null;
                
                // Formato italiano: 1.234,56 (punto migliaia, virgola decimali)
                // Converti in formato JavaScript: 1234.56
                const parts = cleaned.split(',');
                if (parts.length === 2) {
                    // Ha decimali
                    const whole = parts[0].replace(/\./g, ''); // Rimuovi punti migliaia
                    const decimal = parts[1];
                    return parseFloat(`${whole}.${decimal}`);
                } else {
                    // Solo parte intera
                    return parseFloat(cleaned.replace(/\./g, ''));
                }
            }
            
            // Metodo 1: Prezzo principale (priorità al prezzo scontato/attuale)
            const priceWhole = $('#priceblock_ourprice_row .a-price-whole, #priceblock_dealprice_row .a-price-whole, #centerCol .a-price .a-price-whole').first().text().trim();
            const priceFraction = $('#priceblock_ourprice_row .a-price-fraction, #priceblock_dealprice_row .a-price-fraction, #centerCol .a-price .a-price-fraction').first().text().trim();
            
            if (priceWhole && priceFraction) {
                // Rimuovi virgole extra da priceWhole prima di combinare
                const cleanWhole = priceWhole.replace(/,/g, '');
                price = parseItalianPrice(`${cleanWhole},${priceFraction}`);
            }
            
            // Metodo 2: Prezzo in formato offscreen - filtra meglio per evitare prezzi listino/per unità
            if (!price) {
                const priceElements = $('.a-price .a-offscreen');
                let lowestPrice = null;
                priceElements.each((i, elem) => {
                    const priceText = $(elem).text().trim();
                    const parent = $(elem).closest('.a-price');
                    const priceSymbol = parent.find('.a-price-symbol').text().trim();
                    
                    // Evita prezzi "per unità", prezzi listino, e prezzi di venditori terzi
                    const isUnitPrice = priceText.toLowerCase().includes('/ unit') || 
                                      priceText.toLowerCase().includes('/unit') ||
                                      priceText.toLowerCase().includes('per unità') ||
                                      priceText.toLowerCase().includes('per kg') ||
                                      priceText.toLowerCase().includes('per 100');
                    
                    const isListPrice = parent.attr('data-a-strike') === 'true' ||
                                      parent.hasClass('a-text-strike') ||
                                      priceSymbol.includes('€') && parent.closest('.a-section').find('.a-text-strike').length > 0;
                    
                    if (!isUnitPrice && !isListPrice) {
                        const parsedPrice = parseItalianPrice(priceText);
                        if (parsedPrice && (!lowestPrice || parsedPrice > lowestPrice)) {
                            lowestPrice = parsedPrice;
                        }
                    }
                });
                if (lowestPrice) {
                    price = lowestPrice;
                }
            }
            
            // Metodo 3: Prezzo nel buybox (prezzo di vendita principale)
            if (!price) {
                const buyboxPrice = $('#price_inside_buybox, #buyBoxPrice, #newBuyBoxPrice').first().text().trim();
                if (buyboxPrice && !buyboxPrice.includes('€')) {
                    // Se non ha simbolo euro, prova a parsare
                    const parsed = parseItalianPrice(buyboxPrice);
                    if (parsed) price = parsed;
                } else {
                    price = parseItalianPrice(buyboxPrice);
                }
            }
            
            // Metodo 4: Prezzo Prime specifico
            if (!price) {
                const primePrice = $('#priceblock_ourprice, #priceblock_dealprice').first().text().trim();
                if (primePrice) {
                    price = parseItalianPrice(primePrice);
                }
            }
            
            // Metodo 5: Fallback - cerca il prezzo completo come stringa
            if (!price) {
                const allPrices = $('.a-price .a-offscreen, #priceblock_ourprice, #priceblock_dealprice, #buyBoxPrice');
                allPrices.each((i, elem) => {
                    const priceText = $(elem).text().trim();
                    if (priceText.includes('€') || priceText.includes(',')) {
                        const parsed = parseItalianPrice(priceText);
                        if (parsed && (!price || parsed > price)) {
                            price = parsed;
                        }
                    }
                });
            }
            
            // Estrae immagine principale con molteplici selettori
            let image = null;
            const imgTag = $('#landingImage, #imgBlkFront, #main-image, .imgTagWrapper img').first();
            if (imgTag.length > 0) {
                image = imgTag.attr('data-old-hires') || imgTag.attr('src') || imgTag.attr('data-src');
            }
            
            // Fallback per immagine
            if (!image) {
                const anyImage = $('img').first();
                if (anyImage.length > 0) {
                    image = anyImage.attr('src');
                }
            }
            
            return { price, image };
        } catch (error) {
            logger.error(`Errore estrazione dati per ${asin}: ${error.message}`);
            return { price: null, image: null };
        }
    });
}

// Estrae prodotti da un file HTML della nicchia
function extractProductsFromHTML(html, nichePath) {
    const $ = cheerio.load(html);
    const products = [];
    
    // Cerca prodotti con classe product-card o card con link Amazon
    $('.product-card, .card').each((index, element) => {
        const $card = $(element);
        const title = $card.find('.card-title').text().trim();
        const description = $card.find('.card-text').text().trim();
        const link = $card.find('a[href*="amazon"]').attr('href');
        const image = $card.find('.product-image').attr('src');
        
        if (link && title) {
            const asin = extractASIN(link);
            if (asin) {
                products.push({
                    asin,
                    title,
                    description,
                    link,
                    image,
                    niche: nichePath
                });
            }
        }
    });
    
    return products;
}

// Genera hashtag basati sulla nicchia
function getNicheHashtags(niche) {
    const hashtagMap = {
        'tech/smartphone-tech': '#smartwatch #smartwatchbluetooth #smartwatchAI #fitnesswatch #orologiointelligente #tech #smartphonetech',
        'sport/integratori-pre-workout': '#preworkout #integratori #fitness #bodybuilding #sport #palestra #energia',
        'casa/arredamento-casa': '#arredamento #casa #decorazione #design #home #interior',
        'default': '#offerte #amazon #shopping #sconti'
    };
    return hashtagMap[niche] || hashtagMap['default'];
}

// Genera hashtag basati sul prodotto
function getProductHashtags(title, description) {
    const text = `${title} ${description}`.toLowerCase();
    const keywords = [
        'chiamate', 'bluetooth', 'ai', 'assistente', 'vocale',
        'sport', 'fitness', 'corsa', 'gym', 'palestra',
        'impermeabile', 'waterproof', 'gps',
        'cardio', 'frequenza', 'cardiaca', 'sonno',
        'economico', 'prezzo', 'sconto', 'offerta'
    ];
    
    const foundHashtags = keywords.filter(keyword => text.includes(keyword));
    return foundHashtags.map(h => `#${h}`).join(' ');
}

// Invia messaggio a Telegram
async function sendToTelegram(product) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log('TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID non configurati');
        return false;
    }
    
    // Crea caption migliorato con prezzo se disponibile
    const priceText = product.price ? `💰 <b>Prezzo:</b> ${product.price.toFixed(2)}€\n\n` : '';
    
    // Genera hashtag pertinenti basati sulla nicchia e sul prodotto
    const nicheHashtags = getNicheHashtags(product.niche);
    const productHashtags = getProductHashtags(product.title, product.description);
    const hashtags = `\n\n${nicheHashtags} ${productHashtags}`;
    
    const caption = `🔥 <b>NUOVO PRODOTTO SCOPERTO!</b>\n\n` +
                    `📦 <b>${product.title}</b>\n\n` +
                    `${priceText}` +
                    `📝 ${product.description}\n\n` +
                    `✨ <b>Non perdere questa offerta!</b>${hashtags}`;
    
    try {
        // Genera parametri UTM per tracking GA4
        const utmSource = 'telegram';
        const utmMedium = 'bot';
        const utmCampaign = `smartwatch_${new Date().toISOString().split('T')[0]}`;
        const utmContent = product.title.replace(/\s+/g, '_').toLowerCase().substring(0, 50);
        
        const amazonLinkWithTracking = `${product.link}&utm_source=${utmSource}&utm_medium=${utmMedium}&utm_campaign=${utmCampaign}&utm_content=${utmContent}`;
        const instagramLinkWithTracking = `${INSTAGRAM_URL}?utm_source=${utmSource}&utm_medium=${utmMedium}&utm_campaign=${utmCampaign}&utm_content=instagram`;
        const pageLinkWithTracking = `${SITE_URL}/niches/${product.niche}/index.html?utm_source=${utmSource}&utm_medium=${utmMedium}&utm_campaign=${utmCampaign}&utm_content=page`;
        
        // Se c'è immagine, invia foto
        if (product.image) {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                chat_id: TELEGRAM_CHAT_ID,
                photo: product.image,
                caption: caption,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "🛒 Acquista su Amazon", url: amazonLinkWithTracking },
                            { text: "� Seguici su Instagram", url: instagramLinkWithTracking }
                        ],
                        [
                            { text: "🌐 Vedi tutti i prodotti", url: pageLinkWithTracking }
                        ]
                    ]
                }
            });
        } else {
            // Altrimenti invia solo testo
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID,
                text: caption,
                parse_mode: 'HTML',
                disable_web_page_preview: false,
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "🛒 Acquista su Amazon", url: amazonLinkWithTracking },
                            { text: "� Seguici su Instagram", url: instagramLinkWithTracking }
                        ],
                        [
                            { text: "🌐 Vedi tutti i prodotti", url: pageLinkWithTracking }
                        ]
                    ]
                }
            });
        }
        
        console.log('✅ Messaggio inviato con successo');
        return true;
    } catch (error) {
        console.error('❌ Errore invio Telegram:', error.response?.data || error.message);
        if (error.response?.data) {
            console.error('Dettagli errore:', JSON.stringify(error.response.data, null, 2));
        }
        return false;
    }
}

// Funzione principale
async function main() {
    console.log('Bot avviato -', new Date().toISOString());
    
    const sentData = loadSentProducts();
    const sentAsins = new Set(sentData.sent_asins);
    const priceRanges = loadPriceRanges();
    let newProductsCount = 0;
    
    for (const niche of NICCHIE_DA_CONTROLLARE) {
        const nichePath = path.join(PUBLIC_DIR, 'niches', niche, 'index.html');
        
        try {
            const html = fs.readFileSync(nichePath, 'utf8');
            const products = extractProductsFromHTML(html, niche);
            
            console.log(`Nicchia ${niche}: trovati ${products.length} prodotti`);
            
            // Ottieni fascia di prezzo per questa nicchia
            const priceRange = priceRanges[niche] || { min: 0, max: 50 };
            console.log(`  Fascia prezzo: ${priceRange.min}€ - ${priceRange.max}€`);
            
            for (const product of products) {
                if (!sentAsins.has(product.asin)) {
                    console.log(`Nuovo prodotto: ${product.title} (${product.asin})`);
                    
                    // Estrae prezzo e immagine da Amazon
                    console.log(`  → Estrazione dati da Amazon...`);
                    const productData = await extractProductData(product.asin);
                    
                    // Aggiunge dati al prodotto
                    product.price = productData.price;
                    product.image = productData.image;
                    
                    // Filtra prodotti in base alla fascia di prezzo della nicchia
                    if (product.price && (product.price < priceRange.min || product.price > priceRange.max)) {
                        console.log(`  ⏭️  Prezzo ${product.price.toFixed(2)}€ fuori range ${priceRange.min}-${priceRange.max}€, saltato`);
                        continue;
                    }
                    
                    if (product.price) {
                        console.log(`  💰 Prezzo: ${product.price.toFixed(2)}€`);
                    } else {
                        console.log(`  ⚠️  Prezzo non trovato, invio comunque`);
                    }
                    
                    const sent = await sendToTelegram(product);
                    if (sent) {
                        sentAsins.add(product.asin);
                        newProductsCount++;
                        
                        // Pausa tra invii per evitare rate limiting
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                }
            }
        } catch (error) {
            console.error(`Errore lettura nicchia ${niche}:`, error.message);
        }
    }
    
    // Salva il registro aggiornato
    if (newProductsCount > 0) {
        saveSentProducts({
            sent_asins: Array.from(sentAsins),
            last_updated: new Date().toISOString()
        });
        console.log(`✅ Inviati ${newProductsCount} nuovi prodotti`);
    } else {
        console.log('ℹ️ Nessun nuovo prodotto da inviare');
    }
}

// Export per Vercel
module.exports = async (req, res) => {
    try {
        await main();
        res.status(200).json({ success: true, message: 'Bot eseguito con successo' });
    } catch (error) {
        console.error('Errore bot:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Per esecuzione locale
if (require.main === module) {
    main();
}
