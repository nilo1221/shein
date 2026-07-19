#!/usr/bin/env python3
"""
Script universale per estrarre prodotti dai link SHEIN
"""
import requests
from bs4 import BeautifulSoup
import json
import os
import time
from urllib.parse import urlparse

def extract_product_from_url(url):
    """Estrae informazioni prodotto da un link SHEIN"""
    try:
        # Headers per simulare un browser
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        # Segui redirect per ottenere il link diretto del prodotto
        session = requests.Session()
        response = session.get(url, headers=headers, timeout=10, allow_redirects=True)
        final_url = response.url
        
        print(f"  Redirect: {url} -> {final_url}")
        
        # Parsing HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Estrazione titolo
        title = ""
        title_selectors = [
            'h1.product-intro__head-name',
            'h1[class*="product-title"]',
            'h1[class*="product-name"]',
            '.product-title',
            'h1'
        ]
        for selector in title_selectors:
            element = soup.select_one(selector)
            if element:
                title = element.get_text(strip=True)
                break
        
        # Estrazione prezzo
        price = ""
        price_selectors = [
            '.product-intro__head-price',
            '[class*="price"]',
            '.price',
            '[class*="product-price"]'
        ]
        for selector in price_selectors:
            element = soup.select_one(selector)
            if element:
                price = element.get_text(strip=True)
                break
        
        # Estrazione descrizione
        description = ""
        desc_selectors = [
            '.product-intro__head-des',
            '[class*="description"]',
            '.description',
            '.product-description'
        ]
        for selector in desc_selectors:
            element = soup.select_one(selector)
            if element:
                description = element.get_text(strip=True)
                break
        
        # Estrazione immagine
        image = ""
        img_selectors = [
            'img[class*="product-image"]',
            'img[class*="main-image"]',
            '.product-image img',
            'img[alt*="product"]'
        ]
        for selector in img_selectors:
            element = soup.select_one(selector)
            if element:
                image = element.get('src', '') or element.get('data-src', '')
                if image and not image.startswith('http'):
                    image = 'https:' + image if image.startswith('//') else image
                break
        
        # Se non trovo immagine, cerco meta tag
        if not image:
            meta_img = soup.find('meta', property='og:image')
            if meta_img:
                image = meta_img.get('content', '')
        
        # Determina categoria (basata sul titolo o URL)
        category = "generale"
        if "donna" in title.lower() or "woman" in title.lower() or "women" in title.lower():
            category = "donna"
        elif "uomo" in title.lower() or "man" in title.lower() or "men" in title.lower():
            category = "uomo"
        
        product = {
            'title': title or "Prodotto SHEIN",
            'description': description or "Prodotto di qualità da SHEIN",
            'price': price or "Prezzo non disponibile",
            'image': image,
            'link': url,
            'category': category
        }
        
        return product
        
    except Exception as e:
        print(f"Errore nell'estrazione da {url}: {e}")
        return None

def main():
    """Funzione principale"""
    # Link SHEIN forniti dall'utente
    shein_links = [
        "https://onelink.shein.com/43/5vw9f9356hoj",
        "https://onelink.shein.com/43/5vw9fyqj1fm2",
        "https://onelink.shein.com/43/5vw9gsc09x6m",
        "https://onelink.shein.com/43/5vw9hjyfuosi",
        "https://onelink.shein.com/43/5vwagumbud0w",
        "https://onelink.shein.com/43/5vwahy2yi7f7",
        "https://onelink.shein.com/43/5vwcbvp4lgve",
        "https://onelink.shein.com/43/5vwcclcjny9a",
        "https://onelink.shein.com/43/5vwcdiw1z408",
        "https://onelink.shein.com/43/5vwceiem03ku",
        "https://onelink.shein.com/43/5vwchmvdf874",
        "https://onelink.shein.com/43/5vwcj839otgt",
        "https://onelink.shein.com/43/5vwckne2m8v4",
        "https://onelink.shein.com/43/5vwclkxlj6hz",
        "https://onelink.shein.com/43/5vwcmmf72yx0",
        "https://onelink.shein.com/43/5vwco3p0ppa8",
        "https://onelink.shein.com/43/5vwcpizu8wie",
        "https://onelink.shein.com/43/5vwcr66rfiwh",
        "https://onelink.shein.com/43/5vwcs5pbgidx",
        "https://onelink.shein.com/43/5vwct57vmf0a",
        "https://onelink.shein.com/43/5vwcza7bow7o",
        "https://onelink.shein.com/43/5vwd198g5mb9",
        "https://onelink.shein.com/43/5vwv112pzdmf"
    ]
    
    print(f"🔍 Inizio estrazione da {len(shein_links)} link SHEIN...")
    
    products = []
    for i, link in enumerate(shein_links, 1):
        print(f"[{i}/{len(shein_links)}] Elaborazione: {link}")
        product = extract_product_from_url(link)
        if product:
            products.append(product)
            print(f"✅ Prodotto estratto: {product['title'][:50]}...")
        else:
            print(f"❌ Errore nell'estrazione")
        
        # Pausa per evitare rate limiting
        time.sleep(2)
    
    # Carica prodotti esistenti
    products_file = os.path.join(os.path.dirname(__file__), 'products.json')
    existing_products = []
    if os.path.exists(products_file):
        with open(products_file, 'r', encoding='utf-8') as f:
            existing_products = json.load(f)
    
    # Unisci prodotti
    all_products = existing_products + products
    
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
    print(f"📦 Prodotti estratti: {len(products)}")
    print(f"📦 Prodotti totali: {len(unique_products)}")
    print(f"💾 Salvati in {products_file}")

if __name__ == '__main__':
    main()
