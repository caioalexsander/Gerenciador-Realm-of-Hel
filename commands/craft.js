const { SlashCommandBuilder } = require("discord.js");

const atualizarSpecCraft = new SlashCommandBuilder()
    .setName("atualizar_spec_craft")
    .setDescription("Atualiza seu spec de crafting para uma categoria")
    .addStringOption(option =>
        option
            .setName("categoria")
            .setDescription("Categoria ex: BAG, ARMOR_CLOTH_SET3")
            .setRequired(true)
    )
    .addIntegerOption(option =>
        option
            .setName("mastery")
            .setDescription("Nível de mastery")
            .setRequired(true)
    )
    .addIntegerOption(option =>
        option
            .setName("spec")
            .setDescription("Nível de specialization")
            .setRequired(true)
    );

const craft = new SlashCommandBuilder()
    .setName("craft")
    .setDescription("Calcula profit de crafting")
    .addStringOption(option =>
        option
            .setName("item_id")
            .setDescription("ID do item ex: T8_BAG")
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("base_de_calculo")
            .setDescription("Base de cálculo")
            .addChoices(
                { name: "Quantidade de itens", value: "quantidade" },
                { name: "Quantidade de focus", value: "focus" },
                { name: "Valor em prata investido", value: "investimento" }
            )
            .setRequired(true)
    )
    .addIntegerOption(option =>
        option
            .setName("valor")
            .setDescription("Valor da base (itens/focus/prata)")
            .setRequired(true)
    )
    .addBooleanOption(option =>
        option
            .setName("premium")
            .setDescription("Usar premium? (reduz tax)")
            .setRequired(false)
    )
    .addBooleanOption(option =>
        option
            .setName("focus")
            .setDescription("Usar focus? (se true, usa seu spec)")
            .setRequired(false)
    );

const data = [atualizarSpecCraft, craft];

async function execute(interaction) {
    const { db } = require("../database/db.js");
    const { calculateCraft } = require("../services/craftingService.js");

    const commandName = interaction.commandName;

    if (commandName === "atualizar_spec_craft") {
        await interaction.deferReply({ ephemeral: true });

        const categoria = interaction.options.getString("categoria").toUpperCase();
        const mastery = interaction.options.getInteger("mastery");
        const spec = interaction.options.getInteger("spec");

        // Pegar player principal
        const principal = db.prepare("SELECT player_id FROM links WHERE discord_id = ? AND is_principal = 1").get(interaction.user.id);
        const playerId = principal ? principal.player_id : db.prepare("SELECT player_id FROM links WHERE discord_id = ? LIMIT 1").get(interaction.user.id)?.player_id;
        if (!playerId) return interaction.editReply("❌ Nenhum personagem vinculado. Use /vincular primeiro.");

        let specs = db.prepare("SELECT specs FROM user_specs WHERE discord_id = ? AND player_id = ?").get(interaction.user.id, playerId);
        specs = specs ? JSON.parse(specs.specs) : {};
        specs[categoria] = { mastery, spec };

        db.prepare(`
      INSERT OR REPLACE INTO user_specs (discord_id, player_id, specs)
      VALUES (?, ?, ?)
    `).run(interaction.user.id, playerId, JSON.stringify(specs));

        interaction.editReply(`✅ Spec atualizado para ${categoria}: Mastery ${mastery}, Spec ${spec}`);
    }

    if (commandName === "craft") {
        await interaction.deferReply();

        const itemId = interaction.options.getString("item_id").toUpperCase();
        const premium = interaction.options.getBoolean("premium") || false;
        const focus = interaction.options.getBoolean("focus") || false;
        const baseCalculo = interaction.options.getString("base_de_calculo");
        const value = interaction.options.getInteger("valor");

        const result = await calculateCraft(interaction.user.id, itemId, premium, focus, baseCalculo, value);
        if (result.error) return interaction.editReply(result.error);

        let msg = `**Cidade para craft:** ${result.cidadeCraft}\n`;
        msg += `**Total gasto:** ${result.totalGasto.toLocaleString()} silver\n`;
        msg += `**Profit:** ${result.profit.toLocaleString()} silver (${result.profitPerItem.toLocaleString()} por item)\n`;
        msg += `**Quantidade:** ${result.quantity}\n`;
        if (focus) msg += `**Focus usado:** ${result.focusUsed.toLocaleString()}\n`;
        msg += `**RRR:** ${result.rrr}\n\n`;

        msg += "**Materiais mais baratos:**\n";
        for (const mat in result.materiaisBaratos) {
            msg += `**${mat}:**\n`;
            for (const city in result.materiaisBaratos[mat]) {
                const p = result.materiaisBaratos[mat][city];
                msg += `- ${city}: Buy Min ${p.buy_min.toLocaleString()}, Sell Avg ${p.sell_avg.toLocaleString()}\n`;
            }
        }

        interaction.editReply(msg);
    }
}

module.exports = { data, execute };