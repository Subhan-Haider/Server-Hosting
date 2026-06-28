import { useState, useEffect, useRef } from 'react';
import { Play, Square, RotateCw, Trash2, Terminal, Plus, Server, Globe, Folder, Activity, RefreshCw, GitBranch, Settings, ExternalLink, Code2, LogOut, CheckCircle, Bell, Key, FileText, Save, X, Search } from 'lucide-react';
import { api } from './api';

function App() {
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

  const [formData, setFormData] = useState({ 
    name: '', 
    path: '', 
    domain: '',
    githubUrl: '',
    githubPat: '',
    branch: 'main',
    installCmd: '',
    buildCmd: '',
    startCmd: ''
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

  useEffect(() => {
    fetchApps();
    fetchSecrets();
    fetchCrashes();
    const interval = setInterval(() => {
      fetchApps();
      fetchCrashes();
    }, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

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

  return (
    <div className="container animate-fade-in">
      <div className="header">
        <div>
          <h1>Auto Deployment Platform</h1>
          <p>Your self-hosted Vercel alternative for lightning fast deployments</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          
          <button className="btn btn-secondary" onClick={() => setShowCrashes(true)} style={{ position: 'relative', padding: '8px' }} title="Crash Reports">
            <Bell size={18} />
            {crashes.length > 0 && (
              <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: 'var(--error-color)', color: 'white', borderRadius: '50%', width: '18px', height: '18px', fontSize: '0.7rem', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold' }}>
                {crashes.length}
              </span>
            )}
          </button>

          <button className="btn btn-secondary" onClick={() => setShowSecretsVault(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Secrets Vault">
            <Key size={16} /> Secrets
          </button>

          {githubUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.07)', padding: '6px 12px', borderRadius: '20px' }}>
              <img src={githubUser.avatar_url} alt="avatar" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>{githubUser.login}</span>
              <button
                onClick={() => { localStorage.removeItem('gh_token'); localStorage.removeItem('gh_user'); setGithubToken(''); setGithubUser(null); }}
                title="Disconnect GitHub"
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0', display: 'flex' }}
              ><LogOut size={14} /></button>
            </div>
          ) : (
            <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setShowGithubConnect(true)}>
              <Code2 size={14} /> Connect GitHub
            </button>
          )}
        </div>
      </div>

      {showGithubConnect && (
        <GitHubConnect
          onConnected={(token, user) => {
            setGithubToken(token);
            setGithubUser(user);
            setShowGithubConnect(false);
          }}
          onClose={() => setShowGithubConnect(false)}
        />
      )}

      <div className="grid">
        {/* Deploy Form */}
        <div className="glass-panel delay-1">
          <h2><Plus size={20} style={{display: 'inline', marginRight: '8px', verticalAlign: 'text-bottom'}} /> Deploy New App</h2>
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button 
              type="button"
              className={`btn ${deployType === 'local' ? 'btn-primary' : 'btn-secondary'}`} 
              style={{ flex: 1 }}
              onClick={() => setDeployType('local')}
            >
              Local Folder
            </button>
            <button 
              type="button"
              className={`btn ${deployType === 'github' ? 'btn-primary' : 'btn-secondary'}`} 
              style={{ flex: 1 }}
              onClick={() => setDeployType('github')}
            >
              GitHub Repo
            </button>
          </div>

          <form onSubmit={handleDeploy}>
            {deployType === 'github' && (
              <>
                <div className="form-group">
                  <label>GitHub Repository URL</label>
                  <div style={{ position: 'relative' }}>
                    <Globe size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                    <input 
                      type="url" 
                      placeholder="https://github.com/user/repo" 
                      value={formData.githubUrl} 
                      onChange={handleGithubUrlChange} 
                      style={{ paddingLeft: '40px' }}
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Branch {fetchingBranches && <span style={{ fontSize: '0.75rem', color: 'var(--accent-color)', marginLeft: '8px' }}>⏳ Fetching branches...</span>}</label>
                  <div style={{ position: 'relative' }}>
                    <GitBranch size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)', zIndex: 1 }} />
                    {availableBranches.length > 0 ? (
                      <select
                        value={formData.branch}
                        onChange={e => setFormData({...formData, branch: e.target.value})}
                        style={{ paddingLeft: '40px', width: '100%', appearance: 'none' }}
                        required
                      >
                        {availableBranches.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    ) : (
                      <input 
                        type="text" 
                        placeholder="main" 
                        value={formData.branch} 
                        onChange={e => setFormData({...formData, branch: e.target.value})} 
                        style={{ paddingLeft: '40px' }}
                        required
                      />
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="form-group">
              <label>Project Name {deployType === 'github' && '(Optional)'}</label>
              <div style={{ position: 'relative' }}>
                <Server size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                <input 
                  type="text" 
                  placeholder={deployType === 'github' ? 'Auto-generated from URL' : 'e.g. my-awesome-app'} 
                  value={formData.name} 
                  onChange={e => {
                    const newName = e.target.value;
                    const cleanName = newName.toLowerCase().replace(/[^a-z0-9-]/g, '');
                    setFormData(prev => ({
                      ...prev, 
                      name: newName,
                      domain: !useCustomDomain && cleanName ? `${cleanName}.subhan.tech` : prev.domain
                    }));
                  }} 
                  style={{ paddingLeft: '40px' }}
                  required={deployType === 'local'}
                />
              </div>
            </div>
            
            {deployType === 'local' && (
              <div className="form-group">
                <label>Project Folder Path</label>
                <div style={{ position: 'relative' }}>
                  <Folder size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                  <input 
                    type="text" 
                    placeholder="e.g. /home/user/projects/app" 
                    value={formData.path} 
                    onChange={e => setFormData({...formData, path: e.target.value})} 
                    style={{ paddingLeft: '40px' }}
                    required
                  />
                </div>
              </div>
            )}
            
            <div className="form-group">
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Domain</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer', margin: 0, color: useCustomDomain ? 'var(--accent-color)' : 'var(--text-secondary)' }}>
                  <input 
                    type="checkbox" 
                    checked={useCustomDomain}
                    onChange={(e) => setUseCustomDomain(e.target.checked)}
                    style={{ width: 'auto', margin: 0 }}
                  />
                  Use Custom Domain
                </label>
              </label>
              <div style={{ position: 'relative' }}>
                <Globe size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                <input 
                  type="text" 
                  placeholder="e.g. app.subhan.tech" 
                  value={formData.domain} 
                  onChange={e => setFormData({...formData, domain: e.target.value})} 
                  style={{ paddingLeft: '40px' }}
                  required
                />
              </div>
            </div>

            {deployType === 'github' && (
              <div className="form-group">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ width: '100%', fontSize: '0.8rem', padding: '6px' }}
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  <Settings size={14} /> {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
                </button>
              </div>
            )}

            {deployType === 'github' && showAdvanced && (
              <div style={{ padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', marginBottom: '16px' }}>
                <p style={{ fontSize: '0.8rem', marginBottom: '12px' }}>
                  The system will auto-detect commands based on package.json (Next.js, Vite, React). 
                  Fill these only if you want to override the auto-detection.
                </p>
                <div className="form-group">
                  {githubToken ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px' }}>
                      <CheckCircle size={16} color="var(--success)" />
                      <span style={{ fontSize: '0.82rem', color: 'var(--success)' }}>
                        GitHub connected as <strong>{githubUser?.login}</strong> — token will be used automatically
                      </span>
                    </div>
                  ) : (
                    <>
                      <label>GitHub PAT (For Private Repos)</label>
                      <input 
                        type="password" 
                        placeholder="ghp_... or connect GitHub above" 
                        value={formData.githubPat} 
                        onChange={e => setFormData({...formData, githubPat: e.target.value})} 
                      />
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Or <button type="button" onClick={() => setShowGithubConnect(true)} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', padding: 0, fontSize: '0.72rem', textDecoration: 'underline' }}>connect your GitHub account</button> to avoid entering this every time.
                      </p>
                    </>
                  )}
                </div>
                <div className="form-group">
                  <label>Install Command (Override)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. yarn install"
                    value={formData.installCmd} 
                    onChange={e => setFormData({...formData, installCmd: e.target.value})} 
                  />
                </div>
                <div className="form-group">
                  <label>Build Command (Override)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. npm run build"
                    value={formData.buildCmd} 
                    onChange={e => setFormData({...formData, buildCmd: e.target.value})} 
                  />
                </div>
                <div className="form-group">
                  <label>Start Command (Override)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. npm start"
                    value={formData.startCmd} 
                    onChange={e => setFormData({...formData, startCmd: e.target.value})} 
                  />
                </div>

                {/* Environment Variables Editor */}
                <div className="form-group" style={{ marginTop: '16px' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>🔐 Environment Variables (.env.local)</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          const content = envVars
                            .filter(ev => ev.key.trim())
                            .map(ev => `${ev.key}=${ev.value}`)
                            .join('\n');
                          const blob = new Blob([content], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = '.env';
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', cursor: 'pointer' }}
                        title="Download .env file"
                      >📥 Export</button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const text = await navigator.clipboard.readText();
                            if (!text) return;
                            const lines = text.split('\n');
                            const newVars = [];
                            lines.forEach(line => {
                              const trimmed = line.trim();
                              if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                                const splitIdx = trimmed.indexOf('=');
                                const key = trimmed.substring(0, splitIdx).trim();
                                let value = trimmed.substring(splitIdx + 1).trim();
                                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                                  value = value.substring(1, value.length - 1);
                                }
                                if (key) newVars.push({ key, value });
                              }
                            });
                            if (newVars.length > 0) {
                              setEnvVars(prev => {
                                const filtered = prev.filter(v => v.key.trim() !== '');
                                return [...filtered, ...newVars];
                              });
                            }
                          } catch (err) {
                            alert('Clipboard access denied. Please allow clipboard permissions to use Import.');
                          }
                        }}
                        style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', cursor: 'pointer' }}
                        title="Copy your .env file contents and click this to auto-fill"
                      >📋 Import</button>
                      <button
                        type="button"
                        onClick={() => setEnvVars([...envVars, { key: '', value: '' }])}
                        style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >+ Add Variable</button>
                    </div>
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                    {envVars.map((ev, i) => (
                      <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input
                          type="text"
                          placeholder="KEY"
                          value={ev.key}
                          onChange={e => {
                            const updated = [...envVars];
                            updated[i] = { ...updated[i], key: e.target.value };
                            setEnvVars(updated);
                          }}
                          style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }}
                        />
                        <span style={{ color: 'var(--text-secondary)' }}>=</span>
                        <input
                          type="text"
                          placeholder="value"
                          value={ev.value}
                          onChange={e => {
                            const updated = [...envVars];
                            updated[i] = { ...updated[i], value: e.target.value };
                            setEnvVars(updated);
                          }}
                          style={{ flex: 2, fontFamily: 'monospace', fontSize: '0.8rem' }}
                        />
                        <button
                          type="button"
                          onClick={() => setEnvVars(envVars.filter((_, j) => j !== i))}
                          style={{ background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.75rem' }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '6px' }}>These will be written to <code>.env.local</code> in your project before startup.</p>
                </div>
                  {Object.keys(globalSecrets).length > 0 && (
                    <div className="form-group" style={{ marginTop: '16px' }}>
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>🌐 Inject Global Secrets</span>
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', padding: '12px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px' }}>
                        {Object.entries(globalSecrets).map(([key, masked]) => (
                          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontWeight: 'normal' }}>
                            <input
                              type="checkbox"
                              checked={selectedSecrets.includes(key)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSecrets([...selectedSecrets, key]);
                                } else {
                                  setSelectedSecrets(selectedSecrets.filter(k => k !== key));
                                }
                              }}
                              style={{ width: 'auto', marginBottom: 0 }}
                            />
                            <span style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem' }}>{key}</span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontFamily: 'monospace' }}>{masked}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={deploying}>
              {deploying ? 'Deploying (This may take a minute)...' : 'Deploy App'}
            </button>
          </form>
        </div>

        {/* App List */}
        {loading ? (
          <div className="glass-panel" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Activity className="animate-spin" size={32} color="var(--accent-color)" />
          </div>
        ) : apps.length === 0 ? (
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <Server size={48} color="var(--text-secondary)" style={{ marginBottom: '16px' }} />
            <h3>No Apps Deployed</h3>
            <p>Use the form to deploy your first application.</p>
          </div>
        ) : (
          apps.map((app, i) => (
            <AppCard key={app.name} app={app} onAction={fetchApps} delay={i + 2} />
          ))
        )}
      </div>

      {/* Deployment Logs Modal overlay */}
      {(deploying || deployLogs) && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', zIndex: 1000,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          backdropFilter: 'blur(5px)'
        }}>
          <div className="glass-panel" style={{ width: '90%', maxWidth: '800px', height: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2>Deployment In Progress</h2>
              {deploying ? <Activity className="animate-spin" size={24} color="var(--accent-color)" /> : <button onClick={() => setDeployLogs('')} className="btn btn-secondary">Close</button>}
            </div>
            <pre style={{ 
              flex: 1, 
              background: '#0d1117', 
              color: '#c9d1d9', 
              padding: '16px', 
              borderRadius: '8px', 
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              margin: 0,
              whiteSpace: 'pre-wrap'
            }}>
              {deployLogs}
            </pre>
          </div>
        </div>
      )}

      {/* Secrets Vault Modal */}
      {showSecretsVault && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', zIndex: 1000,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          backdropFilter: 'blur(5px)'
        }}>
          <div className="glass-panel" style={{ width: '90%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2><Key size={20} style={{display: 'inline', verticalAlign: 'text-bottom'}}/> Secrets Vault</h2>
              <button onClick={() => setShowSecretsVault(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Define global API keys and secrets here. You can inject these into any deployed app. Values are masked for security.
            </p>
            
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
              {Object.keys(globalSecrets).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>No global secrets defined yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(globalSecrets).map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '10px 12px', borderRadius: '8px' }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{key}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{value}</div>
                        <button onClick={async () => {
                          if (confirm(`Delete secret ${key}?`)) {
                            await api.deleteSecret(key);
                            fetchSecrets();
                          }
                        }} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0 }} title="Delete Secret">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              const key = e.target.elements.key.value.trim();
              const val = e.target.elements.val.value.trim();
              if (key && val) {
                await api.saveSecret(key, val);
                e.target.reset();
                fetchSecrets();
              }
            }} style={{ display: 'flex', gap: '8px' }}>
              <input name="key" type="text" placeholder="KEY_NAME" required style={{ flex: 1, fontFamily: 'monospace' }} />
              <input name="val" type="password" placeholder="Value" required style={{ flex: 2, fontFamily: 'monospace' }} />
              <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px' }}>Add</button>
            </form>
          </div>
        </div>
      )}

      {/* Crashes Modal */}
      {showCrashes && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', zIndex: 1000,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          backdropFilter: 'blur(5px)'
        }}>
          <div className="glass-panel" style={{ width: '90%', maxWidth: '800px', height: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2><Bell size={20} style={{display: 'inline', verticalAlign: 'text-bottom'}}/> Crash Reports</h2>
              <button onClick={() => setShowCrashes(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Recent fatal errors and unhandled rejections from your Node.js apps.
            </p>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {crashes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>No crashes recorded! 🎉</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {crashes.map((crash) => (
                    <div key={crash.id} style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.3)', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 'bold', color: 'var(--error-color)' }}>{crash.appName}</span>
                          <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>{crash.type}</span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{new Date(crash.timestamp).toLocaleString()}</span>
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#ff7b7b', marginBottom: '8px' }}>{crash.message}</div>
                      <pre style={{ background: 'rgba(0,0,0,0.4)', padding: '8px', borderRadius: '4px', fontSize: '0.75rem', overflowX: 'auto', margin: 0, color: '#c9d1d9' }}>
                        {crash.stack}
                      </pre>
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
function AppCard({ app, onAction, delay }) {
  const [logs, setLogs] = useState(null);
  const [history, setHistory] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [logSearch, setLogSearch] = useState('');

  const handleAction = async (action) => {
    setLoadingAction(true);
    try {
      if (action === 'redeploy') {
        await api.actionApp(app.name, 'redeploy');
      } else {
        await api.actionApp(app.name, action);
      }
      onAction();
    } catch (err) {
      alert(`Error trying to ${action} app: ` + err.message);
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
      
      return <div key={i} style={{ color }}>{line}</div>;
    });
  };

  const toggleLogs = async () => {
    if (logs) {
      setLogs(null);
    } else {
      try {
        const data = await api.getLogs(app.name);
        setLogs(data);
      } catch (err) {
        alert('Failed to get logs');
      }
    }
  };

  const toggleHistory = async () => {
    if (showHistory) {
      setShowHistory(false);
    } else {
      try {
        const data = await api.getHistory(app.domain);
        setHistory(data);
        setShowHistory(true);
      } catch (err) {
        alert('Failed to get history: ' + err.message);
      }
    }
  };

  const handleRollback = async (commit) => {
    if (!confirm(`Are you sure you want to rollback to commit ${commit}?`)) return;
    setLoadingAction(true);
    try {
      await api.rollback(app.domain, commit);
      alert('Rollback successful!');
      onAction();
      toggleHistory(); // close modal
    } catch (err) {
      alert('Rollback failed: ' + err.message);
    } finally {
      setLoadingAction(false);
    }
  };

  const statusClass = app.status === 'online' ? 'status-online' : 
                      app.status === 'stopped' ? 'status-stopped' : 'status-errored';

  return (
    <div className={`glass-panel animate-fade-in delay-${Math.min(delay, 3)}`}>
      <div className="app-card-header">
        <div>
          <h3>{app.name}</h3>
          <div className="app-meta">
            <Globe size={14} /> {app.domain}
          </div>
          <div className="app-meta">
            <Server size={14} /> Port: {app.port}
          </div>
          {app.deployType === 'github' && (
            <div className="app-meta" style={{ color: 'var(--accent-color)' }}>
              <GitBranch size={14} /> {app.branch || 'main'}
            </div>
          )}
        </div>
        <div className={`status-badge ${statusClass}`}>
          <div className="status-dot"></div>
          {app.status}
        </div>
      </div>

      <div className="app-stats">
        <div className="stat-item">
          <span className="stat-value">{app.cpu}%</span>
          <span className="stat-label">CPU Usage</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{(app.memory / (1024 * 1024)).toFixed(1)} MB</span>
          <span className="stat-label">Memory</span>
        </div>
      </div>

      <div className="app-actions" style={{ flexWrap: 'wrap' }}>
        {app.status === 'online' && (
          <a href={`https://${app.domain}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px' }}>
            <ExternalLink size={16} /> Open
          </a>
        )}
        {app.status !== 'online' ? (
          <button className="btn btn-primary" onClick={() => handleAction('start')} disabled={loadingAction}>
            <Play size={16} /> Start
          </button>
        ) : (
          <button className="btn btn-secondary" onClick={() => handleAction('stop')} disabled={loadingAction}>
            <Square size={16} /> Stop
          </button>
        )}
        <button className="btn btn-secondary" onClick={() => handleAction('restart')} disabled={loadingAction}>
          <RotateCw size={16} /> Restart
        </button>
        {app.deployType === 'github' && (
          <button className="btn btn-primary" onClick={() => handleAction('redeploy')} disabled={loadingAction} style={{ background: 'var(--success)' }}>
            <RefreshCw size={16} /> Redeploy
          </button>
        )}
        <button className="btn btn-secondary" onClick={toggleLogs}>
          <Terminal size={16} /> Logs
        </button>
        <button className="btn btn-secondary" onClick={() => setShowFiles(true)}>
          <Folder size={16} /> Files
        </button>
        {app.deployType === 'github' && (
          <button className="btn btn-secondary" onClick={toggleHistory} disabled={loadingAction}>
            <Activity size={16} /> History
          </button>
        )}
        <button className="btn btn-danger" onClick={() => {
          if (confirm(`Are you sure you want to delete ${app.name}?`)) handleAction('delete');
        }} disabled={loadingAction}>
          <Trash2 size={16} /> Delete
        </button>
      </div>

      {logs && (
        <div className="logs-container">
          <div className="logs-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Standard Output</span>
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: '4px' }}>
              <Search size={14} style={{ marginRight: '6px', opacity: 0.6 }} />
              <input 
                type="text" 
                placeholder="Search logs..." 
                value={logSearch}
                onChange={e => setLogSearch(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: '#fff', outline: 'none', fontSize: '0.85rem' }}
              />
            </div>
          </div>
          <pre style={{ maxHeight: '300px', overflowY: 'auto' }}>{renderFilteredLogs(logs.out)}</pre>
          {logs.err && (
            <>
              <div className="logs-title" style={{ marginTop: '12px' }}>Error Output</div>
              <pre style={{ maxHeight: '300px', overflowY: 'auto' }}>{renderFilteredLogs(logs.err)}</pre>
            </>
          )}
        </div>
      )}

      {showHistory && history && (
        <div className="logs-container" style={{ marginTop: '16px' }}>
          <div className="logs-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Deployment History</span>
            <button onClick={() => setShowHistory(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {history.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No history available.</p>
            ) : (
              history.map((record) => (
                <div key={record.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 500, color: record.status === 'success' ? 'var(--success)' : 'var(--danger)' }}>
                      {record.type.toUpperCase()} - {record.status.toUpperCase()}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      {new Date(record.timestamp).toLocaleString()} • {Math.round(record.durationMs / 1000)}s
                    </div>
                    {record.commitHash && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', fontFamily: 'monospace' }}>
                        Commit: {record.commitHash.substring(0, 7)}
                      </div>
                    )}
                    {record.error && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--danger)', marginTop: '4px' }}>
                        {record.error}
                      </div>
                    )}
                  </div>
                  {record.commitHash && record.commitHash !== 'unknown' && record.status === 'success' && (
                    <button 
                      onClick={() => handleRollback(record.commitHash)}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                      disabled={loadingAction}
                    >
                      <RotateCw size={14} style={{ marginRight: '4px' }} /> Rollback
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {showFiles && <FileExplorerModal app={app} onClose={() => setShowFiles(false)} />}
    </div>
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
