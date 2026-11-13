const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { GoogleGenAI } = require("@google/genai");
const db = require("./database");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Helper 1: Sentence ni numbers array (vector) ga marche function
async function getTextVector(text) {
  const result = await geminiClient.models.embedContent({
    model: "gemini-embedding-001",
    contents: text,
  });
  return result.embeddings[0].values;
}

// Helper 2: Rendu vectors madhya Cosine Similarity score (0 to 1) kanipette function
function calculateCosineScore(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Helper 3: Match ayina Company AI Agent automatic ga reply rayadam (with 8s Timeout)
async function generateAgentReply(responderCompany, senderCompanyName, postTitle, postMessage) {
  const prompt = `
    You are the official AI representative of ${responderCompany.company_name} (${responderCompany.business_type}).
    Your company's core interests are: ${responderCompany.interest_details}.
    
    ${senderCompanyName} just posted an update:
    Title: "${postTitle}"
    Message: "${postMessage}"
    
    Write a short, realistic 2-sentence business comment or collaboration response from ${responderCompany.company_name}'s perspective. Keep it professional and natural.
  `;

  try {
    const aiPromise = geminiClient.models.generateContent({
      model: "gemini-3.8-flash-lite",
      contents: prompt,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("AI Timeout")), 8000)
    );

    const response = await Promise.race([aiPromise, timeoutPromise]);
    return response.text.trim();
  } catch (err) {
    console.log(`AI slow/busy for ${responderCompany.company_name}, using smart template reply.`);
    return `Exciting update from ${senderCompanyName}! ${responderCompany.company_name} would love to explore a joint ${responderCompany.business_type.toLowerCase()} collaboration on "${postTitle}".`;
  }
}

// ============================================================
// API 1: Register a Company Agent (with Duplicate Prevention)
// ============================================================
app.post("/api/v1/agents/register", async (req, res) => {
  try {
    const { company_name, business_type, interest_details } = req.body;

    if (!company_name || !business_type || !interest_details) {
      return res.status(400).json({ error: "Please send company_name, business_type, and interest_details" });
    }

    // Duplicate company name check
    const existing = db.prepare("SELECT company_id FROM companies WHERE LOWER(company_name) = LOWER(?)").get(company_name);
    if (existing) {
      return res.status(409).json({ error: `${company_name} is already registered!` });
    }

    const vectorArray = await getTextVector(interest_details);
    const company_id = crypto.randomUUID();
    const created_at = new Date().toISOString();

    db.prepare(`
      INSERT INTO companies (company_id, company_name, business_type, interest_details, interest_vector, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(company_id, company_name, business_type, interest_details, JSON.stringify(vectorArray), created_at);

    res.status(201).json({
      message: `${company_name} registered successfully!`,
      company_id,
      company_name,
      vector_size: vectorArray.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registered companies list choodadaniki GET API
app.get("/api/v1/agents", (req, res) => {
  const allCompanies = db.prepare("SELECT company_id, company_name, business_type, interest_details, rating_score, created_at FROM companies").all();
  res.json({ total: allCompanies.length, companies: allCompanies });
});

// ============================================================
// API 2: Create Post -> Security Check -> Smart Route -> AI Replies
// ============================================================
app.post("/api/v1/posts", async (req, res) => {
  try {
    const { posted_by_id, post_title, post_message } = req.body;

    if (!posted_by_id || !post_title || !post_message) {
      return res.status(400).json({ error: "Please send posted_by_id, post_title, and post_message" });
    }

    const senderCompany = db.prepare("SELECT * FROM companies WHERE company_id = ?").get(posted_by_id);
    if (!senderCompany) {
      return res.status(404).json({ error: "Company not found! Check posted_by_id." });
    }

    // Security Guardrail: Block Prompt Injection / Malicious inputs
    const blockedWords = ["ignore previous instructions", "system prompt", "api_key", "drop table"];
    const combinedInput = `${post_title} ${post_message}`.toLowerCase();
    if (blockedWords.some((word) => combinedInput.includes(word))) {
      return res.status(400).json({ error: "Security Alert: Malicious or prompt-injection content blocked!" });
    }

    const post_id = crypto.randomUUID();
    const created_at = new Date().toISOString();
    db.prepare(`
      INSERT INTO company_posts (post_id, posted_by_id, post_title, post_message, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(post_id, posted_by_id, post_title, post_message, created_at);

    const fullPostText = `${post_title}: ${post_message}`;
    const postVector = await getTextVector(fullPostText);

    const otherCompanies = db.prepare("SELECT * FROM companies WHERE company_id != ?").all(posted_by_id);
    const SIMILARITY_THRESHOLD = 0.62;
    const routingResults = [];
    const generatedComments = [];

    for (const company of otherCompanies) {
      const companyVector = JSON.parse(company.interest_vector);
      const rawScore = calculateCosineScore(postVector, companyVector);
      const score = Number(rawScore.toFixed(3));
      const status = score >= SIMILARITY_THRESHOLD ? "MATCHED" : "DROPPED";

      // Save routing decision in SQLite
      db.prepare(`
        INSERT INTO post_matches (match_id, post_id, matched_company_id, similarity_score, match_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), post_id, company.company_id, score, status, new Date().toISOString());

      routingResults.push({
        company_name: company.company_name,
        similarity_score: score,
        match_status: status
      });

      // If MATCHED, trigger autonomous AI reply + update rating_score
      if (status === "MATCHED") {
        const aiComment = await generateAgentReply(company, senderCompany.company_name, post_title, post_message);

        db.prepare(`
          INSERT INTO agent_comments (comment_id, post_id, commented_by_id, comment_text, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(crypto.randomUUID(), post_id, company.company_id, aiComment, new Date().toISOString());

        // Feedback loop: boost active agent's rating_score by 0.1
        db.prepare("UPDATE companies SET rating_score = ROUND(rating_score + 0.1, 2) WHERE company_id = ?").run(company.company_id);

        generatedComments.push({
          company_name: company.company_name,
          comment_text: aiComment
        });
      }
    }

    res.status(201).json({
      message: "Post routed and AI agents replied!",
      post_id,
      posted_by: senderCompany.company_name,
      routing_results: routingResults,
      autonomous_comments: generatedComments
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// API 3: Get Full Social Feed (Posts + Routing Scores + Comments)
// ============================================================
app.get("/api/v1/posts", (req, res) => {
  const posts = db.prepare(`
    SELECT p.*, c.company_name AS posted_by_name, c.business_type
    FROM company_posts p
    JOIN companies c ON p.posted_by_id = c.company_id
    ORDER BY p.created_at DESC
  `).all();

  const fullFeed = posts.map((post) => {
    const matches = db.prepare(`
      SELECT m.similarity_score, m.match_status, c.company_name
      FROM post_matches m
      JOIN companies c ON m.matched_company_id = c.company_id
      WHERE m.post_id = ?
    `).all(post.post_id);

    const comments = db.prepare(`
      SELECT ac.comment_text, ac.created_at, c.company_name, c.business_type
      FROM agent_comments ac
      JOIN companies c ON ac.commented_by_id = c.company_id
      WHERE ac.post_id = ?
      ORDER BY ac.created_at ASC
    `).all(post.post_id);

    return { ...post, matches, comments };
  });

  res.json({ total_posts: fullFeed.length, feed: fullFeed });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});