const { createCanvas, loadImage } = require("canvas");

async function gerarImagemEquipamentos(killEvent) {
    const width = 700;  // Mais largo para dois lados
    const height = 650;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Fundo
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, width, height);

    // Cabeçalho
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${killEvent.killerName} Mataou ${killEvent.victimName}`, width / 2, 40);

    ctx.font = '16px Arial';
    ctx.fillStyle = '#ffcc00';
    ctx.fillText(`Guild Killer: ${killEvent.killerGuild || "None"}`, width * 3 / 4, 80);
    ctx.fillStyle = '#ff4444';
    ctx.fillText(`Guild Vítima: ${killEvent.victimGuild || "None"}`, width / 4, 80);

    ctx.fillStyle = '#aaaaaa';
    ctx.fillText(`Valor: ${killEvent.valor.toLocaleString('pt-BR')} K • ${killEvent.time}`, width / 2, 110);

    // Equipamentos - Victim (esquerda) e Killer (direita)
    const victimEquipment = killEvent.victimEquipment || {};
    const killerEquipment = killEvent.killerEquipment || {};

    const drawEquipment = async (equip, xOffset, label) => {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(label, xOffset + 100, 140);

        const positions = [
            { slot: 'Head', x: xOffset + 80, y: 160 },
            { slot: 'Armor', x: xOffset + 80, y: 240 },
            { slot: 'Shoes', x: xOffset + 80, y: 320 },
            { slot: 'MainHand', x: xOffset, y: 240 },
            { slot: 'OffHand', x: xOffset + 160, y: 240 },
            { slot: 'Cape', x: xOffset + 160, y: 160 },
            { slot: 'Mount', x: xOffset + 80, y: 400 },
            { slot: 'Bag', x: xOffset, y: 160 },
            { slot: 'Potion', x: xOffset, y: 400 },
            { slot: 'Food', x: xOffset + 160, y: 400 }
        ];

        for (const { slot, x, y } of positions) {
            const item = equip[slot];
            if (item && item.Type) {
                const url = `https://render.albiononline.com/v1/item/${item.Type}.png?quality=${item.Quality || 1}&size=80`;
                try {
                    const img = await loadImage(url);
                    ctx.drawImage(img, x, y, 80, 80);
                } catch { }
            }
        }
    };

    // Lado esquerdo: equipamentos da vítima + nome real
    await drawEquipment(victimEquipment, 50, killEvent.victimName || "Vítima");

    // Lado direito: equipamentos do killer + nome real
    await drawEquipment(killerEquipment, width / 2 + 50, killEvent.killerName || "Killer");

    // Inventário da vítima (abaixo)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Inventory`, 20, 495);

    const invItems = (killEvent.inventory || []).slice(0, 48); // Mostra até 48 itens
    for (let i = 0; i < invItems.length; i++) {
        const item = invItems[i];
        if (item && item.Type) {
            const url = `https://render.albiononline.com/v1/item/${item.Type}.png?quality=${item.Quality || 1}&size=50`;
            try {
                const img = await loadImage(url);
                const x = 20 + (i % 12) * 50;
                const y = 500 + Math.floor(i / 12) * 50;
                ctx.drawImage(img, x, y, 50, 50);
            } catch { }
        }
    }

    return canvas.toBuffer('image/png');
}

module.exports = { gerarImagemEquipamentos };