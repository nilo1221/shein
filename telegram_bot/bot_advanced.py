#!/usr/bin/env python3
"""
Bot SHEIN Avanzato - Posting automatico con funzionalità complete
Ispirato al bot Amazon con tracking UTM, registro prodotti, retry mechanism
"""
import json
import os
import asyncio
import logging
import time
import random
from datetime import datetime
from typing import Dict, Set, List
from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.error import TelegramError
from config import BOT_TOKEN, CHANNEL_ID, CHANNEL_INVITE_LINK

# Configurazione logging avanzato
os.makedirs('logs', exist_ok=True)

error_handler = logging.FileHandler('logs/error.log')
error_handler.setLevel(logging.ERROR)

combined_handler = logging.FileHandler('logs/combined.log')
console_handler = logging.StreamHandler()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[error_handler, combined_handler, console_handler]
)
logger = logging.getLogger(__name__)

# Configurazione
SITE_URL = "https://shein-lilac.vercel.app/"
INSTAGRAM_URL = "https://www.instagram.com/smartchoiceguide1/"

# Categorie da controllare
CATEGORIES_DA_CONTROLLARE = ['donna', 'uomo']

# File paths
SENT_PRODUCTS_FILE = os.path.join(os.path.dirname(__file__), 'sent_products.json')
PRICE_RANGES_FILE = os.path.join(os.path.dirname(__file__), 'price_ranges.json')
PRODUCTS_FILE = os.path.join(os.path.dirname(__file__), 'products.json')
CAMPAIGNS_FILE = os.path.join(os.path.dirname(__file__), 'campagne.json')

# User-Agent rotation
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
]

def get_random_user_agent():
    """Restituisce un User-Agent casuale"""
    return random.choice(USER_AGENTS)

# Retry mechanism con exponential backoff
async def retry_with_backoff(func, max_retries=3, base_delay=1.0):
    """Esegue una funzione con retry e exponential backoff"""
    for attempt in range(max_retries):
        try:
            return await func()
        except Exception as error:
            if attempt == max_retries - 1:
                raise error
            
            delay = base_delay * (2 ** attempt)
            logger.warning(f"Retry {attempt + 1}/{max_retries} after {delay}s...")
            await asyncio.sleep(delay)

