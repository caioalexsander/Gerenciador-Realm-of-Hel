const { db } = require("../database/db.js");

function calcularValorRealComDB(itens) {
  let totalValue = 0;

  for (const item of itens) {
    if (!item?.Type) continue;

    const itemId = item.Type; // ex: 'T8_HEAD_PLATE_SET1' (confirme se é item.Type ou outro campo)
    const quantity = item.Count || item.quantity || 1;
    const quality = item.Quality || 1; // se tiver qualidade, mas DB tem só quality=1 por enquanto

    // Por enquanto usamos quality=1; se precisar de @1/@2 etc., ajuste itemId aqui
    const price = getAveragePriceAcrossCities(itemId);

    totalValue += price * quantity;
  }

  return totalValue;
}

// Função auxiliar: retorna a média de sell_avg de TODAS as cidades para um item_id
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
    return Math.round(total / rows.length); // média arredondada
  } catch (err) {
    console.error(`Erro ao consultar média de preços para ${itemId}:`, err.message);
    return 0;
  }
}

module.exports = { calcularValorRealComDB, getAveragePriceAcrossCities };
