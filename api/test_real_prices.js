require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');

const ASINS = [
    'B098B22J3W', // Amonax Ruota Addominali
    'B0FBG3CTKZ', // Attrezzo Interno Coscia
    'B0CCXT4S1N'  // HUAWEI WATCH FIT SE (probabile ASIN)
];

async function checkRealPrice(asin) {
    try {
        const url = `https://www.amazon.it/dp/${asin}`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept-Language': 'it-IT,it;q=0.9'
            }
        });
        
        const $ = cheerio.load(response.data);
        
        // Estrae titolo
        const title = $('#productTitle, #title').first().text().trim();
        
        // Estrae tutti i prezzi possibili
        const prices = [];
        
        // Metodo 1: Prezzo standard
        const priceWhole = $('#priceblock_ourprice_row .a-price-whole, #priceblock_dealprice_row .a-price-whole, #centerCol .a-price .a-price-whole').first().text().trim();
        const priceFraction = $('#priceblock_ourprice_row .a-price-fraction, #priceblock_dealprice_row .a-price-fraction, #centerCol .a-price .a-price-fraction').first().text().trim();
        if (priceWhole && priceFraction) {
            prices.push({ method: 'Standard', price: `${priceWhole},${priceFraction}` });
        }
        
        // Metodo 2: Prezzi offscreen
        $('.a-price .a-offscreen').each((i, elem) => {
            const priceText = $(elem).text().trim();
            if (priceText) {
                prices.push({ method: 'Offscreen', price: priceText });
            }
        });
        
        // Metodo 3: Buybox
        const buyboxPrice = $('#price_inside_buybox, #buyBoxPrice, #newBuyBoxPrice').first().text().trim();
        if (buyboxPrice) {
            prices.push({ method: 'Buybox', price: buyboxPrice });
        }
        
        // Metodo 4: Prime
        const primePrice = $('#priceblock_ourprice, #priceblock_dealprice').first().text().trim();
        if (primePrice) {
            prices.push({ method: 'Prime', price: primePrice });
        }
        
        console.log(`\n📦 ASIN: ${asin}`);
        console.log(`   Titolo: ${title.substring(0, 60)}...`);
        console.log(`   Prezzi trovati:`);
        prices.forEach(p => {
            console.log(`      [${p.method}] ${p.price}`);
        });
        
    } catch (error) {
        console.log(`\n❌ Errore per ${asin}: ${error.message}`);
    }
}

async function main() {
    console.log('🔍 Controllo prezzi reali su Amazon...\n');
    
    for (const asin of ASINS) {
        await checkRealPrice(asin);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Pausa per evitare rate limiting
    }
}

main();
