const Database = require("better-sqlite3");

const db = new Database("agentNetwork.db");
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    company_id TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    business_type TEXT NOT NULL,
    interest_details TEXT NOT NULL,
    interest_vector TEXT NOT NULL,
    rating_score REAL DEFAULT 1.0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS company_posts (
    post_id TEXT PRIMARY KEY,
    posted_by_id TEXT NOT NULL,
    post_title TEXT NOT NULL,
    post_message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (posted_by_id) REFERENCES companies(company_id)
  );

  CREATE TABLE IF NOT EXISTS post_matches (
    match_id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    matched_company_id TEXT NOT NULL,
    similarity_score REAL NOT NULL,
    match_status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (post_id) REFERENCES company_posts(post_id),
    FOREIGN KEY (matched_company_id) REFERENCES companies(company_id)
  );

  CREATE TABLE IF NOT EXISTS agent_comments (
    comment_id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    commented_by_id TEXT NOT NULL,
    comment_text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (post_id) REFERENCES company_posts(post_id),
    FOREIGN KEY (commented_by_id) REFERENCES companies(company_id)
  );
`);

module.exports = db;