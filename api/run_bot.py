#!/usr/bin/env python3
import subprocess
import time
import json
import os

def load_queue():
    """Carica la coda dal file JSON"""
    queue_file = 'data/queue.json'
    try:
        with open(queue_file, 'r') as f:
            data = json.load(f)
            return data.get('queue', [])
    except FileNotFoundError:
        return []

def main():
    print("🚀 Avvio bot Telegram...")
    
    # 1. Accoda nuovi prodotti
    print("\n📋 Step 1: Accodamento prodotti...")
    result = subprocess.run(['node', 'api/bot.js', 'enqueue'], capture_output=True, text=True)
    print(result.stdout)
    
    # 2. Processa coda in loop finché non è vuota
    print("\n⚙️ Step 2: Processamento coda...")
    
    while True:
        queue = load_queue()
        
        if len(queue) == 0:
            print("✅ Coda vuota, bot completato!")
            break
        
        print(f"\n📦 Prodotti in coda: {len(queue)}")
        print("⏳ Processamento batch di 5 prodotti...")
        
        result = subprocess.run(['node', 'api/bot.js', 'process'], capture_output=True, text=True)
        print(result.stdout)
        
        if result.stderr:
            print(f"❌ Errore: {result.stderr}")
            break
        
        # Pausa tra batch (5 secondi)
        print("⏸️ Pausa 5 secondi prima del prossimo batch...")
        time.sleep(5)
    
    print("\n🎉 Bot completato con successo!")

if __name__ == "__main__":
    main()
