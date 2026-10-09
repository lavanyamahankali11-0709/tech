
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool, query, initializeDatabase } = require("./db");

const {
  creators = [],
  campaigns = [],
  activities = [],
  trending = [],
  monthlyPerformance = [],
} = require("./data");

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters");
}

// Allow the frontend development ports, including 5175.
const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
]);

if (process.env.FRONTEND_URL) {
  allowedOrigins.add(process.env.FRONTEND_URL.replace(/\/$/, ""));
}

app.disable("x-powered-by");

app.use(helmet());
app.use(compression());

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests without an Origin header, such as local health checks.
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "50kb" }));

app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Helper functions
const clean = (value, max = 100) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const num = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
};

const lower = (value) => String(value ?? "").toLowerCase();

const ok = (res, data, message = "Success") =>
  res.json({ success: true, message, data });

const fail = (res, status, message) =>
  res.status(status).json({ success: false, message });

const profileFields = `
  id, owner_id AS "ownerId", display_name AS name, tagline, bio, location,
  niche, skills, tools, content_types AS "contentTypes", formats, followers,
  engagement, commercial_use AS "commercialUse", verified_tools AS "verifiedTools",
  verified_workflows AS "verifiedWorkflows", verified_past_work AS "verifiedPastWork",
  portfolio, created_at AS "createdAt"
`;

function createToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authenticate(req, res, next) {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!token) {
    return fail(res, 401, "Sign in to continue");
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError || error instanceof jwt.JsonWebTokenError) {
      return fail(res, 401, "Your session has expired. Please sign in again.");
    }
    return next(error);
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return fail(res, 403, `A ${role} account is required for this action`);
    }
    return next();
  };
}

function stringArray(value, maxItems = 12, maxLength = 60) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean))].slice(0, maxItems);
}

// Creator matching score
function score(creator, body = {}) {
  const niche = clean(body.niche, 50).toLowerCase();
  const city = clean(body.city, 50).toLowerCase();
  const language = clean(body.language, 50).toLowerCase();

  const followers = Math.max(0, num(creator.followers));
  const minFollowers = Math.max(0, num(body.minFollowers, 0));
  const maxFollowers = Math.max(
    0,
    num(body.maxFollowers, Number.MAX_SAFE_INTEGER)
  );

  let matchScore = 0;
  const reasons = [];

  if (niche && lower(creator.niche) === niche) {
    matchScore += 30;
    reasons.push("Niche matches");
  }

  if (
    minFollowers <= maxFollowers &&
    followers >= minFollowers &&
    followers <= maxFollowers
  ) {
    matchScore += 20;
    reasons.push("Follower range matches");
  }

  if (city && lower(creator.city) === city) {
    matchScore += 15;
    reasons.push("Location matches");
  }

  if (language && lower(creator.language) === language) {
    matchScore += 10;
    reasons.push("Language matches");
  }

  matchScore += Math.min(
    10,
    Math.max(0, Math.round(num(creator.engagement)))
  );

  matchScore += Math.min(
    10,
    Math.max(0, Math.round(num(creator.trustScore) / 10))
  );

  if (creator.verified) {
    matchScore += 5;
    reasons.push("Verified creator");
  }

  return {
    ...creator,
    matchScore: Math.min(100, matchScore),
    reasons,
  };
}

// Health check
app.get("/health", (req, res) => {
  return ok(res, {
    service: "CreatorHub AI Backend",
    status: "running",
    storage: "postgresql",
    uptimeSeconds: Math.round(process.uptime()),
  });
});

// Authentication
app.post("/api/auth/register", async (req, res, next) => {
  try {
    const name = clean(req.body?.name, 80);
    const email = clean(req.body?.email, 254).toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const role = req.body?.role;

    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail(res, 400, "Enter your name and a valid email address");
    }
    if (password.length < 8 || password.length > 128) {
      return fail(res, 400, "Password must be between 8 and 128 characters");
    }
    if (!["brand", "creator"].includes(role)) {
      return fail(res, 400, "Choose a brand or creator account");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role`,
      [name, email, passwordHash, role]
    );
    const user = result.rows[0];

    if (role === "creator") {
      await query(
        `INSERT INTO creator_profiles (id, owner_id, display_name, tagline, bio)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          `creator_${user.id}`,
          user.id,
          name,
          "AI creator · Complete your profile",
          "Add your tools, skills, workflows and portfolio to help brands discover your work.",
        ]
      );
    }

    return res.status(201).json({
      success: true,
      message: "Account created",
      data: { token: createToken(user), user },
    });
  } catch (error) {
    if (error.code === "23505") {
      return fail(res, 409, "An account with this email already exists");
    }
    return next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const email = clean(req.body?.email, 254).toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const result = await query(
      "SELECT id, name, email, role, password_hash FROM users WHERE email = $1",
      [email]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return fail(res, 401, "Email or password is incorrect");
    }

    delete user.password_hash;
    return ok(res, { token: createToken(user), user }, "Signed in");
  } catch (error) {
    return next(error);
  }
});

app.get("/api/auth/me", authenticate, async (req, res, next) => {
  try {
    const result = await query(
      "SELECT id, name, email, role, created_at AS \"createdAt\" FROM users WHERE id = $1",
      [req.user.sub]
    );
    if (!result.rows[0]) return fail(res, 404, "Account not found");
    return ok(res, result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

// Dashboard
app.get("/api/dashboard", (req, res) => {
  const topMatches = creators
    .map((creator) => ({
      ...creator,
      matchScore: Math.min(
        99,
        88 + (Math.max(0, num(creator.trustScore)) % 12)
      ),
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 4);

  return ok(res, {
    stats: {
      totalCreators: creators.length,
      activeCampaigns: campaigns.length,
      totalRevenue: 842000,
      matchSuccess: 94.8,
    },
    monthlyPerformance,
    topMatches,
    trending,
    recentActivity: activities.slice(0, 20),
  });
});

// Search creators by profile, AI tools, skills and content types
app.get("/api/creators", async (req, res, next) => {
  try {
    const search = clean(req.query.search, 80).toLowerCase();
    const niche = clean(req.query.niche, 50).toLowerCase();
    const skill = clean(req.query.skill, 60);
    const tool = clean(req.query.tool, 60);
    const contentType = clean(req.query.contentType, 60);
    const page = Math.max(1, Math.floor(num(req.query.page, 1)));
    const limit = Math.min(50, Math.max(1, Math.floor(num(req.query.limit, 24))));
    const result = await query(
      `SELECT ${profileFields} FROM creator_profiles
       WHERE ($1 = '' OR LOWER(display_name || ' ' || bio || ' ' || niche || ' ' || location) LIKE '%' || $1 || '%')
         AND ($2 = '' OR LOWER(niche) = $2)
         AND ($3 = '' OR skills @> ARRAY[$3]::text[])
         AND ($4 = '' OR tools @> ARRAY[$4]::text[])
         AND ($5 = '' OR content_types @> ARRAY[$5]::text[])
       ORDER BY verified_past_work DESC, verified_workflows DESC, engagement DESC, created_at DESC
       LIMIT $6 OFFSET $7`,
      [search, niche, skill, tool, contentType, limit, (page - 1) * limit]
    );
    const count = await query(
      `SELECT COUNT(*)::int AS total FROM creator_profiles
       WHERE ($1 = '' OR LOWER(display_name || ' ' || bio || ' ' || niche || ' ' || location) LIKE '%' || $1 || '%')
         AND ($2 = '' OR LOWER(niche) = $2)
         AND ($3 = '' OR skills @> ARRAY[$3]::text[])
         AND ($4 = '' OR tools @> ARRAY[$4]::text[])
         AND ($5 = '' OR content_types @> ARRAY[$5]::text[])`,
      [search, niche, skill, tool, contentType]
    );
    return ok(res, {
      items: result.rows,
      pagination: {
        page, limit, total: count.rows[0].total,
        totalPages: Math.ceil(count.rows[0].total / limit),
      },
    });
  } catch (error) {
    return next(error);
  }
});

// Get one creator
app.get("/api/creators/:id", async (req, res, next) => {
  try {
    const result = await query(
      `SELECT ${profileFields} FROM creator_profiles WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return fail(res, 404, "Creator not found");
    return ok(res, result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

app.put(
  "/api/creators/me",
  authenticate,
  requireRole("creator"),
  async (req, res, next) => {
    try {
      const body = req.body || {};
      const name = clean(body.name, 100);
      if (!name) return fail(res, 400, "Creator name is required");
      const portfolio = Array.isArray(body.portfolio)
        ? body.portfolio.slice(0, 20).map((item) => ({
            title: clean(item.title, 120),
            description: clean(item.description, 500),
            contentType: clean(item.contentType, 60),
            tools: stringArray(item.tools, 10),
            workflow: clean(item.workflow, 500),
            format: clean(item.format, 30),
            commercialUse: Boolean(item.commercialUse),
            thumbnail: clean(item.thumbnail, 1000),
          }))
        : [];
      const result = await query(
        `INSERT INTO creator_profiles (
          id, owner_id, display_name, tagline, bio, location, niche, skills,
          tools, content_types, formats, followers, engagement, commercial_use,
          verified_tools, verified_workflows, verified_past_work, portfolio,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18::jsonb, NOW()
        ) ON CONFLICT (owner_id) DO UPDATE SET
          display_name = EXCLUDED.display_name, tagline = EXCLUDED.tagline,
          bio = EXCLUDED.bio, location = EXCLUDED.location, niche = EXCLUDED.niche,
          skills = EXCLUDED.skills, tools = EXCLUDED.tools,
          content_types = EXCLUDED.content_types, formats = EXCLUDED.formats,
          followers = EXCLUDED.followers, engagement = EXCLUDED.engagement,
          commercial_use = EXCLUDED.commercial_use, portfolio = EXCLUDED.portfolio,
          updated_at = NOW()
        RETURNING ${profileFields}`,
        [
          `creator_${req.user.sub}`, req.user.sub, name, clean(body.tagline, 140),
          clean(body.bio, 2000), clean(body.location, 100), clean(body.niche, 60),
          stringArray(body.skills), stringArray(body.tools),
          stringArray(body.contentTypes), stringArray(body.formats),
          Math.max(0, Math.floor(num(body.followers))), Math.max(0, num(body.engagement)),
          Boolean(body.commercialUse), [],
          false, false,
          JSON.stringify(portfolio),
        ]
      );
      return ok(res, result.rows[0], "Creator profile saved");
    } catch (error) {
      return next(error);
    }
  }
);

app.get("/api/creators/me", authenticate, requireRole("creator"), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT ${profileFields} FROM creator_profiles WHERE owner_id = $1`,
      [req.user.sub]
    );
    return ok(res, result.rows[0] || null);
  } catch (error) {
    return next(error);
  }
});

// AI creator matching
app.post("/api/ai/match", async (req, res, next) => {
  try {
  const body = req.body || {};

  const minFollowers = Math.max(0, num(body.minFollowers, 0));
  const maxFollowers = Math.max(
    0,
    num(body.maxFollowers, Number.MAX_SAFE_INTEGER)
  );

  if (minFollowers > maxFollowers) {
    return fail(res, 400, "minFollowers cannot exceed maxFollowers");
  }

  const profiles = await query(`SELECT ${profileFields} FROM creator_profiles`);
  const matches = profiles.rows
    .map((creator) => score({
      ...creator,
      niche: creator.niche,
      city: creator.location,
      verified: creator.verifiedPastWork,
      trustScore: creator.verifiedPastWork ? 95 : 70,
    }, body))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 10);

  return ok(
    res,
    {
      query: body,
      matches,
      totalMatches: profiles.rows.length,
    },
    "AI creator matching completed"
  );
  } catch (error) {
    return next(error);
  }
});

// Public campaign briefs and brand brief creation
app.get("/api/briefs", async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, brand_name AS "brandName", title, description, content_type AS "contentType",
        style, formats, aspect_ratio AS "aspectRatio", budget, commercial_use AS "commercialUse",
        usage_terms AS "usageTerms", deadline, status, created_at AS "createdAt"
       FROM briefs
       WHERE ($1 = '' OR status = $1)
       ORDER BY created_at DESC LIMIT 100`,
      [clean(req.query.status, 20)]
    );
    return ok(res, result.rows);
  } catch (error) {
    return next(error);
  }
});

app.get("/api/briefs/mine", authenticate, requireRole("brand"), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT b.id, b.brand_name AS "brandName", b.title, b.description,
        b.content_type AS "contentType", b.style, b.formats,
        b.aspect_ratio AS "aspectRatio", b.budget,
        b.commercial_use AS "commercialUse", b.usage_terms AS "usageTerms",
        b.deadline, b.status, b.created_at AS "createdAt",
        COUNT(a.id)::int AS "applicationCount"
       FROM briefs b LEFT JOIN brief_applications a ON a.brief_id = b.id
       WHERE b.brand_id = $1
       GROUP BY b.id
       ORDER BY b.created_at DESC`,
      [req.user.sub]
    );
    return ok(res, result.rows);
  } catch (error) {
    return next(error);
  }
});

app.get("/api/briefs/applications/mine", authenticate, requireRole("creator"), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT a.id, a.brief_id AS "briefId", a.cover_note AS "coverNote",
        a.status, a.created_at AS "createdAt", b.title AS "briefTitle",
        b.brand_name AS "brandName"
       FROM brief_applications a
       JOIN creator_profiles p ON p.id = a.creator_id
       JOIN briefs b ON b.id = a.brief_id
       WHERE p.owner_id = $1
       ORDER BY a.created_at DESC`,
      [req.user.sub]
    );
    return ok(res, result.rows);
  } catch (error) {
    return next(error);
  }
});

app.post("/api/briefs/:id/applications", authenticate, requireRole("creator"), async (req, res, next) => {
  try {
    const coverNote = clean(req.body?.coverNote, 2000);
    if (coverNote.length < 30) {
      return fail(res, 400, "Tell the brand why you are a good fit (at least 30 characters)");
    }
    const result = await query(
      `INSERT INTO brief_applications (brief_id, creator_id, cover_note)
       SELECT b.id, p.id, $3 FROM briefs b
       JOIN creator_profiles p ON p.owner_id = $2
       WHERE b.id = $1 AND b.status = 'open'
       RETURNING id, brief_id AS "briefId", cover_note AS "coverNote",
         status, created_at AS "createdAt"`,
      [req.params.id, req.user.sub, coverNote]
    );
    if (!result.rows[0]) return fail(res, 404, "Open brief or creator profile not found");
    return res.status(201).json({ success: true, message: "Pitch sent to the brand", data: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return fail(res, 409, "You already applied to this brief");
    return next(error);
  }
});

app.get("/api/briefs/:id/applications", authenticate, requireRole("brand"), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT a.id, a.cover_note AS "coverNote", a.status,
        a.created_at AS "createdAt", p.id AS "creatorId",
        p.display_name AS "creatorName", p.niche, p.tools,
        p.portfolio, p.verified_tools AS "verifiedTools",
        p.verified_workflows AS "verifiedWorkflows",
        p.verified_past_work AS "verifiedPastWork"
       FROM brief_applications a
       JOIN briefs b ON b.id = a.brief_id
       JOIN creator_profiles p ON p.id = a.creator_id
       WHERE b.id = $1 AND b.brand_id = $2
       ORDER BY a.created_at DESC`,
      [req.params.id, req.user.sub]
    );
    const ownedBrief = await query(
      "SELECT 1 FROM briefs WHERE id = $1 AND brand_id = $2",
      [req.params.id, req.user.sub]
    );
    if (!ownedBrief.rowCount) return fail(res, 404, "Brief not found");
    return ok(res, result.rows);
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/briefs/:briefId/applications/:applicationId", authenticate, requireRole("brand"), async (req, res, next) => {
  try {
    const status = req.body?.status;
    if (!["shortlisted", "accepted", "declined", "completed"].includes(status)) {
      return fail(res, 400, "Choose shortlist, accept, decline, or complete this engagement");
    }
    const result = await query(
      `UPDATE brief_applications a SET status = $1, updated_at = NOW()
       WHERE a.id = $2 AND a.brief_id = $3
         AND EXISTS (SELECT 1 FROM briefs b WHERE b.id = a.brief_id AND b.brand_id = $4)
         AND ($1 <> 'completed' OR a.status = 'delivered')
       RETURNING a.id, a.status`,
      [status, req.params.applicationId, req.params.briefId, req.user.sub]
    );
    if (!result.rows[0]) return fail(res, 409, "Application not found or it must be delivered before completion");
    if (status === "accepted" || status === "completed") {
      await query(
        "UPDATE briefs SET status = $1 WHERE id = $2 AND brand_id = $3",
        [status === "completed" ? "completed" : "in_progress", req.params.briefId, req.user.sub]
      );
    }
    return ok(res, result.rows[0], `Application ${status}`);
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/brief-applications/:id/deliver", authenticate, requireRole("creator"), async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE brief_applications a SET status = 'delivered', updated_at = NOW()
       FROM creator_profiles p
       WHERE a.id = $1 AND a.creator_id = p.id AND p.owner_id = $2
         AND a.status = 'accepted'
       RETURNING a.id, a.status`,
      [req.params.id, req.user.sub]
    );
    if (!result.rows[0]) return fail(res, 409, "Only an accepted engagement can be marked delivered");
    return ok(res, result.rows[0], "Delivery submitted to the brand");
  } catch (error) {
    return next(error);
  }
});

app.post("/api/briefs", authenticate, requireRole("brand"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const title = clean(body.title, 120);
    const description = clean(body.description, 4000);
    const contentType = clean(body.contentType, 60);
    const style = clean(body.style, 100);
    const aspectRatio = clean(body.aspectRatio, 20);
    const formats = stringArray(body.formats, 8, 30);
    const budget = num(body.budget, 0);
    if (!title || !description || !contentType || !style || !aspectRatio) {
      return fail(res, 400, "Title, description, content type, style and aspect ratio are required");
    }
    if (
      body.budget !== undefined &&
      body.budget !== "" &&
      (!Number.isFinite(Number(body.budget)) || Number(body.budget) < 0)
    ) {
      return fail(res, 400, "Budget must be a valid non-negative amount");
    }
    if (body.deadline) {
      const deadline = new Date(`${body.deadline}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.deadline) || Number.isNaN(deadline.getTime()) || deadline.toISOString().slice(0, 10) !== body.deadline) {
        return fail(res, 400, "Deadline must be a valid date in YYYY-MM-DD format");
      }
    }
    const result = await query(
      `INSERT INTO briefs (
        brand_id, title, brand_name, description, content_type, style, formats,
        aspect_ratio, budget, commercial_use, usage_terms, deadline
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, brand_name AS "brandName", title, description,
        content_type AS "contentType", style, formats,
        aspect_ratio AS "aspectRatio", budget,
        commercial_use AS "commercialUse", usage_terms AS "usageTerms",
        deadline, status, created_at AS "createdAt"`,
      [
        req.user.sub, title, req.user.name, description, contentType, style,
        formats, aspectRatio, budget, Boolean(body.commercialUse),
        clean(body.usageTerms, 1000), body.deadline || null,
      ]
    );
    return res.status(201).json({
      success: true, message: "Creative brief published", data: result.rows[0],
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/ai/brief-builder", (req, res) => {
  const roughIdea = clean(req.body?.roughIdea, 1000);
  if (roughIdea.length < 10) {
    return fail(res, 400, "Describe your campaign idea in at least 10 characters");
  }

  const lowerIdea = roughIdea.toLowerCase();
  const contentType = /animat|motion|film|video|reel/.test(lowerIdea)
    ? "AI film"
    : /image|photo|poster|graphic|illustrat/.test(lowerIdea)
      ? "Generative images"
      : "Social campaign";
  const aspectRatio = /youtube|landscape|wide/.test(lowerIdea) ? "16:9" : "9:16";
  const subject = roughIdea.replace(/[.!?]+$/, "");

  return ok(res, {
    title: subject.length > 72 ? `${subject.slice(0, 69)}...` : subject,
    description: `${subject}. Create original, brand-safe work with a clear visual hook and a polished final delivery. Include concept development, generation workflow, and one revision round.`,
    contentType,
    style: "Distinctive, polished, and on-brand",
    formats: ["MP4", "Social cutdown"],
    aspectRatio,
    commercialUse: true,
    usageTerms: "Commercial use in owned digital channels for 12 months; creator retains portfolio rights.",
    assistanceNote: "Draft generated from your idea. Review and edit all licensing and delivery terms before publishing.",
  }, "Brief draft created");
});

