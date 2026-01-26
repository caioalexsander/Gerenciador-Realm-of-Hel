const { db } = require("../database/db.js");

function calcularValorRealComDB(itens) {
  let totalValue = 0;

  for (const item of itens) {
    if (!item?.Type) continue;

    let itemId = item.Type;
    const quantity = item.Count || item.quantity || 1;
    const quality = item.Quality || 1;

    // Ajusta para @ se quality >1
    if (quality > 1 && !itemId.includes('@')) {
      const enchantLevel = quality - 1;
      itemId += `@${enchantLevel}`;
    }

    // Ignora non-tradable/quest/etc.
    if (itemId.includes('NONTRADABLE') ||
        itemId.includes('QUESTITEM') ||
        itemId.includes('TOKEN') ||
        itemId.includes('TREASURE')) {
      continue;
    }

    let price = getAveragePriceAcrossCities(itemId);

    // Se não encontrou, tenta fallback para base e adiciona item na tabela itens se não existir
    // Dentro do if (price === 0 && basePrice === 0) {
if (price === 0) {
  const baseId = itemId.split('@')[0];
  const basePrice = getAveragePriceAcrossCities(baseId);

  if (basePrice > 0) {
    price = basePrice;
    console.log(`Fallback usado: preço base para ${itemId} → ${price}`);
  } else {
    // Novo: Adiciona item na tabela itens se não existir (com try-catch!)
    try {
	  const exists = db.prepare('SELECT 1 FROM itens WHERE item_id = ?').get(itemId);
	  if (!exists) {
		db.prepare(`
		  INSERT OR IGNORE INTO itens 
		  (item_id, nome, nome_ptbr, nome_enus, descricao_ptbr, descricao_enus, prices, recipe, crafting_focus, npc, nutricao, bonus_city, bonus_percent)
		  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.0, '', 0.0, NULL, 0.0)
		`).run(
		  itemId,
		  itemId || 'Desconhecido',          // nome
		  itemId || 'Desconhecido',          // nome_ptbr
		  itemId || 'Unknown',               // nome_enus
		  'Item adicionado automaticamente de kill',  // descricao_ptbr
		  'Automatically added from kill',   // descricao_enus
		  JSON.stringify({}),                // prices
		  JSON.stringify({})                 // recipe
		);
		console.log(`Novo item adicionado à tabela itens: ${itemId} (para atualização futura)`);
	  }
	} catch (err) {
	  console.error(`Erro ao adicionar item ${itemId} na tabela itens:`, err.message);
	}
  }
}

    totalValue += price * quantity;
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
      // Não loga warning aqui para evitar spam; só loga quando necessário no caller
      return 0;
    }

    const total = rows.reduce((sum, row) => sum + row.sell_avg, 0);
    return Math.round(total / rows.length);
  } catch (err) {
    console.error(`Erro ao consultar preço para ${itemId}:`, err.message);
    return 0;
  }
}

module.exports = { calcularValorRealComDB };