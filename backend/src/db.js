const { Pool } = require("pg");
const seedCreators = require("./data").creators;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Configure a PostgreSQL database.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
});

const query = (text, values) => pool.query(text, values);

async function initializeDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('brand', 'creator')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS creator_profiles (
      id TEXT PRIMARY KEY,
      owner_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      tagline TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      niche TEXT NOT NULL DEFAULT '',
      skills TEXT[] NOT NULL DEFAULT '{}',
      tools TEXT[] NOT NULL DEFAULT '{}',
      content_types TEXT[] NOT NULL DEFAULT '{}',
      formats TEXT[] NOT NULL DEFAULT '{}',
      followers INTEGER NOT NULL DEFAULT 0,
      engagement NUMERIC(5,2) NOT NULL DEFAULT 0,
      commercial_use BOOLEAN NOT NULL DEFAULT FALSE,
      verified_tools TEXT[] NOT NULL DEFAULT '{}',
      verified_workflows BOOLEAN NOT NULL DEFAULT FALSE,
      verified_past_work BOOLEAN NOT NULL DEFAULT FALSE,
      portfolio JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS briefs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      brand_name TEXT NOT NULL,
      description TEXT NOT NULL,
      content_type TEXT NOT NULL,
      style TEXT NOT NULL,
      formats TEXT[] NOT NULL DEFAULT '{}',
      aspect_ratio TEXT NOT NULL,
      budget NUMERIC(12,2) NOT NULL DEFAULT 0,
      commercial_use BOOLEAN NOT NULL DEFAULT FALSE,
      usage_terms TEXT NOT NULL DEFAULT '',
      deadline DATE,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'completed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS brief_applications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brief_id UUID NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
      creator_id TEXT NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
      cover_note TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'applied'
        CHECK (status IN ('applied', 'shortlisted', 'accepted', 'declined', 'delivered', 'completed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (brief_id, creator_id)
    );

    CREATE INDEX IF NOT EXISTS creator_profiles_search_idx
      ON creator_profiles USING GIN (skills, tools, content_types);
    CREATE INDEX IF NOT EXISTS briefs_created_at_idx
      ON briefs (created_at DESC);
  `);

  for (const creator of seedCreators) {
    const content = creator.niche === "Gaming" ? "Animation" :
      creator.niche === "Food" ? "Short-form video" : "AI film";
    const tools = creator.niche === "Gaming"
      ? ["Runway", "Blender", "ComfyUI"]
      : ["Midjourney", "Runway", "ComfyUI"];
    const portfolio = [{
      title: `${creator.niche} worlds, reimagined`,
      description: `A concept ${content.toLowerCase()} exploring a fresh ${creator.niche.toLowerCase()} visual direction.`,
      contentType: content,
      tools,
      workflow: "Concept frames → image generation → motion pass → color and sound finish",
      format: "9:16",
      commercialUse: true,
      thumbnail: "",
    }];

    await query(
      `INSERT INTO creator_profiles (
        id, display_name, tagline, bio, location, niche, skills, tools,
        content_types, formats, followers, engagement, commercial_use,
        verified_tools, verified_workflows, verified_past_work, portfolio
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE,
        $8, $13, $14, $15::jsonb
      ) ON CONFLICT (id) DO NOTHING`,
      [
        creator.id,
        creator.name,
        `${creator.niche} AI creator · ${creator.city}`,
        `AI-native ${creator.niche.toLowerCase()} creator creating original visual stories for brands.`,
        creator.city,
        creator.niche,
        [creator.niche, content, "Generative storytelling"],
        tools,
        [content, "Social campaign"],
        ["9:16", "16:9", "1:1"],
        creator.followers,
        creator.engagement,
        creator.verified ? tools : [],
        creator.verified,
        JSON.stringify(portfolio),
      ]
    );
  }
}

module.exports = { pool, query, initializeDatabase };
