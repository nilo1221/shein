#!/usr/bin/env python3
"""
Script per estrarre prodotti direttamente dal sito SHEIN (web scraping)
"""
import requests
from bs4 import BeautifulSoup
import json
import os
import time
import random
from urllib.parse import urljoin, urlparse

# Configurazione
SHEIN_BASE_URL = "https://www.shein.com"
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15'
]

# Codice affiliato (da configurare)
AFFILIATE_CODE = ""  # Inserisci qui il tuo codice affiliato

def get_random_headers():
    """Genera headers random per evitare blocchi"""
    return {
        'User-Agent': random.choice(USER_AGENTS),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    }

def add_affiliate_code(url):
    """Aggiunge il codice affiliato all'URL"""
    if not AFFILIATE_CODE:
        return url
    
    parsed = urlparse(url)
    query_params = parsed.query.split('&') if parsed.query else []
    query_params.append(f"ref={AFFILIATE_CODE}")
    
    new_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}?{'&'.join(query_params)}"
    return new_url

def extract_products_from_category(category_url, category_name):
    """Estrae prodotti da una categoria SHEIN"""
    try:
        print(f"🔍 Estrazione categoria: {category_name}")
        
        headers = get_random_headers()
        response = requests.get(category_url, headers=headers, timeout=15)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        products = []
        
        # Cerca elementi prodotto (selettori comuni per e-commerce)
        product_selectors = [
            'div.product-item',
            'div.product-card',
            'div[class*="product"]',
            'article.product',
            'div[class*="item"]'
        ]
        
        product_elements = []
        for selector in product_selectors:
            elements = soup.select(selector)
            if elements:
                product_elements = elements
                print(f"  Trovati {len(elements)} prodotti con selettore: {selector}")
                break
        
        if not product_elements:
            print(f"  ⚠️ Nessun prodotto trovato in {category_name}")
            return products
        
        for i, element in enumerate(product_elements[:20]):  # Limita a 20 prodotti per test
            try:
                # Estrazione titolo
                title_selectors = ['h3', 'h4', '.product-title', '.title', '[class*="title"]']
                title = ""
                for selector in title_selectors:
                    title_elem = element.select_one(selector)
                    if title_elem:
                        title = title_elem.get_text(strip=True)
                        break
                
                # Estrazione prezzo
                price_selectors = ['.price', '[class*="price"]', '.amount', '[class*="amount"]']
                price = ""
                for selector in price_selectors:
                    price_elem = element.select_one(selector)
                    if price_elem:
                        price = price_elem.get_text(strip=True)
                        break
                
                # Estrazione immagine
                img_selectors = ['img', '[class*="image"]', '.product-img']
                image = ""
                for selector in img_selectors:
                    img_elem = element.select_one(selector)
                    if img_elem:
                        image = img_elem.get('src') or img_elem.get('data-src')
                        if image:
                            if not image.startswith('http'):
                                image = urljoin(SHEIN_BASE_URL, image)
                            break
                
                # Estrazione link
                link_selectors = ['a', '[href]']
                link = ""
                for selector in link_selectors:
                    link_elem = element.select_one(selector)
                    if link_elem and link_elem.get('href'):
                        link = link_elem.get('href')
                        if not link.startswith('http'):
                            link = urljoin(SHEIN_BASE_URL, link)
                        break
                
                if title and link:
                    # Aggiungi codice affiliato
                    link_with_affiliate = add_affiliate_code(link)
                    
                    product = {
                        'title': title,
                        'description': f"Prodotto SHEIN {category_name}",
                        'price': price or "Prezzo non disponibile",
                        'image': image,
                        'link': link_with_affiliate,
                        'category': category_name
                    }
                    products.append(product)
                    print(f"  ✅ Prodotto {i+1}: {title[:30]}...")
                
                # Pausa per evitare rate limiting
                time.sleep(random.uniform(1, 2))
                
            except Exception as e:
                print(f"  ❌ Errore prodotto {i+1}: {e}")
                continue
        
        print(f"✅ Estratti {len(products)} prodotti da {category_name}")
        return products
        
    except Exception as e:
        print(f"❌ Errore nell'estrazione di {category_name}: {e}")
        return []

# Configurazione categorie (facilmente estendibile per nuove categorie)
CATEGORIES_CONFIG = [
    {
        'url': f"{SHEIN_BASE_URL}/women-clothing",
        'name': 'donna',
        'description': 'Abbigliamento donna'
    },
    {
        'url': f"{SHEIN_BASE_URL}/men-clothing', 
        'name': 'uomo',
        'description': 'Abbigliamento uomo'
    },
    {
        'url': f"{SHEIN_BASE_URL}/women-sportswear",
        'name': 'sportivo-donna',
        'description': 'Abbigliamento sportivo donna'
    },
    {
        'url': f"{SHEIN_BASE_URL}/men-sportswear', 
        'name': 'sportivo-uomo',
        'description': 'Abbigliamento sportivo uomo'
    },
    {
        'url': f"{SHEIN_BASE_URL}/gym-accessories",
        'name': 'accessori-palestra',
        'description': 'Accessori palestra'
    }
    # Aggiungi qui nuove categorie quando necessario
    # Esempio:
    # {
    #     'url': f"{SHEIN_BASE_URL}/ventilatori",
    #     'name': 'ventilatori',
    #     'description': 'Ventilatori'
    # }
]

def main():
    """Funzione principale"""
    print("🚀 Inizio estrazione prodotti SHEIN...")
    print(f"📂 Categorie configurate: {len(CATEGORIES_CONFIG)}")
    
    for config in CATEGORIES_CONFIG:
        print(f"  - {config['description']}: {config['name']}")
    
    all_products = []
    
    for category in CATEGORIES_CONFIG:
        products = extract_products_from_category(category['url'], category['name'])
        all_products.extend(products)
        
        # Pausa tra categorie
        time.sleep(random.uniform(3, 5))
    
    # Carica prodotti esistenti
    products_file = os.path.join(os.path.dirname(__file__), 'products.json')
    existing_products = []
    if os.path.exists(products_file):
        with open(products_file, 'r', encoding='utf-8') as f:
            existing_products = json.load(f)
    
    # Unisci prodotti
    all_products = existing_products + all_products
    
    # Rimuovi duplicati basati sul link
    seen_links = set()
    unique_products = []
    for product in all_products:
        if product['link'] not in seen_links:
            seen_links.add(product['link'])
            unique_products.append(product)
    
    # Salva in JSON
    with open(products_file, 'w', encoding='utf-8') as f:
        json.dump(unique_products, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ Estrazione completata!")
    print(f"📦 Nuovi prodotti estratti: {len(all_products) - len(existing_products)}")
    print(f"📦 Prodotti totali: {len(unique_products)}")
    print(f"💾 Salvati in {products_file}")

if __name__ == '__main__':
    main()
