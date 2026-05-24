'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

const DB_PATH = path.join(os.homedir(), '.cc-switch', 'cc-switch.db');
const SETTINGS_PATH = path.join(os.homedir(), '.cc-switch', 'settings.json');

async function readCCSwitchConfig() {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) {
      return { error: 'CC Switch 配置文件不存在' };
    }
    if (!fs.existsSync(DB_PATH)) {
      return { error: 'CC Switch 数据库不存在' };
    }

    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    const currentProviderId = settings.currentProviderClaude;
    if (!currentProviderId) {
      return { error: '未找到当前 Claude provider' };
    }

    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const dbBuffer = fs.readFileSync(DB_PATH);
    const db = new SQL.Database(dbBuffer);

    const stmt = db.prepare('SELECT name, settings_config FROM providers WHERE id = ?');
    stmt.bind([currentProviderId]);

    if (!stmt.step()) {
      stmt.free();
      db.close();
      return { error: `Provider "${currentProviderId}" 未找到` };
    }

    const row = stmt.getAsObject();
    stmt.free();
    db.close();

    const config = JSON.parse(row.settings_config || '{}');
    const env = config.env || {};
    const apiKey = env.ANTHROPIC_AUTH_TOKEN;
    const baseUrl = env.ANTHROPIC_BASE_URL;
    const model = env.ANTHROPIC_MODEL;

    if (!apiKey) {
      return { error: 'Provider 配置中未找到 API Key' };
    }

    return {
      apiKey,
      baseUrl: baseUrl || 'https://api.anthropic.com',
      model: model || '',
      providerName: row.name || currentProviderId,
    };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { readCCSwitchConfig };
