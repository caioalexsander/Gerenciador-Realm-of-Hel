const axios = require("axios");
const { db } = require("../database/db.js");

// Cache simples de preços (atualiza a cada 6 horas do DB)
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 horas

// Cidades disponíveis
const CITIES = ['Caerleon', 'Bridgewatch', 'Thetford', 'Lymhurst', 'FortSterling', 'Martlock'];

// Global cache para preços (memória, dura 10 min)
const priceGlobalCache = new Map(); // key: "itemId_city_type" → { value, timestamp }

// Função para atualizar preços de itens no DB (chamada periodicamente)
async function updateItemPrices(itemIds = []) {
    if (itemIds.length === 0) {
        // Se vazio, pegar todos item_id do DB ou uma lista hardcoded de itens comuns
        itemIds = db.prepare("SELECT item_id FROM itens").all().map(i => i.item_id);
    }

    for (const itemId of itemIds) {
        try {
            const url = `https://www.albion-online-data.com/api/v2/stats/prices/${itemId}?locations=${CITIES.join(',')}`;
            const res = await axios.get(url);
            const prices = {};
            res.data.forEach(p => {
                if (!prices[p.city]) prices[p.city] = {};
                prices[p.city].sell_avg = p.sell_price_avg;
                prices[p.city].buy_min = p.sell_price_min; // Assumindo buy_min como sell_min para buy orders
                prices[p.city].timestamp = Date.now();
            });

            db.prepare("UPDATE itens SET prices = ? WHERE item_id = ?").run(JSON.stringify(prices), itemId);
        } catch (e) {
            console.error(`Erro atualizando preços de ${itemId}:`, e);
        }
    }
}

// Função para obter preço de item do DB (fallback para API se desatualizado)
async function getItemPrice(itemId, city, type = 'sell_avg') {
    const cacheKey = `${itemId}_${city}_${type}`;

    // Cache global (memória) - dura 10 minutos
    if (priceGlobalCache.has(cacheKey)) {
        const cached = priceGlobalCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 10 * 60 * 1000) {
            return cached.value;
        }
    }

    // Cache no banco (já existe, mas vamos usar primeiro)
    const item = db.prepare("SELECT prices FROM itens WHERE item_id = ?").get(itemId);
    if (item) {
        const prices = JSON.parse(item.prices || '{}');
        if (prices[city] && Date.now() - prices[city].timestamp < CACHE_DURATION) {
            const value = prices[city][type] || 0;
            priceGlobalCache.set(cacheKey, { value, timestamp: Date.now() });
            return value;
        }
    }

    // Fallback API - com delay para não floodar
    await new Promise(r => setTimeout(r, 700)); // ~1 req por segundo (seguro para 100/min)

    try {
        const url = `https://www.albion-online-data.com/api/v2/stats/prices/${encodeURIComponent(itemId)}?locations=${encodeURIComponent(city)}`;
        const res = await axios.get(url, { timeout: 10000 });

        const data = res.data?.find(p => p.city === city);
        const sell_avg = data?.sell_price_avg || 0;
        const buy_min = data?.sell_price_min || 0;

        // Atualiza DB
        let prices = item ? JSON.parse(item.prices || '{}') : {};
        prices[city] = { sell_avg, buy_min, timestamp: Date.now() };
        db.prepare("INSERT OR REPLACE INTO itens (item_id, prices) VALUES (?, ?)")
            .run(itemId, JSON.stringify(prices));

        const value = type === 'sell_avg' ? sell_avg : buy_min;
        priceGlobalCache.set(cacheKey, { value, timestamp: Date.now() });
        return value;
    } catch (e) {
        if (e.response?.status === 429) {
            console.warn(`Rate limit atingido para ${itemId} em ${city}. Aguardando 1 minuto...`);
            await new Promise(r => setTimeout(r, 60000)); // Espera 1 min se 429
            return await getItemPrice(itemId, city, type); // Tenta de novo
        }
        console.error(`Erro preço API (${itemId}, ${city}):`, e.message);
        return 0;
    }
}

// Função para obter recipe e outros dados do item (da API oficial se não no DB)
async function getItemData(itemId) {
    const item = db.prepare("SELECT * FROM itens WHERE item_id = ?").get(itemId);
    if (item) {
        return {
            ...item,
            recipe: typeof item.recipe === 'string' ? JSON.parse(item.recipe) : (item.recipe || [])
        };
    }

    try {
        const res = await axios.get(`https://gameinfo.albiononline.com/api/gameinfo/items/${itemId}/data`);
        const data = res.data;

        const recipe = data.craftingRequirements?.craftResourceList || [];
        const bonus_city = 'Caerleon'; // TODO: Mapear por tipo de item
        const bonus_percent = 0.15; // Default, atualizar baseado em tipo

        db.prepare(`
      INSERT OR REPLACE INTO itens (item_id, recipe, bonus_city, bonus_percent)
      VALUES (?, ?, ?, ?)
    `).run(itemId, JSON.stringify(recipe), bonus_city, bonus_percent);

        return { item_id: itemId, recipe, bonus_city, bonus_percent };
    } catch (e) {
        console.error(`Falha ao buscar dados do item ${itemId}:`, e.message);
        return null;
    }
}

// Função para calcular base focus cost
function calculateBaseFocusCost(resourceCount, tier) {
    return 10 * resourceCount * Math.pow(1.75, tier - 1);
}

// Função para calcular focus efficiency (baseado em spec)
function calculateFocusEfficiency(specs, category) {
    const userSpec = specs[category] || { mastery: 0, spec: 0 };
    // Fórmula aproximada: mastery * 0.3 + spec * bonus (assumir 2.5 médio)
    return (userSpec.mastery * 0.3) + (userSpec.spec * 2.5);
}

// Função para calcular RRR
function calculateRRR(bonus, useFocus) {
    const totalBonus = bonus + (useFocus ? 0.59 : 0); // Approx +59% com focus
    return totalBonus / (1 + totalBonus);
}

// Função para calcular crafting fee (aprox)
async function calculateCraftingFee(itemId, usageFeePer100 = 300) {
    const itemData = await getItemData(itemId);
    if (!itemData || !itemData.recipe?.length) return 0;

    const materials = itemData.recipe.reduce((sum, mat) => sum + (mat.count || 0), 0);
    const tier = parseInt(itemId.match(/T(\d+)/)?.[1] || 4);
    const nutrition = materials * 18 * Math.pow(2, tier - 4); // Approx da fórmula
    return (nutrition * usageFeePer100) / 100;
}

// Função principal de cálculo de craft
async function calculateCraft(discordId, itemId, premium = false, useFocus = false, baseCalculo = 'quantidade', value = 1) {
    const itemData = await getItemData(itemId);
    if (!itemData) return { error: 'Item não encontrado' };

    const recipe = itemData.recipe || [];
    if (!recipe.length) return { error: 'Nenhuma receita encontrada para esse item.' };

    const bonusCity = itemData.bonus_city;
    const baseBonus = itemData.bonus_percent;

    // Pegar spec do user (principal player)
    const principal = db.prepare("SELECT player_id FROM links WHERE discord_id = ? AND is_principal = 1").get(discordId);
    const playerId = principal ? principal.player_id : db.prepare("SELECT player_id FROM links WHERE discord_id = ? LIMIT 1").get(discordId)?.player_id;
    const specsRow = db.prepare("SELECT specs FROM user_specs WHERE discord_id = ? AND player_id = ?").get(discordId, playerId);
    const specs = specsRow ? JSON.parse(specsRow.specs) : {};

    // Categoria approx (ex: extrair de itemId)
    const category = itemId.split('_')[1] || 'GENERAL'; // Ex: BAG, ARMOR

    // Calcular RRR
    const rrr = calculateRRR(baseBonus, useFocus);

    // Custo de materiais efetivo
    let totalMatCost = 0;
    const matPrices = {};
    const matPricesCache = {}; // cache temporário por matId/city

    for (const mat of recipe) {
        const matId = mat.resource?.uniqueName || mat.resource || mat.uniqueName || 'UNKNOWN';
        if (!matId || matId === 'UNKNOWN') continue;

        matPrices[matId] = matPrices[matId] || {};

        for (const city of CITIES) {
            const cacheKey = `${matId}_${city}`;
            if (!matPricesCache[cacheKey]) {
                matPricesCache[cacheKey] = {
                    buy_min: await getItemPrice(matId, city, 'buy_min'),
                    sell_avg: await getItemPrice(matId, city, 'sell_avg')
                };
            }
            matPrices[matId][city] = matPricesCache[cacheKey];
        }

        // Usa o mais barato
        let cheapestPrice = Infinity;
        for (const city in matPrices[matId]) {
            const p = matPrices[matId][city].buy_min;
            if (p < cheapestPrice && p > 0) cheapestPrice = p;
        }
        totalMatCost += cheapestPrice * mat.count;
    }
    const effectiveMatCost = totalMatCost * (1 - rrr);

    // Fee (assumir usage fee médio, ou input)
    const fee = await calculateCraftingFee(itemId); // TODO: permitir input de usage fee

    // Focus
    const resourceCount = recipe.reduce((sum, mat) => sum + mat.count, 0);
    const tier = parseInt(itemId.match(/T(\d+)/)?.[1] || 4);
    const baseFocus = calculateBaseFocusCost(resourceCount, tier);
    const focusEfficiency = calculateFocusEfficiency(specs, category);
    const effectiveFocus = baseFocus * Math.pow(0.5, focusEfficiency / 10000);

    // Sell price na cidade bonus
    const sellPrice = await getItemPrice(itemId, bonusCity, 'sell_avg');

    // Ajustar pela base de cálculo
    let quantity = 1;
    if (baseCalculo === 'quantidade') {
        quantity = value;
    } else if (baseCalculo === 'focus') {
        quantity = Math.floor(value / effectiveFocus);
    } else if (baseCalculo === 'investimento') {
        quantity = Math.floor(value / (effectiveMatCost + fee));
    }

    const totalCost = (effectiveMatCost + fee) * quantity;
    const totalProfit = (sellPrice * quantity) - totalCost;

    return {
        cidadeCraft: bonusCity,
        totalGasto: totalCost,
        materiaisBaratos: matPrices, // Preços por cidade
        profit: totalProfit,
        profitPerItem: totalProfit / quantity,
        rrr: (rrr * 100).toFixed(1) + '%',
        focusUsed: effectiveFocus * quantity,
        quantity
    };
}

module.exports = {
    updateItemPrices,
    getItemPrice,
    getItemData,
    calculateCraft
};