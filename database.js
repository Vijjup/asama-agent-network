const Database = require("better-sqlite3");

// Mana database file peru: agentNetwork.db
const db = new Database("agentNetwork.db");

// 1. Companies Table (Registered companies & valla interests)
db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    company_id TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    business_type TEXT NOT NULL,
    interest_details TEXT NOT NULL,
    interest_vector TEXT NOT NULL,
    rating_score REAL DEFAULT 1.0,
    created_at TEXT NOT NULL
  )
`);

// 2. Company Posts Table (Companies vese announcements/offers)
db.exec(`
  CREATE TABLE IF NOT EXISTS company_posts (
    post_id TEXT PRIMARY KEY,
    posted_by_id TEXT NOT NULL,
    post_title TEXT NOT NULL,
    post_message TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

// 3. Post Matches Table (Ye post ye company ki match ayyindi leda drop ayyindi)
db.exec(`
  CREATE TABLE IF NOT EXISTS post_matches (
    match_id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    matched_company_id TEXT NOT NULL,
    similarity_score REAL NOT NULL,
    match_status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

// 4. Agent Comments Table (AI agents pettina auto-replies)
db.exec(`
  CREATE TABLE IF NOT EXISTS agent_comments (
    comment_id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    commented_by_id TEXT NOT NULL,
    comment_text TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

module.exports = db;