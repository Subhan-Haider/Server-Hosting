import { useState, useEffect } from 'react';
import { Play, Square, RotateCw, Trash2, Terminal, Plus, Server, Globe, Folder, Activity, RefreshCw, GitBranch, Settings, ExternalLink } from 'lucide-react';
import { api } from './api';

function App() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [deployType, setDeployType] = useState('local'); // 'local' or 'github'
  const [showAdvanced, setShowAdvanced] = useState(false);
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

  useEffect(() => {
    fetchApps();
    const interval = setInterval(fetchApps, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  const handleDeploy = async (e) => {
    e.preventDefault();
    setDeploying(true);
    try {
      await api.deployApp({ ...formData, deployType });
      setFormData({ 
        name: '', path: '', domain: '', 
        githubUrl: '', githubPat: '', branch: 'main',
        installCmd: '', buildCmd: '', startCmd: ''
      });
      setShowAdvanced(false);
      fetchApps();
    } catch (err) {
      alert('Error deploying app: ' + err.message);
    } finally {
      setDeploying(false);
    }
  };

  const handleGithubUrlChange = (e) => {
    const url = e.target.value;
    let branch = formData.branch; // keep current by default
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname.includes('github.com') || urlObj.hostname.includes('gitlab.com')) {
        const parts = urlObj.pathname.split('/').filter(Boolean);
        // Path looks like /username/repo/tree/branch-name/... or /blob/branch-name/...
        if (parts.length >= 4 && (parts[2] === 'tree' || parts[2] === 'blob')) {
          branch = parts[3];
        }
      }
    } catch (err) {
      // ignore invalid URLs while typing
    }
    setFormData({ ...formData, githubUrl: url, branch });
  };

  return (
    <div className="container animate-fade-in">
      <div className="header">
        <h1>Auto Deployment Platform</h1>
        <p>Your self-hosted Vercel alternative for lightning fast deployments</p>
      </div>

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
                  <label>Branch</label>
                  <div style={{ position: 'relative' }}>
                    <GitBranch size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                    <input 
                      type="text" 
                      placeholder="main" 
                      value={formData.branch} 
                      onChange={e => setFormData({...formData, branch: e.target.value})} 
                      style={{ paddingLeft: '40px' }}
                      required
                    />
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
                  onChange={e => setFormData({...formData, name: e.target.value})} 
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
              <label>Domain</label>
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
                  <label>GitHub PAT (For Private Repos)</label>
                  <input 
                    type="password" 
                    placeholder="ghp_..." 
                    value={formData.githubPat} 
                    onChange={e => setFormData({...formData, githubPat: e.target.value})} 
                  />
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
    </div>
  );
}

function AppCard({ app, onAction, delay }) {
  const [logs, setLogs] = useState(null);
  const [loadingAction, setLoadingAction] = useState(false);

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
        <button className="btn btn-danger" onClick={() => {
          if (confirm(`Are you sure you want to delete ${app.name}?`)) handleAction('delete');
        }} disabled={loadingAction}>
          <Trash2 size={16} /> Delete
        </button>
      </div>

      {logs && (
        <div className="logs-container">
          <div className="logs-title">Standard Output</div>
          <pre>{logs.out || 'No output logs'}</pre>
          {logs.err && (
            <>
              <div className="logs-title" style={{ marginTop: '12px' }}>Error Output</div>
              <pre style={{ color: 'var(--danger)' }}>{logs.err}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
