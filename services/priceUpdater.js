const Database = require('better-sqlite3');
const axios = require('axios');
const path = require('path');

const db = new Database(path.join(__dirname, '../database.db'));

// Tabela prices (já criada anteriormente)
db.prepare(`
  CREATE TABLE IF NOT EXISTS prices (
    item_id TEXT,
    city TEXT,
    sell_min INTEGER DEFAULT 0,
    sell_avg INTEGER DEFAULT 0,
    sell_max INTEGER DEFAULT 0,
    buy_min INTEGER DEFAULT 0,
    updated_at TEXT,
    PRIMARY KEY (item_id, city)
  )
`).run();

const cities = ['Caerleon', 'Thetford', 'Martlock', 'Bridgewatch', 'Lymhurst', 'Fort Sterling'];
const citiesStr = cities.join(',');

const apiBase = 'https://west.albion-online-data.com/api/v2/stats/'; // ou 'east' se for Asia

// Config para segurança anti-rate-limit
const BATCH_SIZE = 250;          // Aumentado para 250 (testado: cabe na URL)
const DELAY_BETWEEN_BATCHES = 4000; // 4 segundos → ~15 req/min (muito seguro)
const REQUEST_TIMEOUT = 20000;   // 20 segundos por requisição

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = 2) {
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const res = await axios.get(url, { timeout: REQUEST_TIMEOUT });
      return res.data;
    } catch (err) {
      if (err.response?.status === 429 && attempt <= retries) {
        console.warn(`Rate limit (429) detectado na tentativa ${attempt}. Aguardando 10s extra...`);
        await delay(10000);
        continue;
      }
      throw err;
    }
  }
}

async function updatePrices() {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Iniciando atualização de preços (batches seguros)...`);

  const allItems = db.prepare('SELECT item_id FROM itens').all().map(row => row.item_id);
  console.log(`Total de itens: ${allItems.length}`);

  if (allItems.length === 0) return;

  const totalBatches = Math.ceil(allItems.length / BATCH_SIZE);
  let processed = 0;

  for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
    const batch = allItems.slice(i, i + BATCH_SIZE);
    const itemsStr = batch.join(',');
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    console.log(`Processando batch ${batchNum}/${totalBatches} (${batch.length} itens)...`);

    try {
      // Preços atuais
      const pricesUrl = `${apiBase}prices/${itemsStr}?locations=${citiesStr}&qualities=1`;
      const pricesData = await fetchWithRetry(pricesUrl);

      // Histórico (últimas ~48h)
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const dateStr = `${twoDaysAgo.getMonth() + 1}-${twoDaysAgo.getDate()}-${twoDaysAgo.getFullYear()}`;
      const historyUrl = `${apiBase}history/${itemsStr}?locations=${citiesStr}&qualities=1&time-scale=1&date=${dateStr}`;
      const historyData = await fetchWithRetry(historyUrl);

      // Mapa de avg_price recente
      const avgMap = {};
      (Array.isArray(historyData) ? historyData : [historyData]).forEach(itemHist => {
        if (itemHist?.location && itemHist.quality === 1 && itemHist.data?.length > 0) {
          const sorted = itemHist.data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          const recent = sorted.find(d => d.avg_price > 0 && d.item_count > 0);
          if (recent) avgMap[`${itemHist.item_id}-${itemHist.location}`] = Math.round(recent.avg_price);
        }
      });

      // Upsert no DB
      const upsert = db.transaction((entries) => {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO prices 
          (item_id, city, sell_min, sell_avg, sell_max, buy_min, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, DATETIME('now'))
        `);
        entries.forEach(entry => stmt.run(...entry));
      });

      const entries = [];
      (Array.isArray(pricesData) ? pricesData : [pricesData]).forEach(price => {
        if (price?.city && price.quality === 1) {
          const key = `${price.item_id}-${price.city}`;
          entries.push([
            price.item_id,
            price.city,
            price.sell_price_min || 0,
            avgMap[key] || 0,
            price.sell_price_max || 0,
            price.buy_price_min || 0
          ]);
        }
      });

      if (entries.length > 0) upsert(entries);

      processed += batch.length;
      console.log(`Batch ${batchNum} OK (${processed}/${allItems.length} itens atualizados).`);

    } catch (err) {
      console.error(`Erro no batch ${batchNum}: ${err.message}`);
      if (err.response) console.error('Detalhes:', err.response.status, err.response.data?.message || err.response.data);
    }

    // Delay entre batches (exceto o último)
    if (i + BATCH_SIZE < allItems.length) {
      await delay(DELAY_BETWEEN_BATCHES);
    }
  }

  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
  console.log(`[${new Date().toISOString()}] Atualização concluída em ${duration} minutos.`);
}

module.exports = { updatePrices };