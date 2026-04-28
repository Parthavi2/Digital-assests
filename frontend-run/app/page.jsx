'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, fetchDashboardBundle, login as loginRequest } from '@/lib/api';
import {
  compactNumber,
  formatDate,
  percent,
  prettyPlatform,
  prettyRisk,
  riskTone
} from '@/lib/format';

const NAV_ITEMS = [
  { id: 'overview', label: 'Dashboard', icon: 'D' },
  { id: 'check', label: 'Check Content', icon: 'C' },
  { id: 'assets', label: 'Asset Management', icon: 'A' },
  { id: 'detections', label: 'Detected Misuse', icon: 'M' },
  { id: 'risk', label: 'Risk Intelligence', icon: 'R' },
  { id: 'accounts', label: 'Account Behavior Analysis', icon: 'B' },
  { id: 'fragments', label: 'Fragment Reconstruction', icon: 'F' },
  { id: 'propagation', label: 'Content Spread Tracking', icon: 'S' },
  { id: 'mutations', label: 'Content Evolution', icon: 'E' },
  { id: 'evidence', label: 'Evidence Reports', icon: 'P' },
  { id: 'reviews', label: 'Review & Actions', icon: 'H' },
  { id: 'settings', label: 'Settings', icon: 'S' }
];

const EMPTY_BUNDLE = {
  summary: {},
  riskDistribution: [],
  platformDetections: [],
  timeline: [],
  assets: [],
  detections: [],
  accounts: [],
  fragments: [],
  propagation: [],
  mutations: [],
  evidence: [],
  reviews: []
};

function toneClass(value) {
  return riskTone[value] || 'neutral';
}

function cleanLabel(value) {
  if (!value) return 'Not specified';
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTeams(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(' vs ') || 'Teams not specified';
  if (typeof value === 'string') return value.replace(/^\[|\]$/g, '').replace(/"/g, '').replace(/,/g, ' vs ') || 'Teams not specified';
  return 'Teams not specified';
}

function useSession() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedToken = window.localStorage.getItem('hg_token');
    const storedUser = window.localStorage.getItem('hg_user');
    if (storedToken) setToken(storedToken);
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  function saveSession(nextToken, nextUser) {
    window.localStorage.setItem('hg_token', nextToken);
    window.localStorage.setItem('hg_user', JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }

  function clearSession() {
    window.localStorage.removeItem('hg_token');
    window.localStorage.removeItem('hg_user');
    setToken(null);
    setUser(null);
  }

  return { token, user, saveSession, clearSession };
}

export default function Home() {
  const session = useSession();
  const [activeView, setActiveView] = useState('overview');
  const [bundle, setBundle] = useState(EMPTY_BUNDLE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    if (!session.token) return;
    setLoading(true);
    setError('');
    try {
      setBundle(await fetchDashboardBundle(session.token));
    } catch (err) {
      setError(err.message || 'Could not load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [session.token]);

  if (!session.token) {
    return <LoginScreen onLogin={session.saveSession} />;
  }

  return (
    <main className="app-frame">
      <aside className="side-rail">
        <div className="brand-lockup">
          <div className="brand-mark">HG</div>
          <div>
            <p className="eyebrow">HighlightGuard</p>
            <h1>AI Control</h1>
          </div>
        </div>

        <nav className="nav-list">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeView === item.id ? 'is-active' : ''}`}
              onClick={() => setActiveView(item.id)}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="operator-card">
          <span className="status-dot" />
          <div>
            <strong>{session.user?.name}</strong>
            <small>{prettyRisk(session.user?.role)}</small>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Monitoring active</p>
            <h2>{NAV_ITEMS.find((item) => item.id === activeView)?.label}</h2>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button" onClick={refresh} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button className="danger-button" onClick={session.clearSession}>Sign out</button>
          </div>
        </header>

        {error ? <div className="alert-banner">{error}</div> : null}

        <ViewRouter
          activeView={activeView}
          bundle={bundle}
          token={session.token}
          user={session.user}
          refresh={refresh}
        />
      </section>
    </main>
  );
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await loginRequest(email, password);
      onLogin(result.token, result.user);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-stage">
      <section className="hero-panel">
        <div className="brand-lockup">
          <div className="brand-mark">HG</div>
          <div>
            <p className="eyebrow">Sports rights protection</p>
            <h1>HighlightGuard AI</h1>
          </div>
        </div>
        <h2>Detect copied highlights, map the spread, and package evidence for human review.</h2>
        <p>
          A focused workspace for official sports media teams to review detections,
          score risk, and act only after analyst approval.
        </p>
      </section>

      <form className="login-card" onSubmit={submit}>
        <p className="eyebrow">Secure sign in</p>
        <h2>Sign in to your workspace</h2>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
        </label>
        {error ? <div className="form-error">{error}</div> : null}
        <button className="primary-button" disabled={busy}>
          {busy ? 'Authenticating...' : 'Launch dashboard'}
        </button>
        <small>Sign in with your HighlightGuard workspace account.</small>
      </form>
    </main>
  );
}

function ViewRouter({ activeView, bundle, token, user, refresh }) {
  const props = { bundle, token, user, refresh };
  if (activeView === 'check') return <CheckContentView {...props} />;
  if (activeView === 'assets') return <AssetsView {...props} />;
  if (activeView === 'detections') return <DetectionsView {...props} />;
  if (activeView === 'risk') return <RiskView {...props} />;
  if (activeView === 'accounts') return <AccountsView {...props} />;
  if (activeView === 'fragments') return <FragmentsView {...props} />;
  if (activeView === 'propagation') return <PropagationView {...props} />;
  if (activeView === 'mutations') return <MutationsView {...props} />;
  if (activeView === 'evidence') return <EvidenceView {...props} />;
  if (activeView === 'reviews') return <ReviewsView {...props} />;
  if (activeView === 'settings') return <SettingsView {...props} />;
  return <OverviewView {...props} />;
}

function CheckContentView({ bundle, token, refresh }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setResult(null);
    const form = new FormData(event.currentTarget);

    try {
      const payload = await apiFetch('/api/matching/check', {
        token,
        method: 'POST',
        body: form
      });
      setResult(payload.data);
      setMessage(payload.data.message || 'Check complete. Detection, risk, propagation, and review data were saved.');
      event.currentTarget.reset();
      await refresh();
    } catch (err) {
      setMessage(err.message || 'Check failed');
    } finally {
      setBusy(false);
    }
  }

  const latestRisk = result?.risk || result?.detection?.riskScores?.[0];

  return (
    <div className="view-stack">
      <Panel title="Check Suspect Content" subtitle="Paste a public URL or upload a suspect clip to compare it against your official highlight library">
        <form className="asset-form" onSubmit={submit}>
          <select name="assetId" defaultValue="">
            <option value="">Use latest official asset</option>
            {bundle.assets.map((asset) => (
              <option key={asset.id} value={asset.assetId || asset.id}>
                {asset.title} / {asset.matchName}
              </option>
            ))}
          </select>
          <input name="url" placeholder="Suspect public URL, e.g. YouTube/Instagram/X link" />
          <input name="accountName" placeholder="Account or channel name" />
          <input name="accountHandle" placeholder="Account handle, optional" />
          <input name="caption" placeholder="Caption or title, optional" />
          <input name="views" type="number" min="0" placeholder="Views, optional" />
          <input name="media" type="file" accept="video/*,audio/*,image/*" />
          <button className="primary-button" disabled={busy}>
            {busy ? 'Checking...' : 'Run content check'}
          </button>
        </form>
        {message ? <div className="inline-note">{message}</div> : null}
      </Panel>

      {result ? (
        <div className="two-column">
          <Panel title="Match Result" subtitle="Stored detection from the latest manual check">
            <div className="score-card">
              <div className="split-row">
                <RiskPill value={latestRisk?.riskCategory} />
                <strong>{percent(result.detection?.confidenceScore)}</strong>
              </div>
              <KeyValue label="Official Asset" value={result.officialAsset?.title} />
              <KeyValue label="Checked Source" value={result.crawledMedia?.detectedUrl} />
              <Progress label="Video Similarity" value={result.detection?.videoSimilarityScore} />
              <Progress label="Audio Similarity" value={result.detection?.audioSimilarityScore} />
              <Progress label="Frame Hash" value={result.detection?.frameHashSimilarity} />
              <Progress label="Embedding" value={result.detection?.embeddingSimilarity} />
            </div>
          </Panel>
          <Panel title="Action Queue" subtitle="Evidence is created automatically for high or critical risk">
            <div className="case-card">
              <p className="eyebrow">{result.evidencePacket?.evidenceId || 'No evidence packet required'}</p>
              <h3>{latestRisk ? `${prettyRisk(latestRisk.riskCategory)} / ${percent(latestRisk.finalScore)}` : 'Risk pending'}</h3>
              <p>{result.evidencePacket?.reasonForFlagging || 'This check was saved as a detection. Evidence packets are generated when risk is high or critical.'}</p>
              <div className="case-metrics">
                <strong>{prettyPlatform(result.crawledMedia?.platform)}</strong>
                <strong>{result.reviewCase?.status || 'No review case'}</strong>
              </div>
            </div>
          </Panel>
        </div>
      ) : null}

      <Panel title="Recent Manual & Crawled Matches" subtitle="Latest detections saved in the backend">
        <DetectionList detections={bundle.detections.slice(0, 8)} expanded />
      </Panel>
    </div>
  );
}

function OverviewView({ bundle, token, refresh }) {
  const [scanMessage, setScanMessage] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  async function runScan() {
    setScanBusy(true);
    setScanMessage('');
    try {
      const payload = await apiFetch('/api/crawler/start', {
        token,
        method: 'POST',
        body: { batchSize: 6 }
      });
      await refresh();
      setScanMessage(`Scan complete: ${payload.data.result.detections} new detections, ${payload.data.result.evidencePackets} evidence packets.`);
    } catch (err) {
      setScanMessage(err.message || 'Scan failed');
    } finally {
      setScanBusy(false);
    }
  }
  const stats = [
    ['Official Assets', bundle.summary.totalAssets ?? bundle.summary.totalOfficialAssets, 'Registered protected media'],
    ['Detections', bundle.summary.totalDetections, 'Matched public uploads'],
    ['High Risk', bundle.summary.highRiskAlerts, 'Needs fast review'],
    ['Critical Risk', bundle.summary.criticalRiskAlerts, 'Viral or organized misuse'],
    ['Spike Events', bundle.summary.viralSpikeEvents, 'Propagation spikes'],
    ['Pending Reviews', bundle.summary.pendingReviews, 'Human action queue']
  ];

  return (
    <div className="view-stack">
      <div className="metric-grid">
        {stats.map(([label, value, hint]) => (
          <article className="metric-card" key={label}>
            <p>{label}</p>
            <strong>{compactNumber(value)}</strong>
            <span>{hint}</span>
          </article>
        ))}
      </div>

      <div className="two-column">
        <Panel
          title="Detection Timeline"
          subtitle="Daily detection activity across monitored public sources"
          action={<button className="primary-button" onClick={runScan} disabled={scanBusy}>{scanBusy ? 'Scanning...' : 'Run platform scan'}</button>}
        >
          <LineChart data={bundle.timeline} />
          {scanMessage ? <div className="inline-note">{scanMessage}</div> : null}
        </Panel>
        <Panel title="Platform Detections" subtitle="Where matched clips are appearing most often">
          <BarChart data={bundle.platformDetections} labelKey="platform" valueKey="count" />
        </Panel>
      </div>

      <div className="two-column wide-left">
        <Panel title="Recent Detection Results" subtitle="Similarity and review status from current monitoring">
          <DetectionList detections={bundle.detections.slice(0, 5)} />
        </Panel>
        <Panel title="Top Risk Accounts" subtitle="Highlight density score">
          <AccountList accounts={bundle.summary.topRiskyAccounts || bundle.accounts.slice(0, 5)} />
        </Panel>
      </div>
    </div>
  );
}

function AssetsView({ bundle, token, refresh, user }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const canUpload = user?.role === 'ADMIN';

  async function submit(event) {
    event.preventDefault();
    if (!canUpload) return;
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const payload = await apiFetch('/api/assets/upload', { token, method: 'POST', body: form });
      event.currentTarget.reset();
      const warning = payload.data.warning ? ` Warning: ${payload.data.warning}` : '';
      setMessage(`Asset saved and fingerprint ready. YouTube results: ${payload.data.workflow.youtubeResults}, detections: ${payload.data.workflow.detections}.${warning}`);
      await refresh();
    } catch (err) {
      setMessage(err.message || 'Upload failed');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="view-stack">
      <Panel title="Register Official Asset" subtitle="Add official content for fingerprinting and monitoring">
        <form className="asset-form" onSubmit={submit}>
          <input name="title" placeholder="Title" required />
          <input name="matchName" placeholder="Match name" required />
          <input name="tournament" placeholder="Tournament" required />
          <input name="teams" placeholder="Teams, e.g. India, Australia" />
          <input name="sportType" placeholder="Sport type" required />
          <input name="highlightCategory" placeholder="Highlight category" required />
          <input name="rightsOwner" placeholder="Rights owner" required />
          <input name="duration" type="number" min="1" placeholder="Duration seconds" required />
          <input name="mediaUrl" placeholder="Media URL if not uploading a file" />
          <input name="thumbnailUrl" placeholder="Thumbnail URL" />
          <input name="media" type="file" accept="video/*,audio/*,image/*" />
          <button className="primary-button" disabled={busy || !canUpload}>
            {busy ? 'Registering...' : canUpload ? 'Register asset' : 'Admin role required'}
          </button>
        </form>
        {message ? <div className="inline-note">{message}</div> : null}
      </Panel>

      <Panel title="Official Asset Library" subtitle="Protected match footage, highlight packages, and key moments">
        <div className="asset-grid">
          {bundle.assets.map((asset) => (
            <article className="asset-card" key={asset.id}>
              <div>
                <p className="eyebrow">{cleanLabel(asset.sportType)} / {cleanLabel(asset.highlightCategory)}</p>
                <h3>{asset.title}</h3>
                <span>{asset.matchName} / {formatTeams(asset.teams)}</span>
              </div>
              <div className="asset-meta">
                <Badge>{asset.uploadStatus}</Badge>
                <Badge>{asset.fingerprintStatus}</Badge>
                <strong>{asset.duration}s</strong>
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function DetectionsView({ bundle }) {
  const [filter, setFilter] = useState('ALL');
  const detections = useMemo(() => {
    if (filter === 'ALL') return bundle.detections;
    return bundle.detections.filter((item) => item.riskScores?.[0]?.riskCategory === filter);
  }, [bundle.detections, filter]);

  return (
    <Panel title="Detected Misuse" subtitle="Unauthorized clips ranked by similarity and risk">
      <div className="filter-row">
        {['ALL', 'LOW_RISK', 'MEDIUM_RISK', 'HIGH_RISK', 'CRITICAL_RISK'].map((item) => (
          <button className={filter === item ? 'chip active' : 'chip'} key={item} onClick={() => setFilter(item)}>
            {prettyRisk(item)}
          </button>
        ))}
      </div>
      <DetectionList detections={detections} expanded />
    </Panel>
  );
}

function RiskView({ bundle }) {
  const weightedSignals = bundle.detections.flatMap((detection) => detection.riskScores || []).slice(0, 8);
  return (
    <div className="view-stack">
      <div className="two-column">
        <Panel title="Risk Distribution" subtitle="Current balance of low, medium, high, and critical cases">
          <RiskDonuts data={bundle.riskDistribution} />
        </Panel>
        <Panel title="Risk Inputs" subtitle="Latest weighted scoring components">
          <div className="score-stack">
            {weightedSignals.map((risk) => (
              <ScoreCard key={risk.id} risk={risk} />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function AccountsView({ bundle }) {
  return (
    <Panel title="Highlight Density Intelligence" subtitle="Accounts with repeated highlight-heavy posting behavior">
      <AccountList accounts={bundle.accounts} expanded />
    </Panel>
  );
}

function FragmentsView({ bundle, token, refresh }) {
  const [busy, setBusy] = useState(false);

  async function analyze() {
    setBusy(true);
    try {
      await apiFetch('/api/fragments/analyze', { token, method: 'POST', body: {} });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Fragment Reconstruction Cases"
      subtitle="Accounts reconstructing official packages from short clips"
      action={<button className="ghost-button" onClick={analyze}>{busy ? 'Analyzing...' : 'Analyze fragments'}</button>}
    >
      <div className="case-grid">
        {bundle.fragments.map((item) => (
          <article className="case-card" key={item.id}>
            <p className="eyebrow">{item.accountId}</p>
            <h3>{item.matchName}</h3>
            <div className="timeline-strip">
              {(item.reconstructedTimeline || []).map((segment, index) => (
                <span key={`${item.id}-${index}`} style={{ width: `${Math.max(8, segment.end - segment.start)}%` }} />
              ))}
            </div>
            <p>{item.stitchingRiskReason}</p>
            <div className="case-metrics">
              <strong>{item.fragmentCount} fragments</strong>
              <strong>{percent(item.reconstructedHighlightPercentage)}</strong>
              <RiskPill value={item.fragmentStitchingScore >= 85 ? 'CRITICAL_RISK' : 'HIGH_RISK'} />
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function PropagationView({ bundle }) {
  return (
    <div className="view-stack">
      <Panel title="Content Spread Tracking" subtitle="Velocity, reposts, and cross-platform spread signals">
        <div className="case-grid">
          {bundle.propagation.map((event) => (
            <article className="case-card" key={event.id}>
              <p className="eyebrow">{event.officialAsset?.title || event.officialAssetId}</p>
              <h3>{event.spikeDetected ? 'Spike detected' : 'Monitoring spread'}</h3>
              <p>{event.spikeReason || 'No spike reason recorded yet.'}</p>
              <div className="case-metrics">
                <strong>{event.repostCount} reposts</strong>
                <strong>{compactNumber(event.viewVelocity)} views/hr</strong>
                <strong>{event.crossPlatformAppearances} platforms</strong>
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MutationsView({ bundle, token }) {
  const [selectedAsset, setSelectedAsset] = useState('');
  const [tree, setTree] = useState(null);

  async function loadTree(assetId) {
    setSelectedAsset(assetId);
    const payload = await apiFetch(`/api/mutations/${assetId}`, { token });
    setTree(payload.data);
  }

  return (
    <div className="view-stack">
      <Panel title="Content Evolution" subtitle="Select an official asset to inspect copied versions">
        <div className="asset-grid">
          {bundle.mutations.length ? bundle.mutations.map((node) => (
            <button className="asset-card as-button" key={node.id} onClick={() => loadTree(node.officialAssetId)}>
              <div>
                <p className="eyebrow">{node.officialAsset?.matchName || 'Tracked asset'}</p>
                <h3>{node.officialAsset?.title || node.accountName}</h3>
                <span>{cleanLabel(node.officialAsset?.highlightCategory)} / {formatTeams(node.officialAsset?.teams)}</span>
              </div>
              <Badge>View</Badge>
            </button>
          )) : <EmptyState label="No content evolution data yet." />}
        </div>
      </Panel>

      <Panel title="Lineage Tree" subtitle={selectedAsset ? 'Selected asset lineage' : 'Choose an asset to inspect'}>
        <MutationTree nodes={tree?.nodes || []} />
      </Panel>
    </div>
  );
}

function EvidenceView({ bundle, token, refresh }) {
  const [message, setMessage] = useState('');

  async function generateBrief(packetId) {
    setMessage('');
    try {
      await apiFetch(`/api/evidence/${packetId}/gemini-brief`, { token, method: 'POST', body: {} });
      setMessage('Gemini review brief generated.');
      await refresh();
    } catch (err) {
      setMessage(err.message || 'Gemini brief failed');
    }
  }

  return (
    <Panel title="Evidence Reports" subtitle="Review-ready packets prepared for analyst validation">
      {message ? <div className="inline-note">{message}</div> : null}
      <div className="case-grid">
        {bundle.evidence.map((packet) => (
          <article className="case-card" key={packet.id}>
            <div className="split-row">
              <p className="eyebrow">{packet.evidenceId}</p>
              <RiskPill value={packet.riskCategory} />
            </div>
            <h3>{packet.officialAsset?.title}</h3>
            <p>{packet.reasonForFlagging}</p>
            <div className="case-metrics">
              <strong>{prettyPlatform(packet.platform)}</strong>
              <strong>{packet.accountName}</strong>
              <strong>{packet.recommendedAction}</strong>
            </div>
            {packet.aiReviewBrief ? (
              <div className="inline-note">
                <strong>Gemini brief</strong>
                <p>{packet.aiReviewBrief.brief}</p>
              </div>
            ) : (
              <button className="ghost-button" onClick={() => generateBrief(packet.evidenceId || packet.id)}>
                Generate Gemini brief
              </button>
            )}
          </article>
        ))}
      </div>
    </Panel>
  );
}

function ReviewsView({ bundle, token, refresh }) {
  async function updateStatus(reviewId, status) {
    await apiFetch(`/api/reviews/${reviewId}/status`, {
      token,
      method: 'PUT',
      body: { status, decisionSummary: `Updated to ${status} from frontend dashboard.` }
    });
    await refresh();
  }

  const groups = ['PENDING_REVIEW', 'UNDER_INVESTIGATION', 'APPROVED_ACTION', 'REJECTED_SAFE', 'ESCALATED'];

  return (
    <div className="kanban-grid">
      {groups.map((status) => (
        <section className="kanban-column" key={status}>
          <h3>{prettyRisk(status)}</h3>
          {bundle.reviews.filter((review) => review.status === status).map((review) => (
            <article className="review-card" key={review.id}>
              <RiskPill value={review.priority} />
              <h4>{review.evidencePacket?.officialAsset?.title}</h4>
              <p>{review.evidencePacket?.reasonForFlagging}</p>
              <small>Reviewer: {review.assignedTo?.name || 'Unassigned'}</small>
              <div className="review-actions">
                <button onClick={() => updateStatus(review.id, 'UNDER_INVESTIGATION')}>Investigate</button>
                <button onClick={() => updateStatus(review.id, 'APPROVED_ACTION')}>Approve</button>
                <button onClick={() => updateStatus(review.id, 'REJECTED_SAFE')}>Reject</button>
              </div>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

function SettingsView({ token, user }) {
  const [profile, setProfile] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [notifications, setNotifications] = useState(null);
  const [integrations, setIntegrations] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function load() {
      const [profileRes, orgRes, notificationRes, integrationRes] = await Promise.all([
        apiFetch('/api/settings/profile', { token }),
        apiFetch('/api/settings/organization', { token }),
        apiFetch('/api/settings/notifications', { token }),
        apiFetch('/api/settings/integrations', { token })
      ]);
      setProfile(profileRes.data);
      setOrganization(orgRes.data);
      setNotifications(notificationRes.data);
      setIntegrations(integrationRes.data);
    }
    load().catch((err) => setMessage(err.message));
  }, [token]);

  async function saveNotifications() {
    const payload = await apiFetch('/api/settings/notifications', {
      token,
      method: 'PUT',
      body: notifications
    });
    setNotifications(payload.data);
    setMessage('Notification preferences saved.');
  }

  return (
    <div className="two-column">
      <Panel title="Profile" subtitle="Signed-in user details">
        <KeyValue label="Name" value={profile?.name || user?.name} />
        <KeyValue label="Email" value={profile?.email || user?.email} />
        <KeyValue label="Role" value={prettyRisk(profile?.role || user?.role)} />
      </Panel>
      <Panel title="Organization" subtitle="Rights owner workspace configuration">
        <KeyValue label="Name" value={organization?.name} />
        <KeyValue label="Domain" value={organization?.domain} />
        <KeyValue label="Users" value={organization?.users?.length} />
      </Panel>
      <Panel title="Integrations" subtitle="Backend API keys and service status">
        {integrations ? ['youtube', 'gemini', 'database', 'redis', 'jwt'].map((key) => (
          <div className="key-value" key={key}>
            <span>{integrations[key].label}</span>
            <strong>{integrations[key].configured ? `Configured (${integrations[key].masked})` : 'Missing'}</strong>
          </div>
        )) : null}
        <KeyValue label="Storage Mode" value={integrations?.mode?.storage} />
      </Panel>
      <Panel title="Notifications" subtitle="Alert preferences for review and risk events">
        {notifications ? Object.entries(notifications).map(([key, value]) => (
          <label className="toggle-row" key={key}>
            {key}
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(event) => setNotifications((current) => ({ ...current, [key]: event.target.checked }))}
              disabled={typeof value !== 'boolean'}
            />
          </label>
        )) : null}
        <button className="primary-button" onClick={saveNotifications}>Save notifications</button>
        {message ? <div className="inline-note">{message}</div> : null}
      </Panel>
    </div>
  );
}

function Panel({ title, subtitle, action, children }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function DetectionList({ detections, expanded = false }) {
  if (!detections.length) return <EmptyState label="No detections returned by the API." />;

  return (
    <div className="list-stack">
      {detections.map((detection) => {
        const risk = detection.riskScores?.[0]?.riskCategory || 'MEDIUM_RISK';
        return (
          <article className="detection-row" key={detection.id}>
            <div className={`risk-orb ${toneClass(risk)}`} />
            <div className="row-main">
              <div className="split-row">
                <strong>{detection.crawledMedia?.accountName || 'Unknown account'}</strong>
                <RiskPill value={risk} />
              </div>
              <span>{detection.officialAsset?.title} / {prettyPlatform(detection.crawledMedia?.platform)}</span>
              {expanded ? <small>{detection.crawledMedia?.detectedUrl}</small> : null}
            </div>
            <div className="row-score">
              <strong>{percent(detection.confidenceScore)}</strong>
              <small>{detection.detectionStatus}</small>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function AccountList({ accounts, expanded = false }) {
  if (!accounts?.length) return <EmptyState label="No account intelligence returned by the API." />;

  return (
    <div className="list-stack">
      {accounts.map((account) => (
        <article className="account-row" key={account.id || account.accountId}>
          <div>
            <div className="split-row">
              <strong>{account.accountHandle}</strong>
              <RiskPill value={account.accountRiskLevel} />
            </div>
            <span>{prettyPlatform(account.platform)} / {account.accountName}</span>
            <Progress value={account.highlightDensityScore} />
          </div>
          {expanded ? (
            <div className="mini-metrics">
              <span>{account.totalPostsScanned} scanned</span>
              <span>{account.highlightPosts} highlight posts</span>
              <span>{account.copiedContentCount} copied</span>
              <span>{account.fragmentCount || account.highRiskDetectionCount} high risk</span>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function ScoreCard({ risk }) {
  return (
    <article className="score-card">
      <div className="split-row">
        <RiskPill value={risk.riskCategory} />
        <strong>{percent(risk.finalScore)}</strong>
      </div>
      <Progress label="Similarity" value={risk.similarityScore} />
      <Progress label="Priority" value={risk.highlightPriorityScore} />
      <Progress label="Density" value={risk.highlightDensityScore} />
      <Progress label="Propagation" value={risk.propagationVelocityScore} />
    </article>
  );
}

function RiskPill({ value }) {
  return <span className={`risk-pill ${toneClass(value)}`}>{prettyRisk(value)}</span>;
}

function Badge({ children }) {
  return <span className="badge">{children}</span>;
}

function Progress({ value = 0, label }) {
  const normalized = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <div className="progress-wrap">
      {label ? <span>{label}</span> : null}
      <div className="progress-track">
        <div style={{ width: `${normalized}%` }} />
      </div>
    </div>
  );
}

function KeyValue({ label, value }) {
  return (
    <div className="key-value">
      <span>{label}</span>
      <strong>{value ?? 'Not configured'}</strong>
    </div>
  );
}

function EmptyState({ label }) {
  return <div className="empty-state">{label}</div>;
}

function LineChart({ data }) {
  const max = Math.max(1, ...data.map((item) => item.count || item.detections || 0));
  const points = data.map((item, index) => {
    const x = data.length <= 1 ? 50 : (index / (data.length - 1)) * 100;
    const y = 100 - ((item.count || item.detections || 0) / max) * 82 - 8;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className="line-chart" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline points={points} />
      {data.map((item, index) => {
        const x = data.length <= 1 ? 50 : (index / (data.length - 1)) * 100;
        const value = item.count || item.detections || 0;
        const y = 100 - (value / max) * 82 - 8;
        return <circle key={`${item.date}-${index}`} cx={x} cy={y} r="1.6" />;
      })}
    </svg>
  );
}

function BarChart({ data, labelKey, valueKey }) {
  const max = Math.max(1, ...data.map((item) => item[valueKey] || 0));
  return (
    <div className="bar-chart">
      {data.map((item) => (
        <div className="bar-item" key={item[labelKey]}>
          <strong>{item[valueKey]}</strong>
          <span style={{ height: `${Math.max(10, (item[valueKey] / max) * 100)}%` }} />
          <small>{prettyPlatform(item[labelKey])}</small>
        </div>
      ))}
    </div>
  );
}

function RiskDonuts({ data }) {
  const total = Math.max(1, data.reduce((sum, item) => sum + Number(item.count || 0), 0));
  return (
    <div className="donut-grid">
      {data.map((item) => {
        const value = Number(item.count || 0);
        const angle = (value / total) * 360;
        return (
          <div className="donut-card" key={item.riskCategory}>
            <div className={`donut ${toneClass(item.riskCategory)}`} style={{ '--angle': `${angle}deg` }}>
              <strong>{value}</strong>
            </div>
            <span>{prettyRisk(item.riskCategory)}</span>
          </div>
        );
      })}
    </div>
  );
}

function MutationTree({ nodes }) {
  if (!nodes.length) return <EmptyState label="Choose a mutation root to inspect its lineage." />;
  const byParent = nodes.reduce((acc, node) => {
    const parent = node.parentNodeId || 'root';
    acc[parent] ||= [];
    acc[parent].push(node);
    return acc;
  }, {});

  function renderBranch(parentId, depth = 0) {
    return (byParent[parentId] || []).map((node) => {
      const children = renderBranch(node.id, depth + 1);
      return (
        <li key={node.id} style={{ '--depth': depth }}>
          <div>
            <strong>{cleanLabel(node.transformationType)}</strong>
            <span>{node.accountName} / {prettyPlatform(node.platform)} / {percent(node.similarityScore)}</span>
          </div>
          {children.length ? <ul>{children}</ul> : null}
        </li>
      );
    });
  }

  return <ul className="mutation-tree">{renderBranch('root')}</ul>;
}
