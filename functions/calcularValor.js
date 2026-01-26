const { db } = require("../database/db.js");

function calcularValorRealComDB(itens) {
  let totalValue = 0;

  for (const item of itens) {
    if (!item?.Type) continue;

    let itemId = item.Type; // ex: 'T5_2H_IRONCLADEDSTAFF' ou já com @1
    const quantity = item.Count || item.quantity || 1;
    const quality = item.Quality || 1;

    // Ajusta itemId para incluir @ se quality >1 e ainda não tiver
    if (quality > 1 && !itemId.includes('@')) {
      const enchantLevel = quality - 1; // quality 2 = @1, 3 = @2, 4 = @3
      itemId += `@${enchantLevel}`;
    }

    // Ignora itens non-tradable, quest, tokens, tesouros
    if (itemId.includes('NONTRADABLE') ||
        itemId.includes('QUESTITEM') ||
        itemId.includes('TOKEN') ||
        itemId.includes('TREASURE')) {
      continue;
    }

    const price = getAveragePriceAcrossCities(itemId);

    // Se não encontrou com @, fallback para base (sem @)
    let finalPrice = price;
    if (finalPrice === 0 && itemId.includes('@')) {
      const baseId = itemId.split('@')[0];
      finalPrice = getAveragePriceAcrossCities(baseId);
      if (finalPrice > 0) {
        console.log(`Fallback usado: preço base para ${itemId} → ${finalPrice}`);
      }
    }

    totalValue += finalPrice * quantity;
  }

  return totalValue;
}

function getAveragePriceAcrossCities(itemId) {
  try {
    const rows = db.prepare(`
      SELECT sell_avg 
      FROM prices 
      WHERE item_id = ? AND sell_avg > 0
    `).all(itemId);

    if (rows.length === 0) {
      console.warn(`Nenhum preço sell_avg encontrado para item ${itemId} em nenhuma cidade`);
      return 0;
    }

    const total = rows.reduce((sum, row) => sum + row.sell_avg, 0);
    return Math.round(total / rows.length);
  } catch (err) {
    console.error(`Erro ao consultar média de preços para ${itemId}:`, err.message);
    return 0;
  }
}

module.exports = { calcularValorRealComDB };