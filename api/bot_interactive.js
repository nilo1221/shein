const TelegramBot = require('node-telegram-bot-api');
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
const SITE_URL = process.env.SITE_URL;

// Nicchie disponibili
const NICCHIE = [
    { id: 'moda/abbigliamento-lavoro', name: '👷 Abbigliamento Lavoro' },
    { id: 'moda/abbigliamento-bambino', name: '👶 Abbigliamento Bambino' },
    { id: 'moda/abbigliamento-donna', name: '👚 Abbigliamento Donna' },
    { id: 'moda/abbigliamento-uomo', name: '👔 Abbigliamento Uomo' },
    { id: 'moda/serie-tv-cinema', name: '🎬 Serie TV & Cinema' },
    { id: 'moda/abbigliamento-serie-tv-cinema', name: '🎭 Merch Cinema' },
    { id: 'tech/smartphone-tech', name: '📱 Smartphone Tech' },
    { id: 'tech/elite-gaming-gear', name: '🎮 Elite Gaming Gear' },
    { id: 'casa/arredamento-casa', name: '🏠 Arredamento Casa' },
    { id: 'casa/cucina-elettrodomestici', name: '🍳 Cucina Elettrodomestici' },
    { id: 'casa/caffe-capsule', name: '☕ Caffè Capsule' },
    { id: 'casa/climatizzazione', name: '❄️ Climatizzazione' },
    { id: 'giochi-tavolo', name: '🎲 Giochi da Tavolo' },
    { id: 'manga-anime', name: '📚 Manga & Anime' },
    { id: 'outdoor-camping', name: '⛺ Outdoor Camping' },
    { id: 'sport/abbigliamento-sportivo', name: '🏃 Abbigliamento Sportivo' },
    { id: 'viaggi-vacanze', name: '✈️ Viaggi Vacanze' },
    { id: 'viaggi-vacanze/mare-spiaggia', name: '🏖️ Mare Spiaggia' }
];

// Fasce budget
const BUDGET_RANGES = [
    { min: 0, max: 20, name: '💰 0-20€' },
    { min: 0, max: 50, name: '💰 0-50€' },
    { min: 0, max: 100, name: '💰 0-100€' },
    { min: 0, max: 200, name: '💰 0-200€' },
    { min: 0, max: 500, name: '💰 0-500€' },
    { min: 0, max: 1000, name: '💰 0-1000€' }
];

// Percorsi dei file
const PUBLIC_DIR = path.join(__dirname, '../public');
const PRICE_RANGES_FILE = path.join(__dirname, '../data/price_ranges.json');

// Stato utenti (in memoria)
const userStates = {};

