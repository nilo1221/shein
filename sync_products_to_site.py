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

def create_category_html(category_name, products):
    """Crea un nuovo file HTML per una categoria se non esiste"""
    base_dir = os.path.dirname(__file__)
    html_file = os.path.join(base_dir, f'categoria-{category_name}.html')
    
    # Se il file esiste, aggiorna solo i prodotti
    if os.path.exists(html_file):
        update_html_file(html_file, products, category_name)
        return
    
    # Se non esiste, crea un nuovo file basato su un template
    print(f"📝 Creazione nuovo file HTML per categoria: {category_name}")
    
    # Usa categoria-donna.html come template
    template_file = os.path.join(base_dir, 'categoria-donna.html')
    if not os.path.exists(template_file):
        print(f"❌ Template non trovato: {template_file}")
        return
    
    with open(template_file, 'r', encoding='utf-8') as f:
        template = f.read()
    
    # Modifica il template per la nuova categoria
    soup = BeautifulSoup(template, 'html.parser')
    
    # Aggiorna titolo e meta
    title_tag = soup.find('title')
    if title_tag:
        title_tag.string = f"Moda {category_name.title()} - Abbigliamento e Accessori"
    
    meta_desc = soup.find('meta', attrs={'name': 'description'})
    if meta_desc:
        meta_desc['content'] = f"Scopri la collezione {category_name}: vestiti, accessori e prodotti di qualità. Acquista online {category_name} a prezzi incredibili."
    
    # Aggiorna prodotti grid
    products_grid = soup.find('div', class_='products-grid')
    if products_grid:
        # Rimuovi prodotti esistenti
        for card in products_grid.find_all('div', class_='product-card'):
            card.decompose()
        
        # Aggiungi nuovi prodotti
        for product in products:
            card_html = generate_product_card(product)
            if card_html:
                card_soup = BeautifulSoup(card_html, 'html.parser')
                products_grid.append(card_soup.find('div', class_='product-card'))
    
    # Salva il nuovo file
    with open(html_file, 'w', encoding='utf-8') as f:
        f.write(str(soup.prettify()))
    
    print(f"✅ Creato {html_file} con {len(products)} prodotti")

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
    
    # Ottieni tutte le categorie uniche dai prodotti
    categories = set()
    for product in products:
        category = product.get('category')
        if category:
            categories.add(category)
    
    print(f"📂 Categorie trovate: {len(categories)}")
    for category in sorted(categories):
        category_products = len([p for p in products if p.get('category') == category])
        print(f"  - {category}: {category_products} prodotti")
    
    # Aggiorna o crea file HTML per ogni categoria
    base_dir = os.path.dirname(__file__)
    for category in sorted(categories):
        category_products = [p for p in products if p.get('category') == category]
        
        # Usa la funzione che crea o aggiorna il file HTML
        create_category_html(category, category_products)
    
    print("\n✅ Sincronizzazione completata!")

if __name__ == '__main__':
    main()
