import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const EMPTY_BRIEF = {
  title: "",
  description: "",
  contentType: "AI film",
  style: "",
  formats: ["MP4"],
  aspectRatio: "9:16",
  budget: "",
  commercialUse: true,
  usageTerms: "Commercial use in owned digital channels for 12 months; creator retains portfolio rights.",
  deadline: "",
};

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("creatorhub-user") || "null");
  } catch {
    return null;
  }

  async function loadMyBriefs() {
    const data = await api("/api/briefs/mine");
    setMyBriefs(data || []);
  }

  async function loadApplicants(briefId) {
    try {
      const data = await api(`/api/briefs/${briefId}/applications`);
      setBriefApplicants((current) => ({ ...current, [briefId]: data || [] }));
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function updateApplication(briefId, applicationId, status) {
    try {
      await api(`/api/briefs/${briefId}/applications/${applicationId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadApplicants(briefId);
      await Promise.all([loadBriefs(), loadMyBriefs()]);
      setNotice(status === "accepted" ? "Creator accepted. The engagement is now in progress." : `Application ${status}.`);
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function applyToBrief(event) {
    event.preventDefault();
    if (!applicationBrief) return;
    try {
      await api(`/api/briefs/${applicationBrief.id}/applications`, {
        method: "POST",
        body: JSON.stringify({ coverNote }),
      });
      const applications = await api("/api/briefs/applications/mine");
      setMyApplications(applications);
      setApplicationBrief(null);
      setCoverNote("");
      setNotice("Your pitch has been sent to the brand.");
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function markDelivered(applicationId) {
    try {
      await api(`/api/brief-applications/${applicationId}/deliver`, { method: "PATCH" });
      setMyApplications(await api("/api/briefs/applications/mine"));
      setNotice("Delivery marked as submitted. The brand can now review and complete the engagement.");
    } catch (error) {
      setNotice(error.message);
    }
  }
}

function initials(name = "Creator") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("creatorhub-token") || "");
  const [user, setUser] = useState(readStoredUser);
  const [creators, setCreators] = useState([]);
  const [briefs, setBriefs] = useState([]);
  const [myBriefs, setMyBriefs] = useState([]);
  const [myApplications, setMyApplications] = useState([]);
  const [briefApplicants, setBriefApplicants] = useState({});
  const [applicationBrief, setApplicationBrief] = useState(null);
  const [coverNote, setCoverNote] = useState("");
  const [page, setPage] = useState("Dashboard");
  const [query, setQuery] = useState("");
  const [toolFilter, setToolFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [notice, setNotice] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("register");
  const [authRole, setAuthRole] = useState("brand");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authBusy, setAuthBusy] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefForm, setBriefForm] = useState(EMPTY_BRIEF);
  const [roughIdea, setRoughIdea] = useState("");
  const [briefBusy, setBriefBusy] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState(null);
  const [profileBusy, setProfileBusy] = useState(false);

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    const result = await response.json();
    if (!response.ok || result.success === false) {
      throw new Error(result.message || `Request failed (${response.status})`);
    }
    return result.data;
  }

  async function loadCreators(filters = {}) {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.tool) params.set("tool", filters.tool);
    if (filters.contentType) params.set("contentType", filters.contentType);
    const data = await api(`/api/creators?${params}`);
    setCreators(data.items || []);
  }

  async function loadBriefs() {
    const data = await api("/api/briefs");
    setBriefs(data || []);
  }

  useEffect(() => {
    Promise.all([loadCreators(), loadBriefs()]).catch((error) => setNotice(error.message));
  }, []);

  useEffect(() => {
    if (!token || !user) {
      setProfile(null);
      setProfileForm(null);
      setMyBriefs([]);
      setMyApplications([]);
      return;
    }
    if (user.role === "brand") {
      api("/api/briefs/mine")
        .then(setMyBriefs)
        .catch((error) => setNotice(error.message));
      setProfile(null);
      setProfileForm(null);
      setMyApplications([]);
      return;
    }
    api("/api/creators/me")
      .then((data) => {
        setProfile(data);
        setProfileForm(data || {
          name: user.name,
          tagline: "",
          bio: "",
          location: "",
          niche: "",
          skills: [],
          tools: [],
          contentTypes: [],
          formats: [],
          followers: 0,
          engagement: 0,
          commercialUse: false,
          portfolio: [],
        });
      })
      .catch((error) => setNotice(error.message));
    api("/api/briefs/applications/mine")
      .then(setMyApplications)
      .catch((error) => setNotice(error.message));
  }, [token, user]);

  const openAuth = (mode = "register") => {
    setAuthMode(mode);
    setNotice("");
    setAuthOpen(true);
  };

  const openBrief = () => {
    if (!user) {
      setNotice("Create a free brand account to publish your creative brief.");
      openAuth("register");
      setAuthRole("brand");
      return;
    }
    if (user.role !== "brand") {
      setNotice("Sign in with a brand account to publish a brief.");
      return;
    }
    setBriefForm(EMPTY_BRIEF);
    setRoughIdea("");
    setBriefOpen(true);
  };

  async function submitAuth(event) {
    event.preventDefault();
    setAuthBusy(true);
    setNotice("");
    try {
      const data = await api(`/api/auth/${authMode}`, {
        method: "POST",
        body: JSON.stringify({
          ...authForm,
          role: authRole,
        }),
      });
      localStorage.setItem("creatorhub-token", data.token);
      localStorage.setItem("creatorhub-user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setAuthOpen(false);
      setNotice(`Welcome${authMode === "register" ? " to CreatorHub" : " back"}, ${data.user.name}.`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setAuthBusy(false);
    }
  }

  function signOut() {
    localStorage.removeItem("creatorhub-token");
    localStorage.removeItem("creatorhub-user");
    setToken("");
    setUser(null);
    setPage("Dashboard");
    setNotice("You have been signed out.");
  }

  async function searchCreators(event) {
    event?.preventDefault();
    setNotice("");
    try {
      await loadCreators({ search: query.trim(), tool: toolFilter, contentType: typeFilter });
      setPage("Creators");
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function submitBrief(event) {
    event.preventDefault();
    setBriefBusy(true);
    try {
      await api("/api/briefs", { method: "POST", body: JSON.stringify(briefForm) });
      await loadBriefs();
      await loadMyBriefs();
      setBriefOpen(false);
      setPage("Briefs");
      setNotice("Your brief is live and ready for creators to discover.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBriefBusy(false);
    }
  }

  async function draftBrief() {
    setBriefBusy(true);
    try {
      const draft = await api("/api/ai/brief-builder", {
        method: "POST",
        body: JSON.stringify({ roughIdea }),
      });
      setBriefForm((current) => ({ ...current, ...draft }));
      setNotice("AI draft added. Review and adjust the scope and licensing before publishing.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBriefBusy(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setProfileBusy(true);
    try {
      const data = await api("/api/creators/me", {
        method: "PUT",
        body: JSON.stringify(profileForm),
      });
      setProfile(data);
      setProfileForm(data);
      await loadCreators();
      setNotice("Your creator profile and portfolio are saved.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setProfileBusy(false);
    }
  }

  const featuredCreators = useMemo(() => creators.slice(0, 3), [creators]);

  return (
    <div className="market-app">
      <aside className="market-sidebar">
        <a className="brand-mark" href="#" onClick={(event) => { event.preventDefault(); setPage("Dashboard"); }}>
          <span className="brand-glyph">✦</span><span>creator<span className="brand-light">hub</span></span>
        </a>
        <div className="side-caption">WORKSPACE</div>
        <nav className="market-nav" aria-label="Main navigation">
          {[
            ["Dashboard", "⌂"],
            ["Creators", "✳"],
            ["Briefs", "▤"],
            ...(user?.role === "brand" ? [["My briefs", "▧"]] : []),
            ...(user?.role === "creator" ? [["My engagements", "⇄"]] : []),
            ...(user?.role === "creator" ? [["My profile", "◉"]] : []),
          ].map(([label, icon]) => (
            <button key={label} className={`market-nav-item ${page === label ? "selected" : ""}`} onClick={() => setPage(label)}>
              <span>{icon}</span>{label}
              {label === "Briefs" && briefs.length > 0 && <small>{briefs.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-spark">✦</span>
          <strong>Made for the new creative era</strong>
          <p>Human imagination. Generative possibility.</p>
        </div>
        <div className="sidebar-bottom">
          <span className="online-dot" /> All systems operational
        </div>
      </aside>

      <main className="market-main">
        <header className="market-header">
          <div className="breadcrumb">CREATOR MARKETPLACE <span>/</span> {page.toUpperCase()}</div>
          <div className="header-actions">
            <button className="quiet-button" onClick={() => setPage("Briefs")}>Explore briefs</button>
            {user ? (
              <div className="account-chip">
                <span className="account-avatar">{initials(user.name)}</span>
                <span className="account-name"><strong>{user.name}</strong><small>{user.role === "brand" ? "Brand / Agency" : "AI Creator"}</small></span>
                <button className="signout-button" onClick={signOut}>Sign out</button>
              </div>
            ) : (
              <>
                <button className="quiet-button" onClick={() => openAuth("login")}>Log in</button>
                <button className="primary-button small-primary" onClick={() => openAuth("register")}>Join free <span>↗</span></button>
              </>
            )}
          </div>
        </header>

        {notice && <div className="notice-banner" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}

        {page === "Dashboard" && (
          <section className="page-content">
            <div className="welcome-row">
              <div>
                <div className="eyebrow"><span className="eyebrow-line" /> THE GENERATIVE CREATOR ECONOMY</div>
                <h1>Ideas meet <span className="gradient-text">imagination.</span></h1>
                <p className="page-intro">Discover AI-native talent, shape bold creative briefs, and bring the next generation of content to life.</p>
              </div>
              <div className="welcome-actions">
                <button className="primary-button" onClick={openBrief}>Post a creative brief <span>↗</span></button>
                <button className="secondary-button" onClick={() => setPage("Creators")}>Explore creators <span>→</span></button>
              </div>
            </div>

            <form className="discovery-bar" onSubmit={searchCreators}>
              <span className="search-icon">⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search creators" placeholder="Try “AI filmmaker”, “Runway”, or “product animation”" />
              <button type="submit">Find your creator <span>→</span></button>
            </form>

            <div className="quick-tags"><span>POPULAR:</span>{["AI filmmakers", "Runway", "Product visuals", "ComfyUI workflows"].map((tag) => <button key={tag} onClick={() => { setQuery(tag); loadCreators({ search: tag }).then(() => setPage("Creators")).catch((error) => setNotice(error.message)); }}>{tag}</button>)}</div>

            <div className="section-heading">
              <div><span className="section-kicker">CURATED FOR YOU</span><h2>Meet the creators</h2></div>
              <button className="text-link" onClick={() => setPage("Creators")}>Browse all creators <span>↗</span></button>
            </div>
            <div className="creator-grid">
              {featuredCreators.map((creator, index) => <CreatorCard key={creator.id} creator={creator} index={index} />)}
              {featuredCreators.length === 0 && <EmptyState title="Your creator community starts here" body="Be the first to build an AI-native creator profile." action="Join as a creator" onAction={() => { setAuthRole("creator"); openAuth("register"); }} />}
            </div>

            <div className="lower-grid">
              <div className="brief-feature">
                <div className="brief-feature-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><span>✳</span><small>STUDIO / 01</small></div>
                <div className="brief-feature-copy"><span className="section-kicker">HAVE A BIG IDEA?</span><h2>Start with a brief.<br />End with something <em>unreal.</em></h2><p>Define the vision, format and usage rights. Find the right creative partner to make it happen.</p><button className="dark-link" onClick={openBrief}>Build your creative brief <span>↗</span></button></div>
              </div>
              <div className="trust-panel">
                <span className="section-kicker">BUILT ON TRUST</span><h2>Creative confidence, by design.</h2>
                <div className="trust-row"><span className="trust-icon">✓</span><div><strong>Tool transparency</strong><p>See the models and tools behind every work.</p></div></div>
                <div className="trust-row"><span className="trust-icon">⌁</span><div><strong>Workflow context</strong><p>Understand how each creator brings ideas to life.</p></div></div>
                <div className="trust-row"><span className="trust-icon">©</span><div><strong>Rights, upfront</strong><p>Commercial-use expectations are clear from day one.</p></div></div>
              </div>
            </div>
          </section>
        )}

        {page === "My briefs" && user?.role === "brand" && (
          <section className="page-content">
            <div className="page-title-row"><div><div className="eyebrow"><span className="eyebrow-line" /> BRAND STUDIO</div><h1>Your briefs, <span className="gradient-text">your next collaboration.</span></h1><p className="page-intro">Review creator pitches, shortlist talent, and track accepted work through delivery.</p></div><button className="primary-button" onClick={openBrief}>+ Post a brief</button></div>
            <div className="brief-list">{myBriefs.map((brief) => <article className="brief-card" key={brief.id}><div className="brief-card-top"><span className="brief-type">{brief.contentType}</span><span className="brief-status">{brief.status}</span></div><h2>{brief.title}</h2><p>{brief.description}</p><div className="brief-specs"><span>▣ {brief.aspectRatio}</span><span>▤ {(brief.formats || []).join(", ")}</span><span>{brief.applicationCount} pitches</span></div><button className="pitch-button" onClick={() => loadApplicants(brief.id)}>Review creator pitches ↗</button>{briefApplicants[brief.id] && <div className="applicant-list">{briefApplicants[brief.id].length ? briefApplicants[brief.id].map((application) => <div className="applicant-row" key={application.id}><div><strong>{application.creatorName}</strong><small>{application.niche} · {(application.tools || []).join(", ")}</small><p>{application.coverNote}</p><span className="application-status">Status · <b>{application.status}</b></span></div><div className="applicant-actions">{application.status === "applied" && <button onClick={() => updateApplication(brief.id, application.id, "shortlisted")}>Shortlist</button>}{["applied", "shortlisted"].includes(application.status) && <><button onClick={() => updateApplication(brief.id, application.id, "accepted")}>Accept</button><button onClick={() => updateApplication(brief.id, application.id, "declined")}>Decline</button></>}{application.status === "delivered" && <button onClick={() => updateApplication(brief.id, application.id, "completed")}>Approve delivery</button>}</div></div>) : <p className="no-applicants">No pitches yet. Keep this brief open to meet creators.</p>}</div>}</article>)}{myBriefs.length === 0 && <EmptyState title="Your first brief starts a collaboration." body="Publish a clear creative brief and invite AI-native creators to pitch." action="Create a brief" onAction={openBrief} />}</div>
          </section>
        )}

        {page === "My engagements" && user?.role === "creator" && (
          <section className="page-content">
            <div className="eyebrow"><span className="eyebrow-line" /> CREATOR STUDIO</div><h1>Ideas in <span className="gradient-text">progress.</span></h1><p className="page-intro">Track your pitches and accepted work from first hello through delivery.</p>
            <div className="brief-list engagement-list">{myApplications.map((application) => <article className="brief-card" key={application.id}><div className="brief-card-top"><span className="brief-type">{application.brandName}</span><span className="brief-status">{application.status}</span></div><h2>{application.briefTitle}</h2><p>{application.coverNote}</p>{application.status === "accepted" && <button className="pitch-button" onClick={() => markDelivered(application.id)}>Mark work delivered ↗</button>}{application.status === "delivered" && <div className="application-status">Delivery submitted · awaiting brand approval</div>}</article>)}{myApplications.length === 0 && <EmptyState title="Your next collaboration is out there." body="Explore open creative briefs and send a pitch that shows why you are the right fit." action="Browse open briefs" onAction={() => setPage("Briefs")} />}</div>
          </section>
        )}

        {page === "Creators" && (
          <section className="page-content">
            <div className="page-title-row"><div><div className="eyebrow"><span className="eyebrow-line" /> DISCOVERY</div><h1>Find your <span className="gradient-text">creative partner.</span></h1><p className="page-intro">Search by craft, tools, and content format—not just follower count.</p></div><div className="creator-total">{creators.length}<span> creators</span></div></div>
            <form className="filter-panel" onSubmit={searchCreators}>
              <label className="filter-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, skill, specialty, location..." /></label>
              <select aria-label="Filter by tool" value={toolFilter} onChange={(event) => setToolFilter(event.target.value)}><option value="">All AI tools</option><option>Midjourney</option><option>Runway</option><option>ComfyUI</option><option>Blender</option><option>Sora</option></select>
              <select aria-label="Filter by content type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">All content types</option><option>AI film</option><option>Animation</option><option>Generative images</option><option>Short-form video</option><option>Social campaign</option></select>
              <button className="primary-button" type="submit">Apply filters</button>
              <button type="button" className="reset-button" onClick={() => { setQuery(""); setToolFilter(""); setTypeFilter(""); loadCreators().catch((error) => setNotice(error.message)); }}>Reset</button>
            </form>
            <div className="section-heading compact-heading"><div><span className="section-kicker">AI-NATIVE TALENT</span><h2>{creators.length} creators to explore</h2></div><span className="verified-legend"><i>✓</i> Trust signals shown on profiles</span></div>
            <div className="creator-grid discovery-grid">{creators.map((creator, index) => <CreatorCard key={creator.id} creator={creator} index={index} />)}</div>
            {creators.length === 0 && <EmptyState title="No creators found—yet." body="Try a different tool, skill, or content type. Clear the filters to see every creator." action="Clear filters" onAction={() => { setQuery(""); setToolFilter(""); setTypeFilter(""); loadCreators().catch((error) => setNotice(error.message)); }} />}
          </section>
        )}

        {page === "Briefs" && (
          <section className="page-content">
            <div className="page-title-row"><div><div className="eyebrow"><span className="eyebrow-line" /> OPEN CALLS</div><h1>Creative work, <span className="gradient-text">in motion.</span></h1><p className="page-intro">Explore real campaign opportunities with clear formats, budgets, and usage terms.</p></div><button className="primary-button" onClick={openBrief}>+ Post a brief</button></div>
            <div className="brief-list">
              {briefs.map((brief) => {
                const application = myApplications.find((item) => item.briefId === brief.id);
                return <article className="brief-card" key={brief.id}><div className="brief-card-top"><span className="brief-type">{brief.contentType}</span><span className="brief-status">{brief.status}</span></div><h2>{brief.title}</h2><p>{brief.description}</p><div className="brief-specs"><span>◉ {brief.brandName}</span><span>▣ {brief.aspectRatio}</span><span>▤ {(brief.formats || []).join(", ") || "Flexible format"}</span><span>{brief.budget ? `₹${Number(brief.budget).toLocaleString("en-IN")} budget` : "Budget open"}</span></div><div className="brief-card-bottom"><span className="rights-pill">{brief.commercialUse ? "© Commercial rights included" : "© Rights negotiable"}</span><span>{brief.style}</span></div>{user?.role === "creator" && (application ? <div className="application-status">Your pitch · <strong>{application.status}</strong></div> : <button className="pitch-button" onClick={() => { setApplicationBrief(brief); setCoverNote(""); }}>Pitch for this brief ↗</button>)}{!user && <button className="pitch-button" onClick={() => { setAuthRole("creator"); openAuth("register"); }}>Join as a creator to pitch ↗</button>}</article>;
              })}
              {briefs.length === 0 && <EmptyState title="The next brief could be yours." body="Brands can post a structured creative brief. Creators can browse the work and connect." action="Create a brand account" onAction={() => { setAuthRole("brand"); openAuth("register"); }} />}
            </div>
          </section>
        )}

        {page === "My profile" && user?.role === "creator" && profileForm && (
          <section className="page-content profile-page">
            <div className="eyebrow"><span className="eyebrow-line" /> CREATOR STUDIO</div><h1>Your craft, <span className="gradient-text">your profile.</span></h1><p className="page-intro">Show brands how you create: skills, tools, workflows, portfolio, and rights.</p>
            <form className="profile-form" onSubmit={saveProfile}>
              <div className="form-section-title"><span>01</span><div><h2>Creator identity</h2><p>Tell the community what makes your creative practice distinct.</p></div></div>
              <div className="form-grid"><Field label="Display name" value={profileForm.name} onChange={(value) => setProfileForm({ ...profileForm, name: value })} required /><Field label="Specialization" value={profileForm.niche} onChange={(value) => setProfileForm({ ...profileForm, niche: value })} placeholder="e.g. AI filmmaking" /><Field label="Location" value={profileForm.location} onChange={(value) => setProfileForm({ ...profileForm, location: value })} placeholder="City, country" /><Field label="Tagline" value={profileForm.tagline} onChange={(value) => setProfileForm({ ...profileForm, tagline: value })} placeholder="One line that captures your work" /></div>
              <label className="field-label">About your work<textarea rows="3" value={profileForm.bio || ""} onChange={(event) => setProfileForm({ ...profileForm, bio: event.target.value })} placeholder="Describe your style, process, and the kind of projects you love." /></label>
              <div className="form-grid"><ArrayField label="Skills" value={profileForm.skills} onChange={(value) => setProfileForm({ ...profileForm, skills: value })} placeholder="AI filmmaking, compositing, art direction" /><ArrayField label="Tools & models" value={profileForm.tools} onChange={(value) => setProfileForm({ ...profileForm, tools: value })} placeholder="Runway, Midjourney, ComfyUI" /><ArrayField label="Content types" value={profileForm.contentTypes} onChange={(value) => setProfileForm({ ...profileForm, contentTypes: value })} placeholder="AI film, animation, generative images" /><ArrayField label="Delivery formats" value={profileForm.formats} onChange={(value) => setProfileForm({ ...profileForm, formats: value })} placeholder="9:16, 16:9, 1:1" /></div>
              <div className="form-grid"><Field label="Audience size" type="number" value={profileForm.followers || 0} onChange={(value) => setProfileForm({ ...profileForm, followers: Number(value) })} /><Field label="Engagement rate (%)" type="number" value={profileForm.engagement || 0} onChange={(value) => setProfileForm({ ...profileForm, engagement: Number(value) })} /></div>
              <label className="check-row"><input type="checkbox" checked={Boolean(profileForm.commercialUse)} onChange={(event) => setProfileForm({ ...profileForm, commercialUse: event.target.checked })} /><span>I can license work for commercial use</span></label>
              <p className="verification-note">Tool, workflow, and portfolio verification indicators are reserved for platform review; account holders cannot self-verify.</p>
              <div className="form-section-title portfolio-title"><span>02</span><div><h2>Featured portfolio work</h2><p>Share the tools, workflow, format and licensing context.</p></div></div>
              <PortfolioEditor portfolio={profileForm.portfolio || []} onChange={(portfolio) => setProfileForm({ ...profileForm, portfolio })} />
              <button className="primary-button" type="submit" disabled={profileBusy}>{profileBusy ? "Saving..." : "Save creator profile"} <span>↗</span></button>
            </form>
          </section>
        )}

        <footer className="market-footer"><span>✦ CREATORHUB</span><span>Where generative talent meets ambitious ideas.</span><span>PROFILE · BRIEF · CREATE</span></footer>
      </main>

      {authOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false); }}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-heading"><button className="modal-close" onClick={() => setAuthOpen(false)} aria-label="Close">×</button><div className="modal-mark">✦</div><div className="eyebrow"><span className="eyebrow-line" /> YOUR NEXT CHAPTER</div><h2 id="auth-heading">{authMode === "register" ? "Make something matter." : "Welcome back."}</h2><p>Join the creative community building what comes next.</p><div className="auth-tabs"><button className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>Create account</button><button className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Log in</button></div><form onSubmit={submitAuth}>{authMode === "register" && <Field label="Your name" value={authForm.name} onChange={(name) => setAuthForm({ ...authForm, name })} required />}<Field label="Email address" type="email" value={authForm.email} onChange={(email) => setAuthForm({ ...authForm, email })} required /><Field label="Password" type="password" value={authForm.password} onChange={(password) => setAuthForm({ ...authForm, password })} required minLength={8} /><label className="field-label">I’m joining as<select value={authRole} onChange={(event) => setAuthRole(event.target.value)}><option value="brand">Brand or creative agency</option><option value="creator">AI creator</option></select></label><button className="primary-button full-button" disabled={authBusy}>{authBusy ? "Please wait..." : authMode === "register" ? "Create your account" : "Log in"} <span>↗</span></button></form><small className="privacy-note">Your password is encrypted. By joining, you agree to use CreatorHub respectfully.</small></section></div>}

      {briefOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setBriefOpen(false); }}><section className="brief-modal" role="dialog" aria-modal="true" aria-labelledby="brief-heading"><button className="modal-close" onClick={() => setBriefOpen(false)} aria-label="Close">×</button><div className="eyebrow"><span className="eyebrow-line" /> THE CREATIVE BRIEF</div><h2 id="brief-heading">Give your idea a shape.</h2><p>Specific briefs attract the right creative minds. You can edit every detail before publishing.</p><div className="ai-draft-box"><label className="field-label">Start with a rough idea<textarea rows="2" value={roughIdea} onChange={(event) => setRoughIdea(event.target.value)} placeholder="e.g. A surreal launch film for our new sustainable sneaker line" /></label><button className="secondary-button" onClick={draftBrief} disabled={briefBusy || roughIdea.length < 10}>✦ Shape my idea</button><small>AI-assisted draft · review rights and details before posting</small></div><form className="brief-form" onSubmit={submitBrief}><Field label="Brief title" value={briefForm.title} onChange={(value) => setBriefForm({ ...briefForm, title: value })} required /><label className="field-label">Creative direction<textarea rows="3" value={briefForm.description} onChange={(event) => setBriefForm({ ...briefForm, description: event.target.value })} required placeholder="What are you making? Who is it for? What should it make people feel?" /></label><div className="form-grid"><label className="field-label">Content type<select value={briefForm.contentType} onChange={(event) => setBriefForm({ ...briefForm, contentType: event.target.value })}><option>AI film</option><option>Generative images</option><option>Animation</option><option>Social campaign</option><option>Product visualization</option><option>Other</option></select></label><Field label="Visual style" value={briefForm.style} onChange={(value) => setBriefForm({ ...briefForm, style: value })} required placeholder="e.g. Dreamlike, cinematic, warm" /><label className="field-label">Aspect ratio<select value={briefForm.aspectRatio} onChange={(event) => setBriefForm({ ...briefForm, aspectRatio: event.target.value })}><option>9:16</option><option>16:9</option><option>1:1</option><option>4:5</option><option>Flexible</option></select></label><ArrayField label="Delivery formats" value={briefForm.formats} onChange={(value) => setBriefForm({ ...briefForm, formats: value })} placeholder="MP4, 4K, social cutdown" /><Field label="Budget (INR)" type="number" min="0" value={briefForm.budget} onChange={(value) => setBriefForm({ ...briefForm, budget: value })} placeholder="Optional" /><Field label="Deadline" type="date" value={briefForm.deadline} onChange={(value) => setBriefForm({ ...briefForm, deadline: value })} /></div><label className="field-label">Usage and licensing terms<textarea rows="2" value={briefForm.usageTerms} onChange={(event) => setBriefForm({ ...briefForm, usageTerms: event.target.value })} /></label><label className="check-row"><input type="checkbox" checked={briefForm.commercialUse} onChange={(event) => setBriefForm({ ...briefForm, commercialUse: event.target.checked })} /><span>Commercial use required</span></label><div className="modal-actions"><button type="button" className="quiet-button" onClick={() => setBriefOpen(false)}>Cancel</button><button className="primary-button" disabled={briefBusy}>{briefBusy ? "Publishing..." : "Publish brief"} <span>↗</span></button></div></form></section></div>}

      {applicationBrief && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setApplicationBrief(null); }}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="pitch-heading"><button className="modal-close" onClick={() => setApplicationBrief(null)} aria-label="Close">×</button><div className="eyebrow"><span className="eyebrow-line" /> CREATOR PITCH</div><h2 id="pitch-heading">Make the connection.</h2><p>Pitch for <strong>{applicationBrief.title}</strong>. Share the relevant skills, tools, and approach you would bring.</p><form onSubmit={applyToBrief}><label className="field-label">Your pitch<textarea rows="6" minLength={30} maxLength={2000} required value={coverNote} onChange={(event) => setCoverNote(event.target.value)} placeholder="Tell the brand why this brief fits your practice. Mention the relevant tools, a project from your portfolio, and how you would approach the work." /></label><div className="modal-actions"><button type="button" className="quiet-button" onClick={() => setApplicationBrief(null)}>Cancel</button><button className="primary-button" disabled={coverNote.trim().length < 30}>Send pitch ↗</button></div></form></section></div>}
    </div>
  );
}

function CreatorCard({ creator, index }) {
  const project = Array.isArray(creator.portfolio) ? creator.portfolio[0] : null;
  const palette = ["creator-art-lilac", "creator-art-peach", "creator-art-blue", "creator-art-green"];
  const verifiedTools = creator.verifiedTools || [];
  const hasVerification = verifiedTools.length > 0 || creator.verifiedWorkflows || creator.verifiedPastWork;
  return (
    <article className="creator-card">
      <div className={`creator-art ${palette[index % palette.length]}`}>
        <span className="art-label">AI / PORTFOLIO</span>
        <span className="art-shape">{["✳", "◉", "✣", "◈"][index % 4]}</span>
        <span className="art-format">{project?.format || creator.formats?.[0] || "9:16"}</span>
      </div>
      <div className="creator-card-content">
        <div className="creator-identity">
          <span className="creator-avatar-large">{initials(creator.name)}</span>
          <div><h3>{creator.name}</h3><p>{creator.tagline || creator.niche}</p></div>
          {hasVerification && <span className="trust-check" title="Platform-reviewed trust signals">✓</span>}
        </div>
        <p className="creator-bio">{project?.description || creator.bio || `Independent ${creator.niche} creator exploring generative storytelling.`}</p>
        <div className="creator-pills">{(creator.skills || []).slice(0, 3).map((skill) => <span key={skill}>{skill}</span>)}</div>
        <div className="creator-tools"><span>TOOLS</span>{(creator.tools || []).slice(0, 3).join(" · ") || "Add tools to this profile"}</div>
        {project && <div className="creator-tools"><span>WORKFLOW</span>{project.workflow || project.contentType}</div>}
        <div className="creator-card-foot"><span>◉ {creator.location || "Remote"} {creator.followers ? `· ${Number(creator.followers).toLocaleString("en-IN")} audience` : ""}</span><span className="availability">OPEN TO WORK</span></div>
        <div className="verification-row">
          {verifiedTools.length > 0 && <span>✓ Tools reviewed</span>}
          {creator.verifiedWorkflows && <span>✓ Workflow reviewed</span>}
          {creator.verifiedPastWork && <span>✓ Past work reviewed</span>}
          {!hasVerification && <span className="unverified-label">Trust signals not yet reviewed</span>}
        </div>
      </div>
    </article>
  );
}

function EmptyState({ title, body, action, onAction }) {
  return <div className="empty-state"><span>✳</span><h2>{title}</h2><p>{body}</p><button className="secondary-button" onClick={onAction}>{action} <span>→</span></button></div>;
}

function Field({ label, value, onChange, ...props }) {
  return <label className="field-label">{label}<input value={value ?? ""} onChange={(event) => onChange(event.target.value)} {...props} /></label>;
}

function ArrayField({ label, value = [], onChange, placeholder }) {
  return <Field label={label} value={Array.isArray(value) ? value.join(", ") : value || ""} onChange={(text) => onChange(text.split(",").map((item) => item.trim()).filter(Boolean))} placeholder={placeholder} />;
}

function PortfolioEditor({ portfolio, onChange }) {
  const item = portfolio[0] || {};
  const update = (key, value) => {
    const next = { ...item, [key]: value };
    onChange([{ ...next, tools: Array.isArray(next.tools) ? next.tools : [] }]);
  };
  return <div className="portfolio-editor"><Field label="Project title" value={item.title || ""} onChange={(value) => update("title", value)} placeholder="e.g. A new world for sustainable fashion" /><Field label="Content type" value={item.contentType || ""} onChange={(value) => update("contentType", value)} placeholder="AI film, animation, generative images..." /><ArrayField label="Tools used" value={item.tools || []} onChange={(value) => update("tools", value)} placeholder="Runway, Midjourney..." /><Field label="Format" value={item.format || ""} onChange={(value) => update("format", value)} placeholder="9:16, 4K" /><label className="field-label">Workflow<textarea rows="2" value={item.workflow || ""} onChange={(event) => update("workflow", event.target.value)} placeholder="Concept → generation → compositing → final delivery" /></label><label className="field-label">Project description<textarea rows="2" value={item.description || ""} onChange={(event) => update("description", event.target.value)} placeholder="What was the creative challenge and result?" /></label><label className="check-row"><input type="checkbox" checked={Boolean(item.commercialUse)} onChange={(event) => update("commercialUse", event.target.checked)} /><span>This work is available for commercial licensing</span></label></div>;
}

export default App;