# Carica il registro dei prodotti già inviati
def load_sent_products() -> Dict:
    """Carica il registro dei prodotti inviati"""
    try:
        with open(SENT_PRODUCTS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        logger.warning('File sent_products.json non trovato, creazione nuovo registro')
        return {'sent_links': [], 'last_updated': None}
    except json.JSONDecodeError:
        logger.error('Errore nel parsing del file sent_products.json')
        return {'sent_links': [], 'last_updated': None}

# Salva il registro dei prodotti inviati
def save_sent_products(data: Dict):
    """Salva il registro dei prodotti inviati"""
    data['last_updated'] = datetime.now().isoformat()
    with open(SENT_PRODUCTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info('Registro prodotti salvato')

# Carica le fasce di prezzo per categoria
def load_price_ranges() -> Dict:
    """Carica le fasce di prezzo per categoria"""
    try:
        with open(PRICE_RANGES_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        logger.warning('File price_ranges.json non trovato, uso default 0-100€')
        return {'donna': {'min': 0, 'max': 100}, 'uomo': {'min': 0, 'max': 100}}

# Carica i prodotti dal file JSON
def load_products() -> List[Dict]:
    """Carica i prodotti dal file JSON"""
    try:
        with open(PRODUCTS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        logger.error('File products.json non trovato')
        return []

# Carica le campagne dal file JSON
def load_campaigns() -> List[Dict]:
    """Carica le campagne dal file JSON"""
    try:
        with open(CAMPAIGNS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        logger.error('File campagne.json non trovato')
        return []

# Genera hashtag basati sulla categoria
def get_category_hashtags(category: str) -> str:
    """Genera hashtag basati sulla categoria"""
    hashtag_map = {
        'donna': '#modadonna #abbigliamentodonna #fashion #style #shein #offerte #shopping',
        'uomo': '#modauomo #abbigliamentouomo #fashion #style #shein #offerte #shopping',
        'default': '#shein #offerte #shopping #sconti #moda'
    }
    return hashtag_map.get(category, hashtag_map['default'])

# Genera hashtag basati sul prodotto
def get_product_hashtags(title: str, description: str) -> str:
    """Genera hashtag basati sul contenuto del prodotto"""
    text = f"{title} {description}".lower()
    keywords = [
        'sconto', 'offerta', 'economico', 'prezzo',
        'elegante', 'casual', 'sportivo', 'estate', 'inverno',
        'nuovo', 'tendenza', 'fashion', 'style'
    ]
    
    found_hashtags = [f"#{kw}" for kw in keywords if kw in text]
    return ' '.join(found_hashtags)

# Genera parametri UTM per tracking
def generate_utm_params(product: Dict, utm_content: str = None) -> Dict:
    """Genera parametri UTM per tracking GA4"""
    utm_source = 'tg'
    utm_medium = 'bot'
    utm_campaign = 'shein'
    utm_content = utm_content or product['title'].replace(' ', '_').lower()[:30]
    
    return {
        'utm_source': utm_source,
        'utm_medium': utm_medium,
        'utm_campaign': utm_campaign,
        'utm_content': utm_content
    }

# Invia messaggio a Telegram con retry
async def send_to_telegram(bot: Bot, product: Dict, utm_params: Dict) -> bool:
    """Invia un prodotto a Telegram con retry mechanism"""
    
    # Genera link con tracking UTM
    link_with_tracking = f"{product['link']}?utm_source={utm_params['utm_source']}&utm_medium={utm_params['utm_medium']}&utm_campaign={utm_params['utm_campaign']}&utm_content={utm_params['utm_content']}"
    instagram_link_with_tracking = f"{INSTAGRAM_URL}?utm_source={utm_params['utm_source']}&utm_medium={utm_params['utm_medium']}&utm_campaign={utm_params['utm_campaign']}&utm_content=instagram"
    page_link_with_tracking = f"{SITE_URL}?utm_source={utm_params['utm_source']}&utm_medium={utm_params['utm_medium']}&utm_campaign={utm_params['utm_campaign']}&utm_content=page"
    
    # Genera hashtag
    category_hashtags = get_category_hashtags(product['category'])
    product_hashtags = get_product_hashtags(product['title'], product['description'])
    hashtags = f"\n\n{category_hashtags} {product_hashtags}"
    
    # Crea caption
    category_emoji = "👗" if product['category'] == 'donna' else "👔"
    caption = (
        f"🔥 <b>NUOVO PRODOTTO SCOPERTO!</b>\n\n"
        f"{category_emoji} <b>{product['title']}</b>\n\n"
        f"📝 {product['description']}\n\n"
        f"✨ <b>Non perdere questa offerta!</b>\n\n"
        f"📢 <b>Unisciti al canale per altri prodotti:</b>\n"
        f"👉 {CHANNEL_INVITE_LINK}{hashtags}"
    )
    
    async def send_message():
        """Funzione interna per l'invio con retry"""
        try:
            # Se c'è immagine, invia foto
            if product.get('image'):
                await bot.send_photo(
                    chat_id=CHANNEL_ID,
                    photo=product['image'],
                    caption=caption,
                    parse_mode='HTML',
                    reply_markup=InlineKeyboardMarkup([
                        [
                            InlineKeyboardButton("🛒 Acquista su SHEIN", url=link_with_tracking),
                            InlineKeyboardButton("📸 Seguici su Instagram", url=instagram_link_with_tracking)
                        ],
                        [
                            InlineKeyboardButton("🌐 Vedi tutti i prodotti", url=page_link_with_tracking),
                            InlineKeyboardButton("📢 Condividi Canale", url=CHANNEL_INVITE_LINK)
                        ]
                    ])
                )
            else:
                # Altrimenti invia solo testo
                await bot.send_message(
                    chat_id=CHANNEL_ID,
                    text=caption,
                    parse_mode='HTML',
                    disable_web_page_preview=False,
                    reply_markup=InlineKeyboardMarkup([
                        [
                            InlineKeyboardButton("🛒 Acquista su SHEIN", url=link_with_tracking),
                            InlineKeyboardButton("📸 Seguici su Instagram", url=instagram_link_with_tracking)
                        ],
                        [
                            InlineKeyboardButton("🌐 Vedi tutti i prodotti", url=page_link_with_tracking),
                            InlineKeyboardButton("📢 Condividi Canale", url=CHANNEL_INVITE_LINK)
                        ]
                    ])
                )
            logger.info(f'Messaggio inviato con successo: {product["title"][:30]}...')
            return True
        except TelegramError as e:
            logger.error(f'Errore Telegram: {e}')
            raise
    
    try:
        return await retry_with_backoff(send_message, max_retries=3, base_delay=2.0)
    except Exception as e:
        logger.error(f'Errore finale invio Telegram: {e}')
        return False

# Invia campagne promozionali
async def send_campaigns(bot: Bot) -> int:
    """Invia le campagne promozionali su Telegram"""
    campaigns = load_campaigns()
    sent_count = 0
    
    for campaign in campaigns:
        try:
            message = (
                f"{campaign['emoji']} <b>{campaign['title']}</b>\n\n"
                f"📝 {campaign['description']}\n\n"
                f"📅 Valido fino al: {campaign['valid_until']}"
            )
            
            await bot.send_message(
                chat_id=CHANNEL_ID,
                text=message,
                parse_mode='HTML'
            )
            logger.info(f'Campagna inviata: {campaign["title"]}')
            sent_count += 1
            await asyncio.sleep(2)  # Pausa tra campagne
        except Exception as e:
            logger.error(f'Errore invio campagna {campaign["title"]}: {e}')
    
    return sent_count

# Funzione principale
async def main():
    """Funzione principale del bot"""
    logger.info('Bot SHEIN Avanzato avviato')
    
    # Crea directory logs se non esiste
    os.makedirs('logs', exist_ok=True)
    
    # Carica dati
    sent_data = load_sent_products()
    sent_links = set(sent_data.get('sent_links', []))
    price_ranges = load_price_ranges()
    products = load_products()
    
    new_products_count = 0
    
    logger.info(f'Prodotti caricati: {len(products)}')
    logger.info(f'Link già inviati: {len(sent_links)}')
    
    # Invia campagne promozionali (disabilitato finché non ci sono immagini)
    # logger.info('Invio campagne promozionali...')
    # campaigns_sent = await send_campaigns(bot)
    # logger.info(f'Campagne inviate: {campaigns_sent}')
    campaigns_sent = 0
    
    # Processa prodotti
    for product in products:
        product_link = product.get('link', '')
        
        if product_link and product_link not in sent_links:
            logger.info(f'Nuovo prodotto: {product["title"][:30]}... ({product["category"]})')
            
            # Ottieni fascia di prezzo per questa categoria
            price_range = price_ranges.get(product['category'], {'min': 0, 'max': 100})
            logger.info(f'  Fascia prezzo: {price_range["min"]}€ - {price_range["max"]}€')
            
            # Genera parametri UTM
            utm_params = generate_utm_params(product)
            
            # Invia a Telegram
            sent = await send_to_telegram(bot, product, utm_params)
            
            if sent:
                sent_links.add(product_link)
                new_products_count += 1
                
                # Pausa tra invii per evitare rate limiting
                await asyncio.sleep(3)
            else:
                logger.warning(f'Fallito invio prodotto: {product["title"][:30]}...')
    
    # Salva il registro aggiornato
    if new_products_count > 0:
        save_sent_products({
            'sent_links': list(sent_links),
            'last_updated': datetime.now().isoformat()
        })
        logger.info(f'✅ Inviati {new_products_count} nuovi prodotti')
    else:
        logger.info('ℹ️ Nessun nuovo prodotto da inviare')
    
    logger.info('Bot SHEIN Avanzato completato')

if __name__ == '__main__':
    bot = Bot(token=BOT_TOKEN)
    asyncio.run(main())
