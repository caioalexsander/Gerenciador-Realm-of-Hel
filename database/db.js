const Database = require("better-sqlite3");

const db = new Database("database.db");

// Tabela links: múltiplos personagens por usuário (global, com is_principal)
db.prepare(`
  CREATE TABLE IF NOT EXISTS links (
    discord_id TEXT,
    player_id TEXT,
    player_name TEXT,
    is_principal INTEGER DEFAULT 0,
    PRIMARY KEY (discord_id, player_id)
  )
`).run();

// Índice único para evitar que o mesmo player_id seja vinculado a múltiplos discord_id
db.prepare(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_player_id ON links (player_id)
`).run();

// Adicionar coluna is_principal se não existir (para bancos antigos)
try {
    db.prepare("ALTER TABLE links ADD COLUMN is_principal INTEGER DEFAULT 0").run();
} catch (e) {
    // Ignora se já existe
}

// Tabela rules: regras por servidor (sem role_id único)
db.prepare(`
  CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT,
    type TEXT,
    albion_id TEXT,
    albion_name TEXT,
    tag TEXT
  )
`).run();

// Tabela para múltiplos cargos por regra
db.prepare(`
  CREATE TABLE IF NOT EXISTS rule_roles (
    rule_id INTEGER,
    role_id TEXT,
    PRIMARY KEY (rule_id, role_id)
  )
`).run();

// Tabela configs (log channel)
db.prepare(`
  CREATE TABLE IF NOT EXISTS guild_configs (
    guild_id TEXT PRIMARY KEY,
    log_channel_id TEXT
  )
`).run();

// Nova tabela para killfeed
db.prepare(`
  CREATE TABLE IF NOT EXISTS killfeed_channels (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    last_event_id INTEGER DEFAULT 0,
    min_value INTEGER DEFAULT 1000000,    -- valor mínimo em silver para postar
    filter_type TEXT DEFAULT 'guild',     -- 'guild'|'alliance'|'player'|'global'
    filter_id TEXT                        -- ID da guild/alliance/player
  )
`).run();

// Nova tabela para itens (preços, recipes, bonuses)
db.prepare(`
  CREATE TABLE IF NOT EXISTS itens (
    item_id       TEXT PRIMARY KEY,
    nome          TEXT NOT NULL DEFAULT '',
    nome_ptbr TEXT DEFAULT '',
    nome_enus TEXT DEFAULT '',
    descricao_ptbr TEXT DEFAULT '',
    descricao_enus TEXT DEFAULT '',
    prices        JSON,
    recipe        JSON,
    crafting_focus REAL DEFAULT 0.0,
    npc TEXT DEFAULT '',
    nutricao REAL DEFAULT 0.0,
    bonus_city    TEXT,
    bonus_percent REAL  
  )
`).run();

// Nova tabela para specs de crafting do usuário (vinculado a discord_id e player_id)
db.prepare(`
  CREATE TABLE IF NOT EXISTS user_specs (
    discord_id TEXT,
    player_id TEXT,
    specs JSON,  -- {category: {mastery: number, spec: number}}
    PRIMARY KEY (discord_id, player_id)
  )
`).run();

async function getLogChannel(guild) {
    const cfg = db.prepare("SELECT log_channel_id FROM guild_configs WHERE guild_id = ?").get(guild.id);
    return cfg?.log_channel_id ? guild.channels.cache.get(cfg.log_channel_id) : null;
}

function getRolesForRule(ruleId) {
    return db.prepare("SELECT role_id FROM rule_roles WHERE rule_id = ?").all(ruleId).map(r => r.role_id);
}

module.exports = {
    db,
    getLogChannel,
    getRolesForRule
};

//ALTER TABLE itens ADD COLUMN nome_ptbr TEXT;
//ALTER TABLE itens ADD COLUMN nome_enus TEXT;
//ALTER TABLE itens ADD COLUMN descricao_ptbr TEXT DEFAULT '';
//ALTER TABLE itens ADD COLUMN descricao_enus TEXT DEFAULT '';
//ALTER TABLE itens ADD COLUMN crafting_focus REAL DEFAULT 0.0;
//ALTER TABLE itens ADD COLUMN npc TEXT DEFAULT '';
//ALTER TABLE itens ADD COLUMN nutricao REAL DEFAULT 0.0;