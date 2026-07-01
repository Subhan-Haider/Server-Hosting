import { useState, useEffect, useRef } from 'react';
import { Play, Square, RotateCw, Trash2, Terminal, Plus, Server, Globe, Folder, Activity, RefreshCw, GitBranch, Settings, ExternalLink, Code2, LogOut, CheckCircle, Bell, Key, FileText, Save, X, Search, Copy, Check, ChevronDown, Database, HardDrive } from 'lucide-react';
import { api } from './api';
import Login from './Login';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('authToken'));
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [deployLogs, setDeployLogs] = useState('');
  const [deployType, setDeployType] = useState('local');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useCustomDomain, setUseCustomDomain] = useState(false);
  const [availableBranches, setAvailableBranches] = useState([]);
  const [fetchingBranches, setFetchingBranches] = useState(false);
  const [envVars, setEnvVars] = useState([{ key: '', value: '' }]);
  const [githubToken, setGithubToken] = useState(() => localStorage.getItem('gh_token') || '');
  const [githubUser, setGithubUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gh_user') || 'null'); } catch { return null; }
  });
  const [showGithubConnect, setShowGithubConnect] = useState(false);

  const [globalSecrets, setGlobalSecrets] = useState({});
  const [showSecretsVault, setShowSecretsVault] = useState(false);
  const [selectedSecrets, setSelectedSecrets] = useState([]);

  const [crashes, setCrashes] = useState([]);
  const [showCrashes, setShowCrashes] = useState(false);

  const [templates, setTemplates] = useState([]);

  // Phase 3 State
  const [databases, setDatabases] = useState([]);
  const [showDatabases, setShowDatabases] = useState(false);
  
  const [servers, setServers] = useState([]);
  const [showServers, setShowServers] = useState(false);

  const [formData, setFormData] = useState({ 
    name: '', 
    path: '', 
    domain: '',
    githubUrl: '',
    githubPat: '',
    branch: 'main',
    installCmd: '',
    buildCmd: '',
    startCmd: '',
    serverId: 'local'
  });

  const fetchApps = async () => {
    try {
      const data = await api.getApps();
      setApps(data.apps);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDatabases = async () => {
    try {
      const data = await api.getDatabases();
      setDatabases(data.databases || []);
    } catch (err) { console.error(err); }
  };

  const fetchServers = async () => {
    try {
      const data = await api.getServers();
      setServers(data.servers || []);
    } catch (err) { console.error(err); }
  };

  const fetchSecrets = async () => {
    try {
      const data = await api.getSecrets();
      setGlobalSecrets(data);
    } catch (e) {}
  };

  const fetchCrashes = async () => {
    try {
      const data = await api.getCrashes();
      setCrashes(data);
    } catch (e) {}
  };

  const fetchTemplates = async () => {
    try {
      const data = await api.getTemplates();
      setTemplates(data.templates);
    } catch (e) {}
  };

  useEffect(() => {
    const handleAuthError = () => setIsAuthenticated(false);
    window.addEventListener('auth_error', handleAuthError);
    return () => window.removeEventListener('auth_error', handleAuthError);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    fetchApps();
    fetchSecrets();
    fetchCrashes();
    fetchTemplates();
    const interval = setInterval(() => {
      fetchApps();
      fetchCrashes();
    }, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleDeploy = async (e) => {
    e.preventDefault();
    setDeploying(true);
    setDeployLogs('Starting deployment process...\n');
    try {
      // Convert envVars array to object, filtering empty keys
      const envVarsObj = {};
      envVars.forEach(({ key, value }) => {
        if (key.trim()) envVarsObj[key.trim()] = value;
      });
      // Use connected GitHub token as PAT if no manual PAT is entered
      const effectivePat = formData.githubPat || githubToken || undefined;
      await api.deployApp(
        { 
          ...formData, 
          githubPat: effectivePat, 
          deployType, 
          envVars: Object.keys(envVarsObj).length > 0 ? envVarsObj : undefined,
          globalSecretKeys: selectedSecrets.length > 0 ? selectedSecrets : undefined
        },
        (msg) => setDeployLogs(prev => prev + msg)
      );
      setFormData({ 
        name: '', path: '', domain: '', 
        githubUrl: '', githubPat: '', branch: 'main',
        installCmd: '', buildCmd: '', startCmd: ''
      });
      setEnvVars([{ key: '', value: '' }]);
      setShowAdvanced(false);
      fetchApps();
    } catch (err) {
      alert('Error deploying app: ' + err.message);
    } finally {
      setDeploying(false);
      // Keep logs visible for a couple seconds on success/failure, then clear
      setTimeout(() => setDeployLogs(''), 3000);
    }
  };

  const handleGithubUrlChange = async (e) => {
    const url = e.target.value;
    let branch = formData.branch;
    let autoName = formData.name;
    let autoDomain = formData.domain;
    setAvailableBranches([]);

    try {
      const urlObj = new URL(url);
      if (urlObj.hostname.includes('github.com')) {
        const parts = urlObj.pathname.split('/').filter(Boolean);
        const owner = parts[0];
        const repo = parts[1]?.replace(/\.git$/, '');

        // Auto-fill name and domain from repo name
        if (repo) {
          autoName = repo;
          if (!useCustomDomain) {
            autoDomain = `${repo.toLowerCase().replace(/[^a-z0-9-]/g, '')}.subhan.tech`;
          }
        }

        // Extract branch from URL if present
        if (parts.length >= 4 && (parts[2] === 'tree' || parts[2] === 'blob')) {
          branch = parts[3];
        }

        // Fetch all branches from GitHub API
        if (owner && repo) {
          setFetchingBranches(true);
          try {
            const headers = githubToken ? { Authorization: `token ${githubToken}` } : {};
            const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, { headers });
            if (res.ok) {
              const data = await res.json();
              const branchNames = data.map(b => b.name);
              setAvailableBranches(branchNames);
              // If no branch was in URL, use the default (first branch is usually default)
              if (parts.length < 4 && branchNames.length > 0) {
                // Prefer main > master > first available
                branch = branchNames.includes('main') ? 'main'
                  : branchNames.includes('master') ? 'master'
                  : branchNames[0];
              }
            }
          } catch (_) {
            // GitHub API failed (private repo or rate limit), keep defaults
          } finally {
            setFetchingBranches(false);
          }
        }
      }
    } catch (err) {
      // ignore invalid URLs while typing
    }
    setFormData({ ...formData, githubUrl: url, branch, name: autoName, domain: autoDomain });
  };

  if (!isAuthenticated) {
    return <Login onLogin={(token) => {
      api.setAuthToken(token);
      setIsAuthenticated(true);
    }} />;
  }

  const [searchQuery, setSearchQuery] = useState('');
  const [showDeployModal, setShowDeployModal] = useState(false);

  const filteredApps = apps.filter(app =>
    app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    app.domain?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onlineCount = apps.filter(a => a.status === 'online').length;
  const totalCpu = apps.reduce((s, a) => s + (a.cpu || 0), 0).toFixed(1);
  const totalMem = (apps.reduce((s, a) => s + (a.memory || 0), 0) / (1024 * 1024)).toFixed(0);
  const prPreviews = apps.filter(a => a.isPR);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-color)', fontFamily: 'var(--font-family)' }}>

      {/* ── Top Navbar ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 28px', height: '56px',
        background: 'rgba(13,15,18,0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        gap: '16px'
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg,#3b82f6,#10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Server size={14} color="white" />
          </div>
          <span style={{ fontWeight: '700', fontSize: '0.95rem', letterSpacing: '-0.01em', color: '#f0f4f8' }}>ServerOps</span>
        </div>

        {/* Search */}
        <div style={{ flex: 1, maxWidth: '380px', position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px 8px 36px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', color: '#f0f4f8',
              fontSize: '0.88rem', fontFamily: 'inherit',
              outline: 'none', transition: 'border-color 0.2s'
            }}
          />
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button className="btn btn-secondary" onClick={() => { fetchDatabases(); setShowDatabases(true); }} title="Databases" style={{ padding: '6px 10px', fontSize: '0.82rem', gap: '5px' }}>
            <Database size={14} /> Databases
          </button>
          <button className="btn btn-secondary" onClick={() => { fetchServers(); setShowServers(true); }} title="Servers" style={{ padding: '6px 10px', fontSize: '0.82rem', gap: '5px' }}>
            <HardDrive size={14} /> Servers
          </button>
          <button className="btn btn-secondary" onClick={() => setShowSecretsVault(true)} title="Secrets Vault" style={{ padding: '6px 10px', fontSize: '0.82rem', gap: '5px' }}>
            <Key size={14} /> Secrets
          </button>
          <button className="btn btn-secondary" onClick={() => setShowCrashes(true)} style={{ position: 'relative', padding: '6px 10px' }} title="Crash Reports">
            <Bell size={14} />
            {crashes.length > 0 && (
              <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: 'var(--danger)', color: 'white', fontSize: '0.62rem', padding: '1px 5px', borderRadius: '10px', lineHeight: 1.4 }}>{crashes.length}</span>
            )}
          </button>
          {githubUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.06)', padding: '4px 10px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <img src={githubUser.avatar_url} alt="avatar" style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
              <span style={{ fontSize: '0.8rem', fontWeight: '500' }}>{githubUser.login}</span>
              <button onClick={() => { localStorage.removeItem('gh_token'); localStorage.removeItem('gh_user'); setGithubToken(''); setGithubUser(null); }} title="Disconnect" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, display: 'flex', marginLeft: '2px' }}>
                <X size={13} />
              </button>
            </div>
          ) : (
            <button className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '6px 10px', gap: '5px' }} onClick={() => setShowGithubConnect(true)}>
              <Code2 size={14} /> GitHub
            </button>
          )}
          <button onClick={() => { api.setAuthToken(null); setIsAuthenticated(false); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex' }} title="Logout">
            <LogOut size={16} />
          </button>
          <button className="btn btn-primary" onClick={() => setShowDeployModal(true)} style={{ padding: '7px 16px', fontSize: '0.88rem', gap: '6px', borderRadius: '8px' }}>
            <Plus size={15} /> Add New
          </button>
        </div>
      </nav>

      {/* ── Body ── */}
      <div style={{ display: 'flex', maxWidth: '1400px', margin: '0 auto', padding: '28px 24px', gap: '28px', alignItems: 'flex-start' }}>

        {/* ── Left Sidebar ── */}
        <aside style={{ width: '230px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Server Health */}
          <div style={{ background: 'rgba(20,24,32,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: '12px' }}>Usage</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }} /> Online
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: '600' }}>{onlineCount} / {apps.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Total CPU</span>
                <span style={{ fontSize: '0.82rem', fontWeight: '600' }}>{totalCpu}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Memory</span>
                <span style={{ fontSize: '0.82rem', fontWeight: '600' }}>{totalMem} MB</span>
              </div>
            </div>
          </div>

          {/* Alerts */}
          {crashes.length > 0 && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f87171', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Bell size={12} /> Alerts
              </div>
              {crashes.slice(0, 3).map((c, i) => (
                <div key={i} style={{ marginBottom: '8px', cursor: 'pointer' }} onClick={() => setShowCrashes(true)}>
                  <div style={{ fontSize: '0.8rem', color: '#fca5a5', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.appName}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.message}</div>
                </div>
              ))}
              <button onClick={() => setShowCrashes(true)} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '0.76rem', cursor: 'pointer', padding: 0, marginTop: '4px' }}>
                View all {crashes.length} →
              </button>
            </div>
          )}

          {/* Recent PR Previews */}
          {prPreviews.length > 0 && (
            <div style={{ background: 'rgba(20,24,32,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: '10px' }}>Recent Previews</div>
              {prPreviews.map((pr, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: pr.status === 'online' ? 'var(--success)' : 'var(--danger)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', color: '#f0f4f8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pr.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>PR Preview</div>
                  </div>
                  <a href={`https://${pr.domain}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-color)', fontSize: '0.72rem', flexShrink: 0 }}>↗</a>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* ── Main Content ── */}
        <main style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '600' }}>
              Projects <span style={{ color: 'var(--text-secondary)', fontWeight: '400', fontSize: '0.9rem' }}>({filteredApps.length})</span>
            </h2>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
              <Activity className="animate-spin" size={28} color="var(--accent-color)" />
            </div>
          ) : filteredApps.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-secondary)' }}>
              <Server size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
              <p style={{ fontSize: '1rem', marginBottom: '8px' }}>{searchQuery ? 'No projects match your search' : 'No projects deployed yet'}</p>
              {!searchQuery && <button className="btn btn-primary" onClick={() => setShowDeployModal(true)} style={{ marginTop: '12px' }}><Plus size={16} /> Deploy your first app</button>}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
              {filteredApps.map((app, i) => (
                <ProjectCard key={app.name} app={app} onAction={fetchApps} />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* ── Deploy Modal ── */}
      {showDeployModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 500, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)', padding: '20px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}><Plus size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'text-bottom' }} />Deploy New App</h2>
              <button onClick={() => setShowDeployModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1, padding: '4px' }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '8px' }}>
              <button type="button" className={`btn ${deployType === 'local' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, background: deployType === 'local' ? '' : 'transparent', border: 'none' }} onClick={() => setDeployType('local')}>Local Folder</button>
              <button type="button" className={`btn ${deployType === 'github' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, background: deployType === 'github' ? '' : 'transparent', border: 'none' }} onClick={() => setDeployType('github')}>GitHub Repo</button>
              <button type="button" className={`btn ${deployType === 'templates' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, background: deployType === 'templates' ? '' : 'transparent', border: 'none' }} onClick={() => setDeployType('templates')}>Templates</button>
            </div>

            <form onSubmit={async (e) => { await handleDeploy(e); if (!deploying) setShowDeployModal(false); }}>
              {deployType === 'templates' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                  {templates.map(t => (
                    <div key={t.id} onClick={() => {
                      setDeployType(t.type);
                      setFormData(prev => ({ ...prev, installCmd: t.installCmd, buildCmd: t.buildCmd, startCmd: t.startCmd }));
                      setEnvVars(t.envVars.length ? t.envVars : [{ key: '', value: '' }]);
                    }} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '16px', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = t.color; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '1.5rem' }}>{t.icon}</span>
                        <div style={{ fontWeight: '600', fontSize: '1rem' }}>{t.name}</div>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t.description}</div>
                    </div>
                  ))}
                </div>
              )}
              {deployType === 'github' && (
                <>
                  <div className="form-group">
                    <label>GitHub Repository URL</label>
                    <div style={{ position: 'relative' }}>
                      <Globe size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                      <input type="url" placeholder="https://github.com/user/repo" value={formData.githubUrl} onChange={handleGithubUrlChange} style={{ paddingLeft: '40px' }} required />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Branch {fetchingBranches && <span style={{ fontSize: '0.75rem', color: 'var(--accent-color)', marginLeft: '8px' }}>⏳ Fetching...</span>}</label>
                    <div style={{ position: 'relative' }}>
                      <GitBranch size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)', zIndex: 1 }} />
                      {availableBranches.length > 0 ? (
                        <select value={formData.branch} onChange={e => setFormData({...formData, branch: e.target.value})} style={{ paddingLeft: '40px', width: '100%' }} required>
                          {availableBranches.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      ) : (
                        <input type="text" placeholder="main" value={formData.branch} onChange={e => setFormData({...formData, branch: e.target.value})} style={{ paddingLeft: '40px' }} required />
                      )}
                    </div>
                  </div>
                </>
              )}

              <div className="form-group">
                <label>Project Name {deployType === 'github' && '(Optional)'}</label>
                <div style={{ position: 'relative' }}>
                  <Server size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                  <input type="text" placeholder={deployType === 'github' ? 'Auto-generated from URL' : 'e.g. my-awesome-app'} value={formData.name} onChange={e => { const n = e.target.value; const c = n.toLowerCase().replace(/[^a-z0-9-]/g, ''); setFormData(prev => ({ ...prev, name: n, domain: !useCustomDomain && c ? `${c}.subhan.tech` : prev.domain })); }} style={{ paddingLeft: '40px' }} required={deployType === 'local'} />
                </div>
              </div>

              {deployType === 'local' && (
                <div className="form-group">
                  <label>Project Folder Path</label>
                  <div style={{ position: 'relative' }}>
                    <Folder size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                    <input type="text" placeholder="e.g. /home/user/projects/app" value={formData.path} onChange={e => setFormData({...formData, path: e.target.value})} style={{ paddingLeft: '40px' }} required />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Domain</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer', margin: 0, color: useCustomDomain ? 'var(--accent-color)' : 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={useCustomDomain} onChange={(e) => setUseCustomDomain(e.target.checked)} style={{ width: 'auto', margin: 0 }} /> Use Custom Domain
                  </label>
                </label>
                <div style={{ position: 'relative' }}>
                  <Globe size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                  <input type="text" placeholder="e.g. app.subhan.tech" value={formData.domain} onChange={e => setFormData({...formData, domain: e.target.value})} style={{ paddingLeft: '40px' }} required />
                </div>
              </div>

              {deployType === 'github' && (
                <div className="form-group">
                  <button type="button" className="btn btn-secondary" style={{ width: '100%', fontSize: '0.8rem', padding: '6px' }} onClick={() => setShowAdvanced(!showAdvanced)}>
                    <Settings size={14} /> {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
                  </button>
                </div>
              )}

              {deployType === 'github' && showAdvanced && (
                <div style={{ padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', marginBottom: '16px' }}>
                  {githubToken ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', marginBottom: '12px' }}>
                      <CheckCircle size={16} color="var(--success)" />
                      <span style={{ fontSize: '0.82rem', color: 'var(--success)' }}>GitHub connected as <strong>{githubUser?.login}</strong></span>
                    </div>
                  ) : (
                    <div className="form-group">
                      <label>GitHub PAT (For Private Repos)</label>
                      <input type="password" placeholder="ghp_..." value={formData.githubPat} onChange={e => setFormData({...formData, githubPat: e.target.value})} />
                    </div>
                  )}
                  <div className="form-group"><label>Install Command</label><input type="text" placeholder="npm install" value={formData.installCmd} onChange={e => setFormData({...formData, installCmd: e.target.value})} /></div>
                  <div className="form-group"><label>Build Command</label><input type="text" placeholder="npm run build" value={formData.buildCmd} onChange={e => setFormData({...formData, buildCmd: e.target.value})} /></div>
                  <div className="form-group"><label>Start Command</label><input type="text" placeholder="npm start" value={formData.startCmd} onChange={e => setFormData({...formData, startCmd: e.target.value})} /></div>
                  <div className="form-group">
                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>🔐 Env Variables</span>
                      <button type="button" onClick={() => setEnvVars([...envVars, { key: '', value: '' }])} style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ Add</button>
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                      {envVars.map((ev, i) => (
                        <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <input type="text" placeholder="KEY" value={ev.key} onChange={e => { const u=[...envVars]; u[i]={...u[i],key:e.target.value}; setEnvVars(u); }} style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }} />
                          <span style={{ color: 'var(--text-secondary)' }}>=</span>
                          <input type="text" placeholder="value" value={ev.value} onChange={e => { const u=[...envVars]; u[i]={...u[i],value:e.target.value}; setEnvVars(u); }} style={{ flex: 2, fontFamily: 'monospace', fontSize: '0.8rem' }} />
                          <button type="button" onClick={() => setEnvVars(envVars.filter((_,j)=>j!==i))} style={{ background:'var(--danger)',color:'#fff',border:'none',borderRadius:'4px',padding:'4px 8px',cursor:'pointer',fontSize:'0.75rem' }}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Target Server</label>
                <div style={{ position: 'relative' }}>
                  <HardDrive size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                  <select value={formData.serverId} onChange={e => setFormData({...formData, serverId: e.target.value})} style={{ paddingLeft: '40px', width: '100%', appearance: 'none' }} required>
                    <option value="local">Localhost (This Server)</option>
                    {servers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.host})</option>)}
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: '12px', top: '14px', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={deploying}>
                {deploying ? '⏳ Deploying...' : 'Deploy App'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* GitHub Connect modal */}
      {showGithubConnect && (
        <GitHubConnect
          onConnected={(token, user) => { setGithubToken(token); setGithubUser(user); setShowGithubConnect(false); }}
          onClose={() => setShowGithubConnect(false)}
        />
      )}

      {/* Deployment Logs Modal */}
      {(deploying || deployLogs) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
          <div className="glass-panel" style={{ width: '90%', maxWidth: '820px', height: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                {deploying ? <Activity className="animate-spin" size={20} color="var(--accent-color)" /> : '✅'}
                {deploying ? 'Deployment In Progress' : 'Deployment Complete'}
              </h2>
              {!deploying && <button onClick={() => setDeployLogs('')} className="btn btn-secondary">Close</button>}
            </div>
            <pre style={{ flex: 1, background: '#0d1117', color: '#c9d1d9', padding: '16px', borderRadius: '8px', overflowY: 'auto', fontFamily: '"Fira Code", monospace', fontSize: '0.82rem', margin: 0, whiteSpace: 'pre-wrap' }}>
              {deployLogs}
            </pre>
          </div>
        </div>
      )}

      {/* Secrets Vault Modal */}
      {showSecretsVault && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
          <div className="glass-panel" style={{ width: '90%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2><Key size={20} style={{display:'inline',verticalAlign:'text-bottom'}}/> Secrets Vault</h2>
              <button onClick={() => setShowSecretsVault(false)} style={{ background:'none',border:'none',color:'var(--text-secondary)',cursor:'pointer',fontSize:'1.2rem' }}>✕</button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>Define global API keys and secrets here. You can inject these into any deployed app.</p>
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
              {Object.keys(globalSecrets).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>No global secrets defined yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(globalSecrets).map(([key, value]) => (
                    <div key={key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(255,255,255,0.05)', padding:'10px 12px', borderRadius:'8px' }}>
                      <div style={{ fontFamily:'monospace', fontSize:'0.9rem' }}>{key}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                        <div style={{ fontFamily:'monospace', fontSize:'0.8rem', color:'var(--text-secondary)' }}>{value}</div>
                        <button onClick={async () => { if(confirm(`Delete secret ${key}?`)) { await api.deleteSecret(key); fetchSecrets(); } }} style={{ background:'none',border:'none',color:'var(--danger)',cursor:'pointer',padding:0 }}><Trash2 size={14}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <form onSubmit={async (e) => { e.preventDefault(); const key=e.target.elements.key.value.trim(); const val=e.target.elements.val.value.trim(); if(key&&val){await api.saveSecret(key,val);e.target.reset();fetchSecrets();}}} style={{ display:'flex', gap:'8px' }}>
              <input name="key" type="text" placeholder="KEY_NAME" required style={{ flex:1, fontFamily:'monospace' }} />
              <input name="val" type="password" placeholder="Value" required style={{ flex:2, fontFamily:'monospace' }} />
              <button type="submit" className="btn btn-primary" style={{ padding:'8px 16px' }}>Add</button>
            </form>
          </div>
        </div>
      )}

      {/* Databases Modal */}
      {showDatabases && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
          <div className="glass-panel" style={{ width: '90%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2><Database size={20} style={{display:'inline',verticalAlign:'text-bottom'}}/> Databases</h2>
              <button onClick={() => setShowDatabases(false)} style={{ background:'none',border:'none',color:'var(--text-secondary)',cursor:'pointer',fontSize:'1.2rem' }}>✕</button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>One-click standalone Docker databases. Credentials will be auto-saved to Global Secrets.</p>
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
              {databases.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>No databases running.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {databases.map((db) => (
                    <div key={db.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(255,255,255,0.05)', padding:'10px 12px', borderRadius:'8px' }}>
                      <div>
                        <div style={{ fontWeight: 'bold' }}>{db.name} <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'normal', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px' }}>{db.type}</span></div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Port: {db.port} | Status: <span style={{ color: db.status === 'running' ? 'var(--success)' : 'var(--danger)' }}>{db.status}</span></div>
                      </div>
                      <button onClick={async () => { if(confirm(`Delete database ${db.name}? Data will be lost.`)) { await api.deleteDatabase(db.id); fetchDatabases(); } }} className="btn btn-danger" style={{ padding: '6px 10px' }}><Trash2 size={14}/></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <form onSubmit={async (e) => { e.preventDefault(); const name=e.target.elements.name.value.trim(); const type=e.target.elements.type.value; if(name&&type){await api.createDatabase(type,name);e.target.reset();fetchDatabases();}}} style={{ display:'flex', gap:'8px' }}>
              <select name="type" style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '8px', borderRadius: '4px' }}>
                <option value="postgres">PostgreSQL</option>
                <option value="mysql">MySQL</option>
                <option value="redis">Redis</option>
              </select>
              <input name="name" type="text" placeholder="DB Name (e.g., myapp_db)" required style={{ flex:2 }} />
              <button type="submit" className="btn btn-primary" style={{ padding:'8px 16px' }}>Create</button>
            </form>
          </div>
        </div>
      )}

      {/* Servers Modal */}
      {showServers && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
          <div className="glass-panel" style={{ width: '90%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2><HardDrive size={20} style={{display:'inline',verticalAlign:'text-bottom'}}/> Remote Servers</h2>
              <button onClick={() => setShowServers(false)} style={{ background:'none',border:'none',color:'var(--text-secondary)',cursor:'pointer',fontSize:'1.2rem' }}>✕</button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>Manage remote SSH servers to deploy applications across your fleet.</p>
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
              {servers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>No remote servers added.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {servers.map((srv) => (
                    <div key={srv.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(255,255,255,0.05)', padding:'10px 12px', borderRadius:'8px' }}>
                      <div>
                        <div style={{ fontWeight: 'bold' }}>{srv.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{srv.host} | Status: <span style={{ color: srv.status === 'online' ? 'var(--success)' : 'var(--danger)' }}>{srv.status}</span></div>
                      </div>
                      <button onClick={async () => { if(confirm(`Remove server ${srv.name}?`)) { await api.deleteServer(srv.id); fetchServers(); } }} className="btn btn-danger" style={{ padding: '6px 10px' }}><Trash2 size={14}/></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <form onSubmit={async (e) => { e.preventDefault(); const el=e.target.elements; try{ await api.addServer({name:el.name.value, host:el.host.value, username:el.user.value, privateKey:el.key.value}); e.target.reset(); fetchServers(); }catch(err){alert(err.message)} }} style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input name="name" type="text" placeholder="Alias (e.g., prod-server-1)" required style={{ flex:1 }} />
                <input name="host" type="text" placeholder="IP Address / Hostname" required style={{ flex:1 }} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input name="user" type="text" placeholder="Username (e.g., root)" required style={{ width: '150px' }} />
                <textarea name="key" placeholder="SSH Private Key (-----BEGIN PRIVATE KEY-----...)" required style={{ flex:1, height: '60px', fontFamily: 'monospace', fontSize: '0.8rem' }} />
              </div>
              <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-end', padding:'8px 16px' }}>Add Server</button>
            </form>
          </div>
        </div>
      )}

      {/* Crashes Modal */}
      {showCrashes && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
          <div className="glass-panel" style={{ width:'90%', maxWidth:'800px', height:'80vh', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
              <h2><Bell size={20} style={{display:'inline',verticalAlign:'text-bottom'}}/> Crash Reports</h2>
              <button onClick={() => setShowCrashes(false)} style={{ background:'none',border:'none',color:'var(--text-secondary)',cursor:'pointer',fontSize:'1.2rem' }}>✕</button>
            </div>
            <div style={{ flex:1, overflowY:'auto' }}>
              {crashes.length === 0 ? (
                <div style={{ textAlign:'center', padding:'24px', color:'var(--text-secondary)' }}>No crashes recorded! 🎉</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                  {crashes.map((crash) => (
                    <div key={crash.id} style={{ background:'rgba(255,0,0,0.1)', border:'1px solid rgba(255,0,0,0.3)', borderRadius:'8px', padding:'12px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                          <span style={{ fontWeight:'bold', color:'#f87171' }}>{crash.appName}</span>
                          <span style={{ fontSize:'0.8rem', background:'rgba(255,255,255,0.1)', padding:'2px 6px', borderRadius:'4px' }}>{crash.type}</span>
                        </div>
                        <span style={{ fontSize:'0.8rem', color:'var(--text-secondary)' }}>{new Date(crash.timestamp).toLocaleString()}</span>
                      </div>
                      <div style={{ fontFamily:'monospace', fontSize:'0.85rem', color:'#ff7b7b', marginBottom:'8px' }}>{crash.message}</div>
                      <pre style={{ background:'rgba(0,0,0,0.4)', padding:'8px', borderRadius:'4px', fontSize:'0.75rem', overflowX:'auto', margin:0, color:'#c9d1d9' }}>{crash.stack}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Vercel-style Full Project Dashboard Modal ──────────────────────────────
function ProjectDashboardModal({ app, onAction, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [logs, setLogs] = useState(null);
  const [history, setHistory] = useState(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [logSearch, setLogSearch] = useState('');

  // Live build logs state
  const [liveLogsOpen, setLiveLogsOpen] = useState(false);
  const [liveLogs, setLiveLogs] = useState('');
  const [liveLogsDone, setLiveLogsDone] = useState(false);
  const liveLogsRef = useRef(null);

  // Env vars state
  const [envVars, setEnvVars] = useState(null);
  const [envSaving, setEnvSaving] = useState(false);
  const [envMsg, setEnvMsg] = useState('');

  // Metrics state
  const [metrics, setMetrics] = useState([]);

  // Cache clear state
  const [cacheBusy, setCacheBusy] = useState(false);
  const [cacheMsg, setCacheMsg] = useState('');

  // Discord test state
  const [discordBusy, setDiscordBusy] = useState(false);
  const [discordMsg, setDiscordMsg] = useState('');

  // Cron jobs state
  const [cronJobs, setCronJobs] = useState(null);
  const [newCron, setNewCron] = useState({ expression: '', type: 'restart', command: '' });

  // Backup state
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState('');

  useEffect(() => {
    if (liveLogsRef.current) {
      liveLogsRef.current.scrollTop = liveLogsRef.current.scrollHeight;
    }
  }, [liveLogs]);

  useEffect(() => {
    if (activeTab === 'deployments' && !history) fetchHistory();
    if (activeTab === 'logs' && !logs) fetchLogs();
    if (activeTab === 'environment' && !envVars) fetchEnvVars();
    if (activeTab === 'overview' && metrics.length === 0) fetchMetrics();
    if (activeTab === 'settings' && !cronJobs) fetchCronJobs();
  }, [activeTab]);

  const fetchEnvVars = async () => {
    try {
      const data = await api.getEnvVars(app.name);
      // Convert object to array of {key, value} for editing
      setEnvVars(Object.entries(data.vars || {}).map(([key, value]) => ({ key, value })));
    } catch (e) { setEnvVars([]); }
  };

  const fetchMetrics = async () => {
    try {
      const data = await api.getMetrics(app.name);
      setMetrics(data.metrics || []);
    } catch (e) {}
  };

  const fetchCronJobs = async () => {
    try {
      const data = await api.getCronJobs(app.name);
      setCronJobs(data.jobs || []);
    } catch (e) { setCronJobs([]); }
  };

  const handleSaveEnv = async () => {
    setEnvSaving(true); setEnvMsg('');
    try {
      const vars = {};
      (envVars || []).forEach(({ key, value }) => { if (key.trim()) vars[key.trim()] = value; });
      const res = await api.saveEnvVars(app.name, vars);
      setEnvMsg('✅ ' + res.message);
    } catch (e) { setEnvMsg('❌ ' + e.message); }
    finally { setEnvSaving(false); }
  };

  const handleClearCache = async () => {
    if (!confirm('This will delete node_modules, dist, .next etc. and you will need to redeploy. Continue?')) return;
    setCacheBusy(true); setCacheMsg('');
    try {
      const res = await api.clearCache(app.name);
      setCacheMsg('✅ ' + res.message);
    } catch (e) { setCacheMsg('❌ ' + e.message); }
    finally { setCacheBusy(false); }
  };

  const handleTestDiscord = async () => {
    setDiscordBusy(true); setDiscordMsg('');
    try {
      const res = await api.testDiscordNotification();
      setDiscordMsg('✅ ' + res.message);
    } catch (e) { setDiscordMsg('❌ ' + e.message); }
    finally { setDiscordBusy(false); }
  };

  // SVG sparkline helper
  const Sparkline = ({ data, color, label }) => {
    if (!data || data.length < 2) return <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Collecting data...</div>;
    const vals = data.map(d => d[label] || 0);
    const max = Math.max(...vals, 1);
    const W = 200, H = 50;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - (v / max) * H}`).join(' ');
    const current = vals[vals.length - 1];
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <svg width={W} height={H} style={{ overflow: 'visible' }}>
          <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} />
          <circle cx={(vals.length - 1) / (vals.length - 1) * W} cy={H - (vals[vals.length-1] / max) * H} r="3" fill={color} />
        </svg>
        <span style={{ fontSize: '0.85rem', fontWeight: '600', color }}>
          {label === 'memory' ? `${(current / (1024*1024)).toFixed(1)} MB` : `${current.toFixed(1)}%`}
        </span>
      </div>
    );
  };

  const fetchLogs = async () => {
    try {
      const data = await api.getLogs(app.name);
      setLogs(data);
    } catch (err) {
      console.error('Failed to get logs', err);
    }
  };

  const fetchHistory = async () => {
    try {
      const data = await api.getHistory(app.domain);
      setHistory(data);
    } catch (err) {
      console.error('Failed to get history', err);
    }
  };

  const handleAction = async (action) => {
    if (action === 'redeploy') {
      setLiveLogs(`🚀 Starting zero-downtime redeploy for "${app.name}"...\n`);
      setLiveLogsDone(false);
      setLiveLogsOpen(true);
      setLoadingAction(true);
      try {
        await api.redeployApp(app.name, (msg) => setLiveLogs(prev => prev + msg));
        setLiveLogs(prev => prev + '\n✅ Done! App is live.\n');
        onAction();
      } catch (err) {
        setLiveLogs(prev => prev + `\n❌ Error: ${err.message}\n`);
      } finally {
        setLiveLogsDone(true);
        setLoadingAction(false);
      }
      return;
    }
    setLoadingAction(true);
    try {
      await api.actionApp(app.name, action);
      onAction();
      if (action === 'delete') onClose();
    } catch (err) {
      alert(`Error trying to ${action} app: ` + err.message);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleRollback = async (commit) => {
    if (!confirm(`Are you sure you want to rollback to commit ${commit}?`)) return;
    setLoadingAction(true);
    try {
      await api.rollback(app.domain, commit);
      alert('Rollback successful!');
      onAction();
      fetchHistory();
    } catch (err) {
      alert('Rollback failed: ' + err.message);
    } finally {
      setLoadingAction(false);
    }
  };

  const renderFilteredLogs = (text) => {
    if (!text) return 'No output logs';
    const lines = text.split('\n');
    const filtered = lines.filter(l => l.toLowerCase().includes(logSearch.toLowerCase()));
    
    return filtered.map((line, i) => {
      let color = '#c9d1d9';
      if (line.includes('ERROR') || line.includes('Error')) color = '#ff7b7b';
      else if (line.includes('WARN')) color = '#ffa657';
      else if (line.includes('INFO')) color = '#79c0ff';
      return <div key={i} style={{ color, fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: '1.4' }}>{line}</div>;
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)', padding: '24px' }} onClick={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '1200px', height: '100%', maxHeight: '90vh', background: 'var(--bg-color)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                {app.name}
                {app.isPR && <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'var(--accent-color)', color: 'white', borderRadius: '4px', fontWeight: 'bold' }}>PR PREVIEW</span>}
              </h2>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                <a href={`https://${app.domain}`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{app.domain}</a>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {app.deployType === 'github' && (
              <a href={app.githubUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}>
                <Code2 size={14} /> Repository
              </a>
            )}
            {app.status === 'online' && (
              <a href={`https://${app.domain}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}>
                Visit <ExternalLink size={14} />
              </a>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', padding: '4px', marginLeft: '8px' }}>
              <X size={20} />
            </button>
          </div>
        </div>
        
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Sidebar */}
          <div style={{ width: '220px', borderRight: '1px solid rgba(255,255,255,0.08)', padding: '24px 0', background: 'rgba(0,0,0,0.2)' }}>
            {['overview', 'environment', 'deployments', 'logs', 'settings'].map(tab => (
              <button 
                key={tab} 
                onClick={() => setActiveTab(tab)}
                style={{ 
                  display: 'block', width: '100%', textAlign: 'left', padding: '10px 32px',
                  background: activeTab === tab ? 'rgba(255,255,255,0.05)' : 'transparent',
                  border: 'none', color: activeTab === tab ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer', fontSize: '0.9rem', borderLeft: activeTab === tab ? '2px solid var(--accent-color)' : '2px solid transparent',
                  transition: 'all 0.1s'
                }}
              >
                {tab === 'environment' ? 'Environment' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          
          {/* Content Area */}
          <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
            
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="animate-fade-in">
                <h3 style={{ marginTop: 0, marginBottom: '24px', fontWeight: '500', fontSize: '1.2rem' }}>Production Deployment</h3>
                <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden', background: 'rgba(255,255,255,0.01)' }}>
                  {/* Thumbnail side (Live iframe scaled down) */}
                  <div style={{ flex: '0 0 45%', borderRight: '1px solid rgba(255,255,255,0.08)', background: '#0a0a0a', position: 'relative', minHeight: '340px', overflow: 'hidden' }}>
                    {app.status === 'online' ? (
                      <iframe 
                        src={`https://${app.domain}`} 
                        style={{ 
                          position: 'absolute', top: 0, left: 0,
                          width: '200%', height: '200%', 
                          transform: 'scale(0.5)', transformOrigin: 'top left', 
                          border: 'none', pointerEvents: 'none',
                          background: '#fff' // Many sites assume white background
                        }} 
                      />
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                        App is offline
                      </div>
                    )}
                  </div>
                  {/* Details side */}
                  <div style={{ flex: 1, padding: '32px' }}>
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Deployment</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{app.name}-production</div>
                    </div>
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Domains</div>
                      <a href={`https://${app.domain}`} target="_blank" rel="noopener noreferrer" style={{ color: '#fff', fontSize: '0.9rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {app.domain} <ExternalLink size={12} color="var(--text-secondary)" />
                      </a>
                    </div>
                    <div style={{ display: 'flex', gap: '48px', marginBottom: '24px' }}>
                      <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Status</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: app.status === 'online' ? 'var(--success)' : app.status === 'errored' ? 'var(--danger)' : '#8b949e', boxShadow: app.status === 'online' ? '0 0 8px var(--success)' : 'none' }} />
                          {app.status === 'online' ? 'Ready' : app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                        </div>
                      </div>
                      {app.deployType === 'github' && (
                        <div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Source</div>
                          <div style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'monospace', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>
                            <GitBranch size={12} /> {app.branch || 'main'}
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Resource Monitoring Mini Charts */}
                    {metrics.length > 1 && (
                      <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>Resource Usage (last 30 min)</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>CPU</div>
                            <Sparkline data={metrics} color="#3b82f6" label="cpu" />
                          </div>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Memory</div>
                            <Sparkline data={metrics} color="#10b981" label="memory" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ENVIRONMENT TAB */}
            {activeTab === 'environment' && (
              <div className="animate-fade-in">
                <h3 style={{ marginTop: 0, marginBottom: '8px', fontWeight: '500', fontSize: '1.2rem' }}>Environment Variables</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px' }}>Changes are saved to <code>.env</code> and the app is automatically restarted.</p>
                {!envVars ? (
                  <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
                ) : (
                  <div>
                    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '8px 16px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '500' }}>
                        <span>Key</span><span>Value</span><span></span>
                      </div>
                      {envVars.map((ev, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                          <input value={ev.key} onChange={e => { const n=[...envVars]; n[i]={...n[i],key:e.target.value}; setEnvVars(n); }}
                            placeholder="KEY" style={{ background:'transparent', border:'none', borderRight:'1px solid rgba(255,255,255,0.06)', padding:'10px 16px', color:'#fff', fontFamily:'monospace', outline:'none', fontSize:'0.85rem' }} />
                          <input value={ev.value} onChange={e => { const n=[...envVars]; n[i]={...n[i],value:e.target.value}; setEnvVars(n); }}
                            type="text" placeholder="value" style={{ background:'transparent', border:'none', borderRight:'1px solid rgba(255,255,255,0.06)', padding:'10px 16px', color:'#fff', fontFamily:'monospace', outline:'none', fontSize:'0.85rem' }} />
                          <button onClick={() => setEnvVars(envVars.filter((_,j)=>j!==i))} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', padding:'0 12px', fontSize:'1rem' }}>×</button>
                        </div>
                      ))}
                      <button onClick={() => setEnvVars([...envVars, {key:'',value:''}])} style={{ width:'100%', background:'transparent', border:'none', color:'var(--text-secondary)', padding:'10px 16px', cursor:'pointer', textAlign:'left', fontSize:'0.85rem' }}>+ Add Variable</button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button onClick={handleSaveEnv} disabled={envSaving} className="btn btn-primary" style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                        <Save size={14}/> {envSaving ? 'Saving...' : 'Save & Restart'}
                      </button>
                      {envMsg && <span style={{ fontSize:'0.85rem' }}>{envMsg}</span>}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* DEPLOYMENTS TAB */}
            {activeTab === 'deployments' && (
              <div className="animate-fade-in">
                <h3 style={{ marginTop: 0, marginBottom: '24px', fontWeight: '500', fontSize: '1.2rem', display: 'flex', justifyContent: 'space-between' }}>
                  Deployments
                  {app.deployType === 'github' && (
                    <button onClick={() => handleAction('redeploy')} disabled={loadingAction} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {loadingAction ? <Activity size={14} className="animate-spin" /> : <Plus size={14} />} Redeploy
                    </button>
                  )}
                </h3>
                
                <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ padding: '12px 16px', fontSize: '0.8rem', fontWeight: '500', color: 'var(--text-secondary)' }}>Project</th>
                        <th style={{ padding: '12px 16px', fontSize: '0.8rem', fontWeight: '500', color: 'var(--text-secondary)' }}>Status</th>
                        <th style={{ padding: '12px 16px', fontSize: '0.8rem', fontWeight: '500', color: 'var(--text-secondary)' }}>Branch/Commit</th>
                        <th style={{ padding: '12px 16px', fontSize: '0.8rem', fontWeight: '500', color: 'var(--text-secondary)' }}>Date</th>
                        <th style={{ padding: '12px 16px', fontSize: '0.8rem', fontWeight: '500', color: 'var(--text-secondary)' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!history || history.length === 0) ? (
                        <tr>
                          <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No deployment history available.
                          </td>
                        </tr>
                      ) : (
                        history.map((record, i) => (
                          <tr key={record.id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: '16px', fontSize: '0.9rem' }}>{app.name}</td>
                            <td style={{ padding: '16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: record.status === 'success' ? 'var(--success)' : 'var(--danger)' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: record.status === 'success' ? 'var(--success)' : 'var(--danger)' }} />
                                {record.status === 'success' ? 'Ready' : 'Error'}
                              </div>
                            </td>
                            <td style={{ padding: '16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                                <GitBranch size={12} color="var(--text-secondary)" />
                                {app.branch || 'main'}
                                {record.commitHash && record.commitHash !== 'unknown' && (
                                  <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', marginLeft: '4px' }}>({record.commitHash.substring(0, 7)})</span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                              {new Date(record.timestamp).toLocaleDateString()}
                            </td>
                            <td style={{ padding: '16px' }}>
                              {record.commitHash && record.commitHash !== 'unknown' && record.status === 'success' && (
                                <button 
                                  onClick={() => handleRollback(record.commitHash)}
                                  className="btn btn-secondary"
                                  style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)' }}
                                  disabled={loadingAction}
                                >
                                  Rollback
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* LOGS TAB */}
            {activeTab === 'logs' && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontWeight: '500', fontSize: '1.2rem' }}>Runtime Logs</h3>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <Search size={14} style={{ marginRight: '8px', color: 'var(--text-secondary)' }} />
                    <input 
                      type="text" 
                      placeholder="Filter logs..." 
                      value={logSearch}
                      onChange={e => setLogSearch(e.target.value)}
                      style={{ background: 'transparent', border: 'none', color: '#fff', outline: 'none', fontSize: '0.85rem', width: '200px' }}
                    />
                  </div>
                </div>
                
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ flex: 1, background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Standard Output</div>
                    <pre style={{ flex: 1, overflowY: 'auto', padding: '16px', margin: 0 }}>
                      {logs ? renderFilteredLogs(logs.out) : <span style={{ color: 'var(--text-secondary)' }}>Loading logs...</span>}
                    </pre>
                  </div>
                  {logs && logs.err && logs.err.trim() && (
                    <div style={{ flex: 1, background: '#1a0505', border: '1px solid rgba(255,0,0,0.2)', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ padding: '8px 16px', background: 'rgba(255,0,0,0.1)', borderBottom: '1px solid rgba(255,0,0,0.2)', fontSize: '0.8rem', color: '#ff7b7b' }}>Error Output</div>
                      <pre style={{ flex: 1, overflowY: 'auto', padding: '16px', margin: 0 }}>
                        {renderFilteredLogs(logs.err)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SETTINGS TAB */}
            {activeTab === 'settings' && (
              <div className="animate-fade-in">
                <h3 style={{ marginTop: 0, marginBottom: '24px', fontWeight: '500', fontSize: '1.2rem' }}>Project Settings</h3>
                
                {/* App Controls */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '24px', marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem' }}>Application Controls</h4>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {app.status !== 'online' ? (
                      <button className="btn btn-primary" onClick={() => handleAction('start')} disabled={loadingAction} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Play size={16} /> Start
                      </button>
                    ) : (
                      <button className="btn btn-secondary" onClick={() => handleAction('stop')} disabled={loadingAction} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Square size={16} /> Stop
                      </button>
                    )}
                    <button className="btn btn-secondary" onClick={() => handleAction('restart')} disabled={loadingAction} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <RotateCw size={16} /> Restart
                    </button>
                  </div>
                </div>

                {/* Webhook Push-to-Deploy */}
                {app.deployType === 'github' && (
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '24px', marginBottom: '16px' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>Push-to-Deploy Webhook</h4>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>Add this URL to your GitHub repo → Settings → Webhooks → Payload URL. Auto-redeploys on every push to <code>{app.branch || 'main'}</code>.</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '10px 14px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'monospace', fontSize: '0.82rem' }}>
                      <span style={{ flex: 1, wordBreak: 'break-all' }}>https://api.subhan.tech/webhook/{app.name}</span>
                      <button onClick={() => navigator.clipboard.writeText(`https://api.subhan.tech/webhook/${app.name}`)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }} title="Copy">
                        <Copy size={14} />
                      </button>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '8px', marginBottom: 0 }}>Set Content-Type to <code>application/json</code>. Optionally add a secret as <code>WEBHOOK_SECRET_{app.name.toUpperCase()}</code> in Secrets Vault.</p>
                  </div>
                )}

                {/* Clear Cache */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '24px', marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>Build Cache</h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>Delete <code>node_modules</code>, <code>dist</code>, <code>.next</code> and other build artifacts. You'll need to redeploy afterwards for a completely fresh build.</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button onClick={handleClearCache} disabled={cacheBusy} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Trash2 size={14} /> {cacheBusy ? 'Clearing...' : 'Clear Cache'}
                    </button>
                    {cacheMsg && <span style={{ fontSize: '0.85rem' }}>{cacheMsg}</span>}
                  </div>
                </div>

                {/* Discord Notifications */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '24px', marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>🔔 Discord Notifications</h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>Get deployment alerts in Discord. Save your Discord Webhook URL as <code>DISCORD_WEBHOOK_URL</code> in the Secrets Vault (top navbar), then test it below.</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button onClick={handleTestDiscord} disabled={discordBusy} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Bell size={14} /> {discordBusy ? 'Sending...' : 'Send Test Notification'}
                    </button>
                    {discordMsg && <span style={{ fontSize: '0.85rem' }}>{discordMsg}</span>}
                  </div>
                </div>

                {/* S3 Backups */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '24px', marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>☁️ S3 Backups</h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>Zip and upload the project directory to an S3-compatible storage bucket. Requires S3 secrets in the Global Vault.</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button onClick={async () => {
                      setBackupBusy(true); setBackupMsg('');
                      try {
                        const res = await api.triggerBackup(app.name);
                        setBackupMsg(`Success! Saved as: ${res.key}`);
                      } catch(e) { setBackupMsg(`Error: ${e.message}`); }
                      finally { setBackupBusy(false); }
                    }} disabled={backupBusy} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Save size={14} /> {backupBusy ? 'Backing up...' : 'Create Backup Now'}
                    </button>
                    {backupMsg && <span style={{ fontSize: '0.85rem', color: backupMsg.includes('Error') ? 'var(--danger)' : 'var(--success)' }}>{backupMsg}</span>}
                  </div>
                </div>

                {/* Scheduled Tasks (Cron) */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '24px', marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>⏰ Scheduled Tasks (Cron Jobs)</h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>Run arbitrary commands or auto-restart this project on a cron schedule.</p>
                  
                  {cronJobs && cronJobs.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                      {cronJobs.map(job => (
                        <div key={job.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '10px 14px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div>
                            <div style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--accent-color)' }}>{job.expression}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              {job.type === 'restart' ? 'Restart PM2 Process' : `Run Command: ${job.command}`}
                            </div>
                          </div>
                          <button onClick={async () => { await api.deleteCronJob(app.name, job.id); fetchCronJobs(); }} className="btn btn-danger" style={{ padding: '6px 10px' }}><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}

                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newCron.expression) return;
                    await api.addCronJob(app.name, newCron);
                    setNewCron({ expression: '', type: 'restart', command: '' });
                    fetchCronJobs();
                  }} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <input type="text" placeholder="0 0 * * *" value={newCron.expression} onChange={e => setNewCron({...newCron, expression: e.target.value})} required style={{ width: '120px', fontFamily: 'monospace' }} />
                    <select value={newCron.type} onChange={e => setNewCron({...newCron, type: e.target.value})} style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '10px 14px', borderRadius: '8px' }}>
                      <option value="restart">Restart</option>
                      <option value="command">Run Command</option>
                    </select>
                    {newCron.type === 'command' && (
                      <input type="text" placeholder="npm run db:backup" value={newCron.command} onChange={e => setNewCron({...newCron, command: e.target.value})} required style={{ flex: 1 }} />
                    )}
                    <button type="submit" className="btn btn-primary" style={{ padding: '10px 16px' }}>Add Job</button>
                  </form>
                </div>

                {/* Danger Zone */}
                <div style={{ background: 'rgba(255,0,0,0.05)', border: '1px solid rgba(255,0,0,0.2)', borderRadius: '8px', padding: '24px' }}>
                  <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#ff7b7b' }}>Danger Zone</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Permanently delete this project. This action cannot be undone.
                  </p>
                  <button className="btn btn-danger" onClick={() => {
                    if (confirm(`Are you absolutely sure you want to delete ${app.name}?`)) {
                      handleAction('delete');
                    }
                  }} disabled={loadingAction} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Trash2 size={16} /> Delete Project
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Live Build Logs Modal (Overlay inside the dashboard) */}
        {liveLogsOpen && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.6)', zIndex: 2000,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            backdropFilter: 'blur(4px)', animation: 'fadeIn 0.2s ease'
          }}>
            <div style={{
              width: '92%', maxWidth: '1000px', height: '85vh',
              display: 'flex', flexDirection: 'column', background: '#ffffff',
              border: '1px solid #eaeaea', borderRadius: '8px',
              overflow: 'hidden', boxShadow: '0 25px 80px rgba(0,0,0,0.15)',
              color: '#111'
            }}>
              {/* Vercel Header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px 20px', borderBottom: '1px solid #eaeaea', background: '#fafafa'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
                  <ChevronDown size={16} color="#666" />
                  Build Logs
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#666' }}>
                    {liveLogsDone ? '12s' : 'Building...'}
                    <div style={{
                      width: '18px', height: '18px', borderRadius: '50%',
                      background: liveLogsDone ? '#0070f3' : '#ccc', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {liveLogsDone ? <Check size={12} strokeWidth={3} /> : <Activity size={10} className="animate-spin" />}
                    </div>
                  </div>
                  {liveLogsDone && (
                    <button onClick={() => setLiveLogsOpen(false)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '4px', color: '#666', display: 'flex'
                    }}>
                      <X size={18} />
                    </button>
                  )}
                </div>
              </div>

              {/* Vercel Toolbar */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 16px', borderBottom: '1px solid #eaeaea', background: '#fff'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#666' }}>
                  <Copy size={14} style={{ cursor: 'pointer' }} onClick={() => navigator.clipboard.writeText(liveLogs)} />
                  {liveLogs.split('\n').filter(l => l.trim()).length} lines
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', background: '#fff',
                  border: '1px solid #eaeaea', borderRadius: '6px', padding: '4px 10px',
                  width: '240px'
                }}>
                  <Search size={14} color="#999" />
                  <input
                    type="text"
                    placeholder="Find in logs"
                    style={{ border: 'none', outline: 'none', marginLeft: '8px', fontSize: '0.8rem', width: '100%', background: 'transparent', color: '#111' }}
                  />
                  <span style={{ fontSize: '0.7rem', color: '#999', background: '#fafafa', padding: '2px 4px', borderRadius: '4px', border: '1px solid #eaeaea' }}>CtrlF</span>
                </div>
              </div>

              {/* Vercel Terminal Output */}
              <div style={{ flex: 1, overflowY: 'auto', background: '#fff', padding: '16px 0' }} ref={liveLogsRef}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: '"Menlo", "Consolas", monospace', fontSize: '0.8rem', lineHeight: '1.6' }}>
                  <tbody>
                    {liveLogs.split('\n').map((line, i) => {
                      if (!line.trim()) return null;
                      
                      let color = '#333';
                      if (/error|fail|❌/i.test(line)) color = '#e00';
                      else if (/warn/i.test(line)) color = '#f5a623';
                      else if (/✅|success|done|complete|✓/i.test(line)) color = '#0070f3';
                      else if (/built in/i.test(line)) color = '#10b981'; // green for 'built in'
                      
                      // Fake timestamp just to mimic Vercel logs if line doesn't have one
                      const now = new Date();
                      const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
                      
                      return (
                        <tr key={i} style={{ display: 'flex', padding: '0 20px' }}>
                          <td style={{ color: '#999', paddingRight: '20px', userSelect: 'none', width: '100px', flexShrink: 0 }}>
                            {ts}
                          </td>
                          <td style={{ color, wordBreak: 'break-word', flex: 1, whiteSpace: 'pre-wrap' }}>
                            {line}
                          </td>
                        </tr>
                      );
                    })}
                    {!liveLogsDone && (
                      <tr style={{ display: 'flex', padding: '0 20px' }}>
                        <td style={{ color: '#999', paddingRight: '20px', width: '100px', flexShrink: 0 }}></td>
                        <td><span style={{ display: 'inline-block', width: '8px', height: '14px', background: '#ccc', animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom' }} /></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Vercel-style compact project card ──────────────────────────────────────
function ProjectCard({ app, onAction }) {
  const [showDetail, setShowDetail] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Generate a deterministic color from the app name
  const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'];
  const color = colors[app.name.charCodeAt(0) % colors.length];
  const initial = app.name[0]?.toUpperCase() || '?';

  const isOnline = app.status === 'online';

  return (
    <>
      <div
        onClick={() => setShowDetail(true)}
        style={{
          background: 'rgba(20,24,32,0.75)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '18px 20px',
          cursor: 'pointer',
          transition: 'border-color 0.2s, transform 0.15s, box-shadow 0.2s',
          position: 'relative',
          overflow: 'hidden',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {/* Header: avatar + name + status */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            {/* Project Logo / Avatar */}
            {(!imgError && app.domain) ? (
              <img 
                src={`https://www.google.com/s2/favicons?domain=${app.domain}&sz=64`} 
                alt={app.name}
                onError={() => setImgError(true)}
                style={{
                  width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
                  background: 'rgba(255,255,255,0.1)', objectFit: 'contain', padding: '2px'
                }}
              />
            ) : (
              <div style={{
                width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
                background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: '700', fontSize: '1rem', color: 'white', letterSpacing: '-0.01em'
              }}>
                {initial}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: '600', fontSize: '0.95rem', color: '#f0f4f8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {app.name}
                {app.isPR && <span style={{ fontSize: '0.6rem', padding: '1px 5px', background: '#3b82f6', color: 'white', borderRadius: '3px', fontWeight: '700', letterSpacing: '0.04em' }}>PR</span>}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>
                {app.domain}
              </div>
            </div>
          </div>
          {/* Status dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, marginTop: '2px' }}>
            <div className={isOnline && app.healthStatus === 'degraded' ? 'status-dot-offline' : isOnline ? 'status-dot-online' : app.status === 'errored' ? 'status-dot-offline' : ''} style={{ width: '7px', height: '7px', borderRadius: '50%', background: isOnline && app.healthStatus === 'degraded' ? '#f59e0b' : isOnline ? 'var(--success)' : app.status === 'errored' ? 'var(--danger)' : '#6b7280' }} />
            <span style={{ fontSize: '0.72rem', color: isOnline && app.healthStatus === 'degraded' ? '#f59e0b' : isOnline ? 'var(--success)' : 'var(--text-secondary)', fontWeight: '500', textTransform: 'capitalize' }}>
              {isOnline && app.healthStatus === 'degraded' ? 'degraded' : app.status}
            </span>
          </div>
        </div>

        {/* Branch + Port row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          {app.deployType === 'github' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
              <GitBranch size={11} />
              <span>{app.branch || 'main'}</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
            <Server size={11} />
            <span>:{app.port}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
            <Activity size={11} />
            <span>{app.cpu?.toFixed(1)}% CPU</span>
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
            {(app.memory / (1024 * 1024)).toFixed(0)} MB
          </div>
        </div>

        {/* Bottom actions */}
        <div style={{ display: 'flex', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}
          onClick={e => e.stopPropagation()}>
          {isOnline && (
            <a
              href={`https://${app.domain}`}
              target="_blank" rel="noopener noreferrer"
              style={{ flex: 1, textAlign: 'center', padding: '5px', fontSize: '0.76rem', background: 'rgba(59,130,246,0.12)', color: 'var(--accent-color)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '6px', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            >
              <ExternalLink size={11} /> Visit
            </a>
          )}
          <button
            onClick={() => setShowDetail(true)}
            style={{ flex: 1, padding: '5px', fontSize: '0.76rem', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Manage →
          </button>
        </div>
      </div>

      {showDetail && (
        <ProjectDashboardModal app={app} onAction={() => { onAction(); fetchApps(); }} onClose={() => setShowDetail(false)} />
      )}
    </>
  );
}

function GitHubConnect({ onConnected, onClose }) {
  const [step, setStep] = useState('idle'); // idle | waiting | success | error
  const [deviceData, setDeviceData] = useState(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef(null);

  const startFlow = async () => {
    try {
      setStep('loading');
      const data = await api.requestDeviceCode();
      setDeviceData(data);
      setStep('waiting');
      // Open GitHub device page automatically
      window.open(data.verification_uri || 'https://github.com/login/device', '_blank');
      // Start polling
      let pollInterval = (data.interval || 5) * 1000;
      const doPoll = async () => {
        try {
          const result = await api.pollForToken(data.device_code);
          if (result.access_token) {
            clearInterval(pollRef.current);
            // Fetch user info from GitHub
            const userRes = await fetch('https://api.github.com/user', {
              headers: { Authorization: `token ${result.access_token}` }
            });
            const user = await userRes.json();
            localStorage.setItem('gh_token', result.access_token);
            localStorage.setItem('gh_user', JSON.stringify({ login: user.login, avatar_url: user.avatar_url }));
            setStep('success');
            setTimeout(() => onConnected(result.access_token, user), 1200);
          } else if (result.error === 'slow_down') {
            // GitHub asked us to slow down — increase interval
            clearInterval(pollRef.current);
            pollInterval += 5000;
            pollRef.current = setInterval(doPoll, pollInterval);
          } else if (result.error === 'expired_token' || result.error === 'access_denied') {
            clearInterval(pollRef.current);
            setStep('error');
          }
          // For 'authorization_pending' — just keep polling normally
        } catch (err) {
          console.error('Poll error:', err);
          // Don't stop polling on network errors, keep trying
        }
      };
      pollRef.current = setInterval(doPoll, pollInterval);
    } catch (err) {
      console.error('Auth error:', err);
      setStep('error');
    }
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  const copyCode = () => {
    navigator.clipboard.writeText(deviceData?.user_code || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)'
    }}>
      <div className="glass-panel" style={{ width: '380px', maxWidth: '90vw', textAlign: 'center', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>

        <Code2 size={40} style={{ marginBottom: '12px', color: 'var(--accent-color)' }} />
        <h3 style={{ marginBottom: '6px' }}>Connect GitHub Account</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
          Link your GitHub account to deploy private repositories without needing a PAT each time.
        </p>

        {step === 'idle' && (
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={startFlow}>
            <Code2 size={16} /> Connect with GitHub
          </button>
        )}

        {step === 'loading' && (
          <p style={{ color: 'var(--text-secondary)' }}>⏳ Requesting code from GitHub...</p>
        )}

        {step === 'waiting' && deviceData && (
          <div>
            <p style={{ marginBottom: '10px', fontSize: '0.85rem' }}>A new tab has opened. Enter this code on GitHub:</p>
            <div
              onClick={copyCode}
              style={{
                fontSize: '2rem', fontWeight: 'bold', letterSpacing: '8px', fontFamily: 'monospace',
                background: 'rgba(255,255,255,0.07)', borderRadius: '10px', padding: '16px',
                cursor: 'pointer', marginBottom: '12px', userSelect: 'all',
                border: '2px dashed var(--accent-color)'
              }}
            >
              {deviceData.user_code}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              {copied ? '✅ Copied!' : 'Click the code to copy'}
            </p>
            <a href={deviceData.verification_uri || 'https://github.com/login/device'} target="_blank" rel="noopener noreferrer"
              className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none', marginBottom: '16px' }}>
              <ExternalLink size={14} /> Open GitHub Device Page
            </a>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>⏳ Waiting for you to authorize... (auto-detects)</p>
          </div>
        )}

        {step === 'success' && (
          <div>
            <CheckCircle size={48} color="var(--success)" style={{ marginBottom: '12px' }} />
            <p style={{ color: 'var(--success)', fontWeight: 'bold' }}>✅ GitHub Connected!</p>
          </div>
        )}

        {step === 'error' && (
          <div>
            <p style={{ color: 'var(--danger)', marginBottom: '12px' }}>❌ Failed to connect. Please try again.</p>
            <button className="btn btn-primary" onClick={() => setStep('idle')}>Retry</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ServerHealthModal({ onClose }) {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchHealth = async () => {
    try {
      const data = await api.getSystemHealth();
      setHealth(data);
    } catch (err) {
      setError(err.message);
    }
  };

  if (error) return (
    <div className="modal-backdrop" style={{ zIndex: 100 }}>
      <div className="modal glass-panel" style={{ width: '600px' }}>
        <div className="modal-header">
          <h2>💻 Server Health</h2>
          <button className="btn btn-secondary" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ color: 'var(--danger)', padding: '20px' }}>Error loading health data: {error}</div>
      </div>
    </div>
  );

  if (!health) return (
    <div className="modal-backdrop" style={{ zIndex: 100 }}>
      <div className="modal glass-panel" style={{ width: '600px' }}>
        <div className="modal-header">
          <h2>💻 Server Health</h2>
          <button className="btn btn-secondary" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '40px', textAlign: 'center', opacity: 0.5 }}>Loading real-time metrics...</div>
      </div>
    </div>
  );

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderProgressBar = (percent, color = 'var(--primary-color)') => (
    <div style={{ background: 'rgba(255,255,255,0.1)', height: '12px', borderRadius: '6px', overflow: 'hidden', marginTop: '8px' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, percent))}%`, background: color, height: '100%', transition: 'width 0.5s ease' }} />
    </div>
  );

  return (
    <div className="modal-backdrop" style={{ zIndex: 100 }}>
      <div className="modal glass-panel" style={{ width: '600px' }}>
        <div className="modal-header">
          <h2>💻 Server Health</h2>
          <button className="btn btn-secondary" onClick={onClose}><X size={16} /></button>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
          
          <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Cpu size={18} style={{ color: '#00f2fe' }} />
              <h3 style={{ margin: 0 }}>CPU Usage</h3>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{health.cpu.toFixed(1)}%</div>
            {renderProgressBar(health.cpu, '#00f2fe')}
          </div>

          <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Activity size={18} style={{ color: '#4facfe' }} />
              <h3 style={{ margin: 0 }}>Memory Usage</h3>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{health.memory.usagePercent.toFixed(1)}%</div>
            <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>{formatBytes(health.memory.used)} / {formatBytes(health.memory.total)}</div>
            {renderProgressBar(health.memory.usagePercent, '#4facfe')}
          </div>

          <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <HardDrive size={18} style={{ color: '#ffd700' }} />
              <h3 style={{ margin: 0 }}>Disk Space</h3>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{health.disk.usagePercent.toFixed(1)}%</div>
            <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>{formatBytes(health.disk.used)} / {formatBytes(health.disk.total)}</div>
            {renderProgressBar(health.disk.usagePercent, '#ffd700')}
          </div>

          <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Globe size={18} style={{ color: '#ff7b7b' }} />
              <h3 style={{ margin: 0 }}>Network Traffic</h3>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
              <div>
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Download</div>
                <div style={{ fontWeight: 'bold' }}>{formatBytes(health.network.rx_sec)}/s</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Upload</div>
                <div style={{ fontWeight: 'bold' }}>{formatBytes(health.network.tx_sec)}/s</div>
              </div>
            </div>
          </div>

        </div>

        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.85rem', opacity: 0.6 }}>
          Hostname: {health.hostname} • Uptime: {Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m
        </div>
      </div>
    </div>
  );
}

export default App;

function FileExplorerModal({ app, onClose }) {
  const [currentDir, setCurrentDir] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchDir(currentDir);
  }, [currentDir]);

  const fetchDir = async (dir) => {
    setLoading(true);
    try {
      const data = await api.getFiles(app.name, dir);
      setFiles(data);
    } catch (err) {
      alert('Error fetching files: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileClick = async (file) => {
    if (file.isDirectory) {
      setCurrentDir(file.path);
    } else {
      setLoading(true);
      try {
        const data = await api.getFileContent(app.name, file.path);
        setFileContent(data.content);
        setSelectedFile(file);
      } catch (err) {
        alert('Error reading file: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await api.saveFileContent(app.name, selectedFile.path, fileContent);
      alert('File saved!');
    } catch (err) {
      alert('Error saving file: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const goUp = () => {
    if (!currentDir) return;
    const parts = currentDir.split('/');
    parts.pop();
    setCurrentDir(parts.join('/'));
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 100 }}>
      <div className="modal glass-panel" style={{ width: '800px', height: '600px', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2>📁 Files - {app.name}</h2>
          <button className="btn btn-secondary" onClick={onClose}><X size={16} /></button>
        </div>
        
        <div style={{ display: 'flex', flex: 1, gap: '16px', minHeight: 0 }}>
          {/* File Tree */}
          <div style={{ width: '250px', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '8px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <button className="btn btn-secondary" onClick={goUp} disabled={!currentDir} style={{ padding: '4px' }}>
                ↑ Up
              </button>
              <span style={{ fontSize: '0.8rem', opacity: 0.7, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                /{currentDir}
              </span>
            </div>
            
            {loading && !selectedFile ? (
              <div style={{ padding: '8px', opacity: 0.5 }}>Loading...</div>
            ) : (
              files.map(f => (
                <div 
                  key={f.name} 
                  onClick={() => handleFileClick(f)}
                  style={{ 
                    padding: '6px 8px', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    borderRadius: '4px',
                    background: selectedFile?.path === f.path ? 'rgba(255,255,255,0.1)' : 'transparent'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = selectedFile?.path === f.path ? 'rgba(255,255,255,0.1)' : 'transparent'}
                >
                  {f.isDirectory ? <Folder size={14} style={{ color: '#ffd700' }}/> : <FileText size={14} style={{ color: '#888' }}/>}
                  <span style={{ fontSize: '0.9rem' }}>{f.name}</span>
                </div>
              ))
            )}
          </div>
          
          {/* Editor */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', overflow: 'hidden' }}>
            {selectedFile ? (
              <>
                <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{selectedFile.name}</span>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '4px 12px' }}>
                    <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
                <textarea 
                  value={fileContent} 
                  onChange={e => setFileContent(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    color: '#e0e0e0',
                    fontFamily: 'monospace',
                    padding: '12px',
                    resize: 'none',
                    outline: 'none'
                  }}
                  spellCheck="false"
                />
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                Select a file to edit
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
