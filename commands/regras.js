const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType
} = require("discord.js");

const addRegra = new SlashCommandBuilder()
    .setName("add_regra")
    .setDescription("Adiciona regra de cargo para guild ou aliança neste servidor (múltiplos cargos)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
        option
            .setName("tipo")
            .setDescription("Tipo da regra")
            .addChoices({ name: "guild", value: "guild" }, { name: "alliance", value: "alliance" })
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("albion_id")
            .setDescription("ID da guild ou aliança")
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("nome")
            .setDescription("Nome da guild ou aliança (para exibição)")
            .setRequired(true)
    )
    .addRoleOption(option =>
        option
            .setName("role1")
            .setDescription("Cargo 1 do Discord a ser aplicado")
            .setRequired(true)
    )
    .addRoleOption(option =>
        option
            .setName("role2")
            .setDescription("Cargo 2 (opcional)")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option
            .setName("role3")
            .setDescription("Cargo 3 (opcional)")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option
            .setName("role4")
            .setDescription("Cargo 4 (opcional)")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option
            .setName("role5")
            .setDescription("Cargo 5 (opcional)")
            .setRequired(false)
    )
    .addStringOption(option =>
        option
            .setName("tag")
            .setDescription("Tag que aparece antes do nickname, ex: ROH (será convertida para [ROH])")
            .setRequired(false)
    );

const editarRegra = new SlashCommandBuilder()
    .setName("editar_regra")
    .setDescription("(Admin) Edita uma regra existente neste servidor")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(option =>
        option
            .setName("id")
            .setDescription("ID da regra (veja com /listar_regras)")
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("tag")
            .setDescription("Nova tag (ex: ROH → [ROH]), deixe vazio para remover")
            .setRequired(false)
    );

const removerRegra = new SlashCommandBuilder()
    .setName("remover_regra")
    .setDescription("(Admin) Remove uma regra existente neste servidor")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(option =>
        option
            .setName("id")
            .setDescription("ID da regra (veja com /listar_regras)")
            .setRequired(true)
    );

