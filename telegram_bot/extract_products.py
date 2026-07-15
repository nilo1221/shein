#!/usr/bin/env python3
"""
Script per estrarre i prodotti dai file HTML del sito
"""
from bs4 import BeautifulSoup
import json
import os

def extract_products_from_html(html_file, category):
    """Estrae i prodotti da un file HTML"""
    with open(html_file, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
    
    products = []
    product_cards = soup.find_all('div', class_='product-card')
    
    for card in product_cards:
        try:
            img = card.find('img', class_='product-image')
            title = card.find('h3', class_='product-title')
            description = card.find('p', class_='product-description')
            link = card.find('a', class_='affiliate-btn')
            
            if img and title and description and link:
                product = {
                    'category': category,
                    'title': title.text.strip(),
                    'description': description.text.strip(),
                    'image': img.get('src', ''),
                    'link': link.get('href', '')
                }
                products.append(product)
        except Exception as e:
            print(f"Errore nell'estrazione del prodotto: {e}")
    
    return products

def main():
    """Funzione principale"""
    base_dir = '/home/lollo/shein'
    
    # Estrai prodotti donna
    donna_products = extract_products_from_html(
        os.path.join(base_dir, 'categoria-donna.html'),
        'donna'
    )
    
    # Estrai prodotti uomo
    uomo_products = extract_products_from_html(
        os.path.join(base_dir, 'categoria-uomo.html'),
        'uomo'
    )
    
    # Combina tutti i prodotti
    all_products = donna_products + uomo_products
    
    # Salva in JSON
    output_file = os.path.join(base_dir, 'telegram_bot', 'products.json')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_products, f, ensure_ascii=False, indent=2)
    
    print(f"Estratti {len(all_products)} prodotti totali:")
    print(f"  - Donna: {len(donna_products)}")
    print(f"  - Uomo: {len(uomo_products)}")
    print(f"Salvati in {output_file}")

if __name__ == '__main__':
    main()
