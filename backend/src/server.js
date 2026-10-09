
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");

const {
  creators = [],
  campaigns = [],
  activities = [],
  trending = [],
  monthlyPerformance = [],
} = require("./data");

const app = express();
const PORT = Number(process.env.PORT) || 5000;

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
    storage: "in-memory",
    uptimeSeconds: Math.round(process.uptime()),
  });
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

// Search and paginate creators
app.get("/api/creators", (req, res) => {
  const search = clean(req.query.search, 80).toLowerCase();
  const niche = clean(req.query.niche, 50).toLowerCase();
  const city = clean(req.query.city, 50).toLowerCase();

  const minFollowers = Math.max(0, num(req.query.minFollowers, 0));
  const maxFollowers = Math.max(
    0,
    num(req.query.maxFollowers, Number.MAX_SAFE_INTEGER)
  );

  const page = Math.max(1, Math.floor(num(req.query.page, 1)));
  const limit = Math.min(
    50,
    Math.max(1, Math.floor(num(req.query.limit, 10)))
  );

  if (minFollowers > maxFollowers) {
    return fail(res, 400, "minFollowers cannot exceed maxFollowers");
  }

  const result = creators.filter((creator) => {
    const searchableText = [
      creator.name,
      creator.niche,
      creator.city,
      creator.language,
    ]
      .map(lower)
      .join(" ");

    const followers = Math.max(0, num(creator.followers));

    return (
      (!search || searchableText.includes(search)) &&
      (!niche || lower(creator.niche) === niche) &&
      (!city || lower(creator.city) === city) &&
      followers >= minFollowers &&
      followers <= maxFollowers
    );
  });

  const total = result.length;
  const start = (page - 1) * limit;

  return ok(res, {
    items: result.slice(start, start + limit),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Get one creator
app.get("/api/creators/:id", (req, res) => {
  const creator = creators.find(
    (item) => String(item.id) === req.params.id
  );

  if (!creator) {
    return fail(res, 404, "Creator not found");
  }

  return ok(res, creator);
});

// AI creator matching
app.post("/api/ai/match", (req, res) => {
  const body = req.body || {};

  const minFollowers = Math.max(0, num(body.minFollowers, 0));
  const maxFollowers = Math.max(
    0,
    num(body.maxFollowers, Number.MAX_SAFE_INTEGER)
  );

  if (minFollowers > maxFollowers) {
    return fail(res, 400, "minFollowers cannot exceed maxFollowers");
  }

  const matches = creators
    .map((creator) => score(creator, body))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 10);

  return ok(
    res,
    {
      query: body,
      matches,
      totalMatches: creators.length,
    },
    "AI creator matching completed"
  );
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

// Start server
app.listen(PORT, () => {
  console.log(`CreatorHub AI backend running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log("Allowed frontend ports: 5173, 5174, 5175");
  console.log("Storage: in-memory; MongoDB is not required");
});

