const axios = require("axios");

async function calcularValorReal(items) {
    if (!items || items.length === 0) return 0;

    const uniqueItems = [...new Set(items.map(item => `${item.Type}@${item.Quality || 0}`))];
    const pricesUrl = `https://www.albion-online-data.com/api/v2/stats/prices/${uniqueItems.join(',')}?locations=Caerleon,Bridgewatch,Thetford,Lymhurst,FortSterling,Martlock`;

    const res = await axios.get(pricesUrl).catch(() => null);
    if (!res?.data) return 0;

    const priceMap = new Map();
    res.data.forEach(p => {
        const key = `${p.item_id}@${p.quality}`;
        // Prioriza sell_price_avg, fallback para sell_price_min se avg for 0 ou undefined
        priceMap.set(key, p.sell_price_avg > 0 ? p.sell_price_avg : (p.sell_price_min || 0));
    });

    let total = 0;
    for (const item of items) {
        const key = `${item.Type}@${item.Quality || 0}`;
        const price = priceMap.get(key) || 0;
        total += price * (item.Count || 1);
    }
    return total;
}

module.exports = { calcularValorReal };