require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');

const ASINS = [
    'B0DR2VJ3V5', // #1COMFEE'
    'B0C4FY44VW', // MAKA
    'B0CK2QQSDB', // Russell Hobbs
    'B07PQMTTWS', // ARDES Penny
    'B01891LZBY', // Rowenta
    'B07BDKZZ51', // Innoliving
    'B0H33DW7GG', // TEK ONE
    'B0D1858HTY', // Beko
    'B084J4K4R5', // Ardes FLOOR 26
    'B0CRZ48HRZ', // DREO
    'B0H5C3MKTP', // Ventilatore Nero
    'B0CPSPS4RN', // Midea
    'B07F4CCL1T'  // Sunny
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
    console.log('🔍 Verifica 13 ventilatori a piantana...\n');
    
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
    fs.writeFileSync('/home/lollo/amazon/api/ventilators_check.json', JSON.stringify(results, null, 2));
    console.log('\n💾 Risultati salvati in ventilators_check.json');
}

main();