// List campaigns
app.get("/api/campaigns", (req, res) => {
  return ok(res, campaigns);
});

// Create campaign
app.post("/api/campaigns", (req, res) => {
  const name = clean(req.body?.name, 100);

  if (!name) {
    return fail(res, 400, "Campaign name is required");
  }

  const budget = num(req.body?.budget, 0);

  if (budget < 0) {
    return fail(res, 400, "Budget cannot be negative");
  }

  const campaign = {
    id: `cam_${Date.now()}`,
    name,
    status: "draft",
    budget,
    creators: 0,
    reach: 0,
    createdAt: new Date().toISOString().slice(0, 10),
  };

  campaigns.unshift(campaign);

  activities.unshift({
    id: `act_${Date.now()}`,
    type: "campaign",
    message: "New campaign created",
    detail: name,
    time: "just now",
  });

  return res.status(201).json({
    success: true,
    message: "Campaign created",
    data: campaign,
  });
});

// Get one campaign
app.get("/api/campaigns/:id", (req, res) => {
  const campaign = campaigns.find(
    (item) => String(item.id) === req.params.id
  );

  if (!campaign) {
    return fail(res, 404, "Campaign not found");
  }

  return ok(res, campaign);
});

// Generate sample AI content
app.post("/api/ai/content", (req, res) => {
  const topic = clean(req.body?.topic, 200);
  const platform = clean(req.body?.platform, 40) || "Instagram";
  const tone = clean(req.body?.tone, 40) || "friendly";

  if (!topic) {
    return fail(res, 400, "Topic is required");
  }

  return ok(
    res,
    {
      platform,
      tone,
      hook: `Stop scrolling! Here's what you need to know about ${topic}.`,
      script: `Create a short ${platform} video about ${topic}. Start with a strong hook, explain the main benefit, show an example, and finish with a clear call to action.`,
      caption: `Discover ${topic} in a simple and useful way. Save this post and share it with someone who needs it.`,
      hashtags: ["#CreatorHub", "#ContentCreator", "#Trending"],
      cta: "Learn more and get started today.",
    },
    "AI content generated"
  );
});

// Sample performance prediction
app.post("/api/ai/performance", (req, res) => {
  const body = req.body || {};

  const content = [
    clean(body.title, 2000),
    clean(body.caption, 5000),
    clean(body.hook, 2000),
  ]
    .filter(Boolean)
    .join(" ");

  if (!content) {
    return fail(res, 400, "Provide title, caption, or hook");
  }

  const contentScore = Math.min(
    98,
    Math.round(
      (content.length >= 50 ? 90 : 72) * 0.35 +
        86 * 0.25 +
        88 * 0.2 +
        84 * 0.2
    )
  );

  return ok(
    res,
    {
      contentScore,
      hook: 92,
      audienceRelevance: 86,
      cta: 78,
      emotionalAppeal: 88,
      brandAlignment: 91,
      suggestion:
        "Use a stronger call-to-action such as Learn More or Shop Today.",
    },
    "Performance prediction completed"
  );
});

// Messages
app.get("/api/messages", (req, res) => {
  return ok(res, [
    {
      id: "msg_001",
      from: "Ananya Kapoor",
      subject: "Campaign collaboration",
      unread: true,
      time: "10m ago",
    },
    {
      id: "msg_002",
      from: "Rahul Sharma",
      subject: "Tech campaign proposal",
      unread: false,
      time: "1h ago",
    },
    {
      id: "msg_003",
      from: "Priya Singh",
      subject: "Content approval",
      unread: false,
      time: "3h ago",
    },
  ]);
});

// Payments
app.get("/api/payments", (req, res) => {
  return ok(res, {
    totalPaid: 45000,
    pending: 12000,
    transactions: [
      {
        id: "pay_001",
        creator: "Priya Singh",
        amount: 45000,
        status: "completed",
        date: "2026-10-08",
      },
      {
        id: "pay_002",
        creator: "Rahul Sharma",
        amount: 12000,
        status: "pending",
        date: "2026-10-08",
      },
    ],
  });
});

// Unknown API endpoint
app.use("/api", (req, res) => {
  return fail(res, 404, "API endpoint not found");
});

// Error handler
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  console.error("Backend error:", err.message);

  if (err.message === "Origin not allowed by CORS") {
    return fail(res, 403, "Frontend origin is not allowed");
  }

  if (err.type === "entity.parse.failed") {
    return fail(res, 400, "Invalid JSON");
  }

  if (err.type === "entity.too.large") {
    return fail(res, 413, "Request body is too large");
  }

  return fail(res, 500, "Internal server error");
});

// Initialize persistent storage before accepting requests.
initializeDatabase()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`CreatorHub AI backend running on port ${PORT}`);
      console.log(`Health check: /health`);
      console.log("Storage: PostgreSQL");
    });

    for (const signal of ["SIGINT", "SIGTERM"]) {
      process.on(signal, () => {
        server.close(() => {
          pool.end().then(() => process.exit(0));
        });
      });
    }
  })
  .catch(async (error) => {
    console.error("Backend startup failed:", error.message);
    await pool.end();
    process.exit(1);
  });