// Carica fasce di prezzo
function loadPriceRanges() {
    try {
        const data = fs.readFileSync(PRICE_RANGES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.warn('File price_ranges.json non trovato');
        return {};
    }
}

// Estrae ASIN da un link Amazon
function extractASIN(url) {
    const match = url.match(/\/dp\/([A-Z0-9]{10})/i);
    return match ? match[1] : null;
}

// Estrae prodotti da un file HTML della nicchia
function extractProductsFromHTML(html, nichePath) {
    const $ = cheerio.load(html);
    const products = [];
    
    $('.product-card').each((index, element) => {
        const $card = $(element);
        const title = $card.find('.card-title').text().trim();
        const description = $card.find('.card-text').text().trim();
        const link = $card.find('a[href*="amazon"]').attr('href');
        
        if (link && title) {
            const asin = extractASIN(link);
            if (asin) {
                products.push({
                    asin,
                    title,
                    description,
                    link,
                    niche: nichePath
                });
            }
        }
    });
    
    return products;
}

// Estrae prezzo e immagine dalla pagina Amazon
async function extractProductData(asin) {
    const url = `https://www.amazon.it/dp/${asin}`;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'it-IT,it;q=0.9'
    };
    
    try {
        const response = await axios.get(url, { headers, timeout: 10000 });
        const $ = cheerio.load(response.data);
        
        let price = null;
        
        // Metodo 1: Prezzo principale (priorità al prezzo scontato/attuale)
        const priceWhole = $('#priceblock_ourprice_row .a-price-whole, #priceblock_dealprice_row .a-price-whole, #centerCol .a-price .a-price-whole').first().text().trim();
        const priceFraction = $('#priceblock_ourprice_row .a-price-fraction, #priceblock_dealprice_row .a-price-fraction, #centerCol .a-price .a-price-fraction').first().text().trim();
        
        if (priceWhole && priceFraction) {
            // Rimuovi virgole extra da priceWhole prima di combinare
            const cleanWhole = priceWhole.replace(/,/g, '');
            const cleaned = `${cleanWhole},${priceFraction}`.replace(/[^\d.,]/g, '');
            const parts = cleaned.split(',');
            if (parts.length === 2) {
                const whole = parts[0].replace(/\./g, '');
                const decimal = parts[1];
                price = parseFloat(`${whole}.${decimal}`);
            }
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
                    const cleaned = priceText.replace(/[^\d.,]/g, '');
                    const parts = cleaned.split(',');
                    if (parts.length === 2) {
                        const whole = parts[0].replace(/\./g, '');
                        const decimal = parts[1];
                        const parsedPrice = parseFloat(`${whole}.${decimal}`);
                        if (parsedPrice && (!lowestPrice || parsedPrice > lowestPrice)) {
                            lowestPrice = parsedPrice;
                        }
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
            if (buyboxPrice) {
                const cleaned = buyboxPrice.replace(/[^\d.,]/g, '');
                const parts = cleaned.split(',');
                if (parts.length === 2) {
                    const whole = parts[0].replace(/\./g, '');
                    const decimal = parts[1];
                    price = parseFloat(`${whole}.${decimal}`);
                }
            }
        }
        
        // Metodo 4: Prezzo Prime specifico
        if (!price) {
            const primePrice = $('#priceblock_ourprice, #priceblock_dealprice').first().text().trim();
            if (primePrice) {
                const cleaned = primePrice.replace(/[^\d.,]/g, '');
                const parts = cleaned.split(',');
                if (parts.length === 2) {
                    const whole = parts[0].replace(/\./g, '');
                    const decimal = parts[1];
                    price = parseFloat(`${whole}.${decimal}`);
                }
            }
        }
        
        // Metodo 5: Fallback - cerca il prezzo completo come stringa
        if (!price) {
            const allPrices = $('.a-price .a-offscreen, #priceblock_ourprice, #priceblock_dealprice, #buyBoxPrice');
            allPrices.each((i, elem) => {
                const priceText = $(elem).text().trim();
                if (priceText.includes('€') || priceText.includes(',')) {
                    const cleaned = priceText.replace(/[^\d.,]/g, '');
                    const parts = cleaned.split(',');
                    if (parts.length === 2) {
                        const whole = parts[0].replace(/\./g, '');
                        const decimal = parts[1];
                        const parsed = parseFloat(`${whole}.${decimal}`);
                        if (parsed && (!price || parsed > price)) {
                            price = parsed;
                        }
                    }
                }
            });
        }
        
        let image = $('#landingImage').attr('src') || $('#imgBlkFront').attr('src');
        
        return { price, image };
    } catch (error) {
        logger.error(`Errore estrazione dati per ${asin}: ${error.message}`);
        return { price: null, image: null };
    }
}

// Filtra prodotti per categoria e budget
async function filterProducts(category, budgetMax) {
    const nichePath = category;
    const nicheFile = path.join(PUBLIC_DIR, 'niches', nichePath, 'index.html');
    
    if (!fs.existsSync(nicheFile)) {
        return [];
    }
    
    const html = fs.readFileSync(nicheFile, 'utf8');
    const products = extractProductsFromHTML(html, nichePath);
    
    const filteredProducts = [];
    for (const product of products) {
        const productData = await extractProductData(product.asin);
        product.price = productData.price;
        product.image = productData.image;
        
        if (!product.price || product.price <= budgetMax) {
            filteredProducts.push(product);
        }
    }
    
    return filteredProducts;
}

// Crea tastiera categorie
function createCategoryKeyboard() {
    const keyboard = [];
    for (let i = 0; i < NICCHIE.length; i += 2) {
        const row = [];
        row.push({ text: NICCHIE[i].name, callback_data: `cat_${NICCHIE[i].id}` });
        if (NICCHIE[i + 1]) {
            row.push({ text: NICCHIE[i + 1].name, callback_data: `cat_${NICCHIE[i + 1].id}` });
        }
        keyboard.push(row);
    }
    return keyboard;
}

// Crea tastiera budget
function createBudgetKeyboard() {
    const keyboard = [];
    for (let i = 0; i < BUDGET_RANGES.length; i += 2) {
        const row = [];
        row.push({ text: BUDGET_RANGES[i].name, callback_data: `budget_${BUDGET_RANGES[i].max}` });
        if (BUDGET_RANGES[i + 1]) {
            row.push({ text: BUDGET_RANGES[i + 1].name, callback_data: `budget_${BUDGET_RANGES[i + 1].max}` });
        }
        keyboard.push(row);
    }
    return keyboard;
}

// Inizializza bot
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// Comando /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    userStates[chatId] = { step: 'category' };
    
    bot.sendMessage(chatId, '👋 Benvenuto! Seleziona una categoria di prodotti:', {
        reply_markup: {
            inline_keyboard: createCategoryKeyboard()
        }
    });
});

