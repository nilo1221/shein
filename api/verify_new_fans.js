require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');

// Prodotti da verificare (ventilatori portatili, da soffitto, trend TikTok)
const ASINS = [
    // Ventilatori portatili/mini
    'B0GM737ZT5', // KARFUN Ventilatore Portatile
    'B0GVDZ78WS', // Senhome Ventilatore Portatile
    'B0GZTLNDZD', // Morelax Mini ventilatore portatile
    'B0GFWTJH3M', // anysun Ventilatore da Collo
    'B0H6J7WC2B', // LA CASA DE LAS CARCASAS Ventilatore collo
    'B0FG352R6J', // JATEKA Mini Ventilatore Portatile
    'B096VSWHC4', // JISULIFE Portatile 3 in 1
    'B0BV2Z8RM2', // TECKNET Ventilatore Portatile
    'B09YGLCSG2', // Rafada Ventilatore a mano
    'B07TMVHRFT', // Simpeak Ventilatore USB
    
    // Ventilatori da soffitto
    'B0GTM8NC8M', // OSRAM Ventilatore da soffitto LED
    'B084PCTT83', // Bestlivings Ventilatore da soffitto portatile
    'B00YGXQDNA', // Ventilatore per la casa lampada soffitto
    'B0977N3NKW', // Rowenta Ventilatore con elica (da soffitto/portatile)
];

async function checkProduct(asin) {
    try {
        const url = `https://www.amazon.it/dp/${asin}`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept-Language': 'it-IT,it;q=0.9'
            },
            timeout: 10000
        });
        
        if (response.status !== 200) {
            return { asin, status: 'ERROR', message: `HTTP ${response.status}` };
        }
        
        const $ = cheerio.load(response.data);
        
        // Verifica disponibilità
        const availability = $('#availability, #availability span, #centerCol .a-color-state').first().text().trim().toLowerCase();
        const isUnavailable = availability.includes('non disponibile') || 
                             availability.includes('currently unavailable') ||
                             availability.includes('non al momento');
        
        // Verifica prezzo
        const priceWhole = $('#priceblock_ourprice_row .a-price-whole, #priceblock_dealprice_row .a-price-whole, #centerCol .a-price .a-price-whole').first().text().trim();
        const priceFraction = $('#priceblock_ourprice_row .a-price-fraction, #priceblock_dealprice_row .a-price-fraction, #centerCol .a-price .a-price-fraction').first().text().trim();
        const hasPrice = priceWhole && priceFraction;
        
        // Estrai titolo
        const title = $('#productTitle, #title').first().text().trim();
        
        if (isUnavailable) {
            return { asin, status: 'UNAVAILABLE', message: availability, title };
        }
        
        if (!hasPrice) {
            return { asin, status: 'NO_PRICE', message: 'Prezzo non trovato', title };
        }
        
        return { 
            asin, 
            status: 'OK', 
            message: 'Disponibile con prezzo',
            title: title.substring(0, 60),
            price: `${priceWhole},${priceFraction}€`
        };
        
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return { asin, status: '404', message: 'Prodotto non trovato' };
        }
        return { asin, status: 'ERROR', message: error.message };
    }
}

async function main() {
    console.log('🔍 Verifica ventilatori portatili, da soffitto e trend TikTok...\n');
    
    const results = [];
    
    for (const asin of ASINS) {
        const result = await checkProduct(asin);
        results.push(result);
        
        const icon = result.status === 'OK' ? '✅' : '❌';
        console.log(`${icon} ${asin} - ${result.status}: ${result.message}`);
        if (result.title) console.log(`   Titolo: ${result.title}`);
        if (result.price) console.log(`   Prezzo: ${result.price}`);
        console.log('');
        
        // Pausa per evitare rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n📊 Riepilogo:');
    const ok = results.filter(r => r.status === 'OK').length;
    const total = results.length;
    console.log(`✅ OK: ${ok}/${total}`);
    console.log(`❌ Problemi: ${total - ok}/${total}`);
    
    // Salva risultati in file
    const fs = require('fs');
    fs.writeFileSync('/home/lollo/amazon/api/new_fans_check.json', JSON.stringify(results, null, 2));
    console.log('\n💾 Risultati salvati in new_fans_check.json');
}

main();
