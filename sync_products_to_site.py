#!/usr/bin/env python3
"""
Script per sincronizzare i prodotti dal file products.json ai file HTML del sito
"""
import json
from bs4 import BeautifulSoup
import os

def generate_product_card(product):
    """Genera il codice HTML per una card prodotto"""
    if not product.get('image'):
        return None
    
    title = product.get('title', 'Prodotto SHEIN')
    description = product.get('description', 'Prodotto di qualità da SHEIN')
    link = product.get('link', '#')
    image = product.get('image', '')
    
    html = f'''            <div class="product-card">
                <img src="{image}" alt="{title}" class="product-image">
                <div class="product-info">
                    <h3 class="product-title">{title}</h3>
                    <p class="product-description">{description}</p>
                    <a href="{link}" class="affiliate-btn" target="_blank" rel="noopener">Acquista su SHEIN</a>
                </div>
            </div>
'''
    return html

def assign_category_to_general(product):
    """Assegna automaticamente una categoria ai prodotti generali basandosi sul nome"""
    title = product.get('title', '').lower()
    description = product.get('description', '').lower()
    text = title + ' ' + description
    
    # Parole chiave per donna
    donna_keywords = ['donna', 'woman', 'women', 'borsa', 'cuffie', 'borse', 'gioielli', 'scarpe', 'vestito', 'top', 'maglietta', 'gonna', 'camicia', 'intimo', 'costume', 'bikini']
    
    # Parole chiave per uomo
    uomo_keywords = ['uomo', 'man', 'men', 'pantaloni', 't-shirt', 'maglietta', 'camicia', 'scarpe', 'sport', 'fitness', 'palestra']
    
    # Conta occorrenze
    donna_count = sum(1 for keyword in donna_keywords if keyword in text)
    uomo_count = sum(1 for keyword in uomo_keywords if keyword in text)
    
    # Assegna categoria
    if donna_count > uomo_count:
        return 'donna'
    elif uomo_count > donna_count:
        return 'uomo'
    elif donna_count == 0 and uomo_count == 0:
        # Se non ci sono parole chiave, assegna casualmente
        return 'donna' if hash(text) % 2 == 0 else 'uomo'
    else:
        # Se pareggio, assegna casualmente
        return 'donna' if hash(text) % 2 == 0 else 'uomo'

def update_html_file(html_file, products, category):
    """Aggiorna il file HTML con i prodotti della categoria specificata"""
    with open(html_file, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
    
    # Trova il contenitore products-grid
    products_grid = soup.find('div', class_='products-grid')
    if not products_grid:
        print(f"❌ Contenitore products-grid non trovato in {html_file}")
        return False
    
    # Filtra prodotti per categoria (inclusi quelli generali riassegnati)
    category_products = []
    for product in products:
        prod_category = product.get('category')
        if prod_category == category:
            category_products.append(product)
        elif prod_category == 'generale':
            # Assegna categoria ai prodotti generali
            assigned_category = assign_category_to_general(product)
            if assigned_category == category:
                category_products.append(product)
    
    # Rimuovi tutte le card esistenti
    for card in products_grid.find_all('div', class_='product-card'):
        card.decompose()
    
    # Aggiungi nuove card
    for product in category_products:
        card_html = generate_product_card(product)
        if card_html:
            card_soup = BeautifulSoup(card_html, 'html.parser')
            products_grid.append(card_soup.find('div', class_='product-card'))
    
    # Salva il file aggiornato
    with open(html_file, 'w', encoding='utf-8') as f:
        f.write(str(soup.prettify()))
    
    print(f"✅ Aggiornato {html_file} con {len(category_products)} prodotti")
    return True

def main():
    """Funzione principale"""
    # Carica prodotti dal file JSON
    products_file = os.path.join(os.path.dirname(__file__), 'telegram_bot', 'products.json')
    with open(products_file, 'r', encoding='utf-8') as f:
        products = json.load(f)
    
    print(f"📦 Totale prodotti nel file JSON: {len(products)}")
    
    # Conta prodotti per categoria
    donna_products = len([p for p in products if p.get('category') == 'donna'])
    uomo_products = len([p for p in products if p.get('category') == 'uomo'])
    generale_products = len([p for p in products if p.get('category') == 'generale'])
    
    print(f"👗 Prodotti donna: {donna_products}")
    print(f"👔 Prodotti uomo: {uomo_products}")
    print(f"📦 Prodotti generali: {generale_products}")
    
    # Aggiorna file HTML
    base_dir = os.path.dirname(__file__)
    
    # Aggiorna categoria donna
    donna_html = os.path.join(base_dir, 'categoria-donna.html')
    update_html_file(donna_html, products, 'donna')
    
    # Aggiorna categoria uomo
    uomo_html = os.path.join(base_dir, 'categoria-uomo.html')
    update_html_file(uomo_html, products, 'uomo')
    
    print("\n✅ Sincronizzazione completata!")

if __name__ == '__main__':
    main()