// Callback query handler
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    
    if (data.startsWith('cat_')) {
        const category = data.replace('cat_', '');
        userStates[chatId] = { step: 'budget', category };
        
        const categoryName = NICCHIE.find(n => n.id === category)?.name || category;
        
        await bot.answerCallbackQuery(query.id);
        await bot.editMessageText(chatId, query.message.message_id, `📁 Categoria: ${categoryName}\n\n💰 Seleziona il tuo budget massimo:`, {
            reply_markup: {
                inline_keyboard: createBudgetKeyboard()
            }
        });
    } else if (data.startsWith('budget_')) {
        const budgetMax = parseInt(data.replace('budget_', ''));
        const state = userStates[chatId];
        
        if (state && state.category) {
            await bot.answerCallbackQuery(query.id);
            await bot.editMessageText(chatId, query.message.message_id, '⏳ Ricerca prodotti in corso...');
            
            const products = await filterProducts(state.category, budgetMax);
            
            if (products.length === 0) {
                await bot.editMessageText(chatId, query.message.message_id, '😔 Nessun prodotto trovato con questi criteri.\n\nProva con un budget più alto o un\'altra categoria.', {
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔄 Nuova ricerca', callback_data: 'restart' }]]
                    }
                });
            } else {
                await bot.editMessageText(chatId, query.message.message_id, `✅ Trovati ${products.length} prodotti! Ecco i primi 5:`);
                
                for (let i = 0; i < Math.min(5, products.length); i++) {
                    const product = products[i];
                    const priceText = product.price ? `💰 Prezzo: ${product.price.toFixed(2)}€\n\n` : '';
                    const caption = `🔥 <b>${product.title}</b>\n\n${priceText}${product.description}\n\n📦 <b>Acquista ora su Amazon</b>`;
                    
                    if (product.image) {
                        await bot.sendPhoto(chatId, product.image, {
                            caption: caption,
                            parse_mode: 'HTML',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: "🛒 Acquista su Amazon", url: product.link }],
                                    [{ text: "🌐 Vedi tutti i prodotti", url: `${SITE_URL}/niches/${product.niche}/index.html` }]
                                ]
                            }
                        });
                    } else {
                        await bot.sendMessage(chatId, caption, {
                            parse_mode: 'HTML',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: "🛒 Acquista su Amazon", url: product.link }],
                                    [{ text: "🌐 Vedi tutti i prodotti", url: `${SITE_URL}/niches/${product.niche}/index.html` }]
                                ]
                            }
                        });
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                await bot.sendMessage(chatId, '🔄 Vuoi fare un\'altra ricerca?', {
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔄 Nuova ricerca', callback_data: 'restart' }]]
                    }
                });
            }
        }
    } else if (data === 'restart') {
        await bot.answerCallbackQuery(query.id);
        userStates[chatId] = { step: 'category' };
        
        await bot.editMessageText(chatId, query.message.message_id, '👋 Seleziona una categoria di prodotti:', {
            reply_markup: {
                inline_keyboard: createCategoryKeyboard()
            }
        });
    }
});

// Messaggio di avvio
logger.info('Bot Telegram interattivo avviato');
