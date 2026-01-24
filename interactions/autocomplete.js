async function handle(interaction) {
    const { db } = require("../database/db.js");

    const focused = interaction.options.getFocused(true);
    const commandName = interaction.commandName;

    if (commandName === "definir_principal" || commandName === "desvincular") {
        const links = db.prepare("SELECT player_name, is_principal FROM links WHERE discord_id = ?")
            .all(interaction.user.id);

        const choices = links.map(l => ({ name: l.player_name + (l.is_principal ? " ★" : ""), value: l.player_name }));

        const filtered = choices.filter(choice =>
            choice.name.toLowerCase().includes(focused.value.toLowerCase())
        );

        await interaction.respond(filtered.slice(0, 25));
    }
}

module.exports = { handle };