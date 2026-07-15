# Bot Telegram Moda Online

Bot Telegram per visualizzare i prodotti SHEIN sincronizzati dal sito web.

## 📋 Requisiti

- Python 3.7+
- Token Bot Telegram (ottenibile da [@BotFather](https://t.me/BotFather))

## 🚀 Installazione

1. Installa le dipendenze:
```bash
cd telegram_bot
pip install -r requirements.txt
```

2. Ottieni il token del bot da [@BotFather](https://t.me/BotFather) su Telegram

3. Inserisci il token nel file `config.py`:
```python
BOT_TOKEN = "IL_TUO_BOT_TOKEN_QUI"  # Sostituisci con il tuo token reale
```

## 📦 Estrazione Prodotti

Prima di avviare il bot, estrai i prodotti dal sito:

```bash
python extract_products.py
```

Questo script:
- Legge i file HTML del sito (`categoria-donna.html` e `categoria-uomo.html`)
- Estrae tutti i prodotti (titolo, descrizione, immagine, link)
- Salva i dati in `products.json`

## 🤖 Avvio del Bot

```bash
python bot.py
```

## 🎮 Comandi del Bot

- `/start` - Avvia il bot e mostra il menù principale
- `/donna` - Mostra prodotti donna
- `/uomo` - Mostra prodotti uomo  
- `/tutti` - Mostra tutti i prodotti
- `/help` - Mostra la guida

## 🔄 Sincronizzazione

Per sincronizzare i prodotti quando aggiorni il sito:

1. Aggiorna i file HTML del sito
2. Esegui `python extract_products.py`
3. Il bot userà automaticamente i nuovi dati

### Sincronizzazione e Avvio Automatico

Per estrarre i prodotti e avviare il bot in un solo comando:

```bash
python sync_and_run.py
```

Questo script:
1. Estrae automaticamente i prodotti dal sito
2. Avvia il bot con i dati aggiornati
3. È utile per sincronizzare prima di ogni avvio

## 📁 Struttura del Progetto

```
telegram_bot/
├── bot.py              # Script principale del bot
├── extract_products.py # Script per estrarre prodotti dal sito
├── sync_and_run.py     # Script per sincronizzazione e avvio automatico
├── config.py           # File di configurazione (token bot)
├── requirements.txt    # Dipendenze Python
├── products.json       # Database prodotti (generato automaticamente)
└── README.md          # Questo file
```

## 🔧 Funzionalità

- ✅ Visualizzazione prodotti per categoria
- ✅ Navigazione tra prodotti (precedente/successivo)
- ✅ Link affiliato diretto per ogni prodotto
- ✅ Sincronizzazione automatica con il sito
- ✅ Interfaccia con pulsanti inline
- ✅ Supporto per emoji e formattazione Markdown

## 📝 Note

- I prodotti vengono estratti automaticamente dai file HTML del sito
- Il bot usa un file JSON come database semplice
- Per aggiornare i prodotti, basta rieseguire lo script di estrazione
- Il bot è conforme alle regole di affiliazione SHEIN (usa solo link onelink)