const listarRegras = new SlashCommandBuilder()
    .setName("listar_regras")
    .setDescription("(Admin) Lista todas as regras configuradas neste servidor")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const verificar = new SlashCommandBuilder()
    .setName("verificar")
    .setDescription("(Admin) Verifica todos os membros do servidor (remove cargos de quem não está mais na guild/aliança)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const vincularTodos = new SlashCommandBuilder()
    .setName("vincular_todos")
    .setDescription("(Admin) Vincula todos os membros pelo nickname atual ([TAG] Nome)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const setLogChannel = new SlashCommandBuilder()
    .setName("set_log_channel")
    .setDescription("(Admin) Define o canal de logs")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
        option
            .setName("canal")
            .setDescription("Canal de texto para logs")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
    );

const data = [addRegra, editarRegra, removerRegra, listarRegras, verificar, vincularTodos, setLogChannel];

async function execute(interaction) {
    const { db, getLogChannel, getRolesForRule } = require("../database/db.js");
    const { verificarMembros } = require("../functions/verificarMembros.js");
    const axios = require("axios");

    const commandName = interaction.commandName;
    const logChannel = await getLogChannel(interaction.guild);

    if (commandName === "add_regra") {
        let tag = interaction.options.getString("tag");
        if (tag) {
            tag = tag.trim().toUpperCase();
            if (!tag.startsWith("[") && !tag.endsWith("]")) {
                tag = `[${tag}]`;
            }
        }

        const roles = [];
        for (let num = 1; num <= 5; num++) {
            const role = interaction.options.getRole(`role${num}`);
            if (role) roles.push(role.id);
        }

        if (roles.length === 0) return interaction.reply("❌ Pelo menos um cargo é obrigatório.");

        db.prepare(`
      INSERT INTO rules (guild_id, type, albion_id, albion_name, tag)
      VALUES (?,?,?,?,?)
    `).run(
            interaction.guild.id,
            interaction.options.getString("tipo"),
            interaction.options.getString("albion_id"),
            interaction.options.getString("nome"),
            tag
        );

        const ruleId = db.prepare("SELECT last_insert_rowid()").get()['last_insert_rowid()'];

        const insertRole = db.prepare("INSERT OR IGNORE INTO rule_roles (rule_id, role_id) VALUES (?, ?)");
        roles.forEach(roleId => insertRole.run(ruleId, roleId));

        const mencoes = roles.map(id => `<@&${id}>`).join(" ");
        interaction.reply(`✅ Regra adicionada com cargos: ${mencoes}${tag ? ` e tag **${tag}**` : ""}`);
        logChannel?.send(`➕ ${interaction.user.tag} adicionou regra: ${interaction.options.getString("tipo")} **${interaction.options.getString("nome")}** → ${mencoes}`);
    }

    if (commandName === "editar_regra") {
        const id = interaction.options.getInteger("id");
        const novaTag = interaction.options.getString("tag");

        const regra = db.prepare("SELECT * FROM rules WHERE id = ? AND guild_id = ?").get(id, interaction.guild.id);
        if (!regra) return interaction.reply("❌ Regra com esse ID não encontrada neste servidor.");

        let tagFinal = regra.tag;
        if (novaTag !== null) {
            if (novaTag.trim() === "") {
                tagFinal = null;
            } else {
                tagFinal = novaTag.trim().toUpperCase();
                if (!tagFinal.startsWith("[") && !tagFinal.endsWith("]")) {
                    tagFinal = `[${tagFinal}]`;
                }
            }
        }

        const updates = [];
        const params = [];

        if (tagFinal !== regra.tag) {
            updates.push("tag = ?");
            params.push(tagFinal);
        }

        if (updates.length > 0) {
            params.push(id);
            db.prepare(`UPDATE rules SET ${updates.join(", ")} WHERE id = ?`).run(...params);
        }

        const roles = [];
        for (let num = 1; num <= 5; num++) {
            const role = interaction.options.getRole(`role${num}`);
            if (role) roles.push(role.id);
        }

        if (roles.length > 0) {
            db.prepare("DELETE FROM rule_roles WHERE rule_id = ?").run(id);

            const insertRole = db.prepare("INSERT OR IGNORE INTO rule_roles (rule_id, role_id) VALUES (?, ?)");
            roles.forEach(roleId => insertRole.run(id, roleId));

            const mencoes = roles.map(id => `<@&${id}>`).join(" ");
            interaction.reply(`✅ Regra ID **${id}** atualizada! Novos cargos: ${mencoes}`);
            logChannel?.send(`✏️ ${interaction.user.tag} atualizou cargos da regra ID ${id}: ${mencoes}`);
        } else if (updates.length > 0) {
            interaction.reply(`✅ Regra ID **${id}** atualizada!`);
            logChannel?.send(`✏️ Regra ID ${id} editada por ${interaction.user.tag}`);
        } else {
            interaction.reply("⚠️ Nada foi alterado.");
        }
    }

    if (commandName === "remover_regra") {
        const id = interaction.options.getInteger("id");

        const regra = db.prepare("SELECT * FROM rules WHERE id = ? AND guild_id = ?").get(id, interaction.guild.id);
        if (!regra) return interaction.reply("❌ Regra com esse ID não encontrada neste servidor.");

        db.prepare("DELETE FROM rules WHERE id = ?").run(id); // CASCADE deleta rule_roles

        interaction.reply(`✅ Regra ID **${id}** (${regra.type} **${regra.albion_name}**) removida com sucesso!`);
        logChannel?.send(`🗑️ Regra ID ${id} (${regra.type} **${regra.albion_name}**) removida por ${interaction.user.tag}`);
    }

    if (commandName === "listar_regras") {
        const r = db.prepare("SELECT * FROM rules WHERE guild_id = ?").all(interaction.guild.id);
        if (!r.length) return interaction.reply("Nenhuma regra configurada neste servidor.");

        const lista = r.map(regra => {
            const roles = getRolesForRule(regra.id).map(id => `<@&${id}>`).join(" ");
            return `**ID: ${regra.id}** • ${regra.type} **${regra.albion_name}** ${regra.tag ? `**${regra.tag}**` : ""} → ${roles || "sem cargos"}`;
        }).join("\n");

        interaction.reply(`**Regras configuradas neste servidor:**\n${lista}`);
    }

    if (commandName === "verificar") {
        await interaction.reply("🔍 Iniciando verificação completa do servidor... Isso pode levar alguns minutos.");

        try {
            await verificarMembros(interaction.guild);
            await interaction.followUp("✅ Verificação concluída! Todos os membros foram atualizados.");
            logChannel?.send(`🔍 Verificação manual executada por ${interaction.user.tag}`);
        } catch (error) {
            console.error("Erro durante /verificar:", error);
            await interaction.followUp("❌ Ocorreu um erro durante a verificação. Veja o console para detalhes.");
            logChannel?.send(`❌ Erro na verificação manual por ${interaction.user.tag}`);
        }
    }

    if (commandName === "vincular_todos") {
        await interaction.deferReply();

        const members = await interaction.guild.members.fetch();
        let vinculados = 0;
        let falhas = 0;

        for (const member of members.values()) {
            if (member.user.bot) continue;

            const nickname = member.nickname || member.user.username;
            const match = nickname.match(/\]\s*(.+)$/);
            if (!match) continue;

            const nome = match[1].trim();

            try {
                const search = await axios.get(`https://gameinfo.albiononline.com/api/gameinfo/search?q=${encodeURIComponent(nome)}`);

                const player = search.data.players.find(p => p.Name.toLowerCase() === nome.toLowerCase());
                if (!player) continue;

                const jaVinculado = db.prepare("SELECT discord_id FROM links WHERE player_id = ?").get(player.Id);
                if (jaVinculado) continue;

                db.prepare("INSERT INTO links (discord_id, player_id, player_name) VALUES (?,?,?)").run(member.id, player.Id, player.Name);

                vinculados++;
                logChannel?.send(`🔗 Vinculado automaticamente: ${member.user.tag} → "${player.Name}"`);
            } catch (error) {
                falhas++;
                logChannel?.send(`⚠️ Falha ao vincular ${member.user.tag} com "${nome}": ${error.message}`);
            }

            await new Promise(r => setTimeout(r, 500));
        }

        interaction.editReply(`✅ Vinculação em massa concluída: ${vinculados} sucessos, ${falhas} falhas.`);
        logChannel?.send(`📦 Vinculação em massa por ${interaction.user.tag}: ${vinculados} sucessos, ${falhas} falhas.`);
    }

    if (commandName === "set_log_channel") {
        const canal = interaction.options.getChannel("canal");

        db.prepare("INSERT OR REPLACE INTO guild_configs (guild_id, log_channel_id) VALUES (?,?)").run(interaction.guild.id, canal.id);

        interaction.reply(`✅ Canal de logs definido para ${canal.name}.`);
        canal.send(`🛠️ Este canal foi definido como log por ${interaction.user.tag}.`);
    }
}

module.exports = { data, execute };