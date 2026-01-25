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

module.exports = { calcularValorRealComDB };