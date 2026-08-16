import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getDashboardStatus } from '../api/dashboard.js';

const POLL_INTERVAL = 5000;

const formatBytes = (bytes) => {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
};

const formatUptime = (totalSeconds) => {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const StatusDot = ({ healthy }) => <span className={`status-dot ${healthy ? 'healthy' : 'unhealthy'}`} />;

const StatCard = ({ label, value, sub }) => (
  <div className="stat-card">
    <div className="stat-label">{label}</div>
    <div className="stat-value">{value}</div>
    {sub && <div className="stat-sub">{sub}</div>}
  </div>
);

export const DashboardPage = () => {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getDashboardStatus();
      setStatus(data);
      setLastUpdated(new Date());
      setError('');
    } catch {
      // Deliberately not clearing `status` on a failed poll - a transient
      // fetch error shouldn't blank out the last-known-good dashboard, it
      // should just say so and keep showing what it had.
      setError('Failed to refresh status.');
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (!status) {
    return <div className="centered-message">{error || 'Loading dashboard...'}</div>;
  }

  const mongoHealthy = status.mongo.status === 'connected';
  const redisHealthy = status.redis.status === 'ready' || status.redis.status === 'connect';

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <h1>Developer Dashboard</h1>
        <Link to="/chat" className="link-button">Back to Chat</Link>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="dashboard-section">
        <h2>Dependencies</h2>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">MongoDB</div>
            <div className="stat-value">
              <StatusDot healthy={mongoHealthy} /> {status.mongo.status}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Redis</div>
            <div className="stat-value">
              <StatusDot healthy={redisHealthy} /> {status.redis.status}
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <h2>Process</h2>
        <div className="stat-grid">
          <StatCard label="Environment" value={status.environment} />
          <StatCard label="Uptime" value={formatUptime(status.uptimeSeconds)} />
          <StatCard label="Node Version" value={status.nodeVersion} />
          <StatCard
            label="Memory (heap)"
            value={formatBytes(status.memory.heapUsed)}
            sub={`of ${formatBytes(status.memory.heapTotal)} allocated`}
          />
        </div>
      </section>

      <section className="dashboard-section">
        <h2>Live Counts</h2>
        <div className="stat-grid">
          <StatCard label="Online Users" value={status.counts.onlineUsers} />
          <StatCard label="Total Users" value={status.counts.totalUsers} />
          <StatCard label="Conversations" value={status.counts.totalConversations} />
          <StatCard label="Messages" value={status.counts.totalMessages} />
        </div>
      </section>

      {lastUpdated && (
        <p className="dashboard-updated">Last updated {lastUpdated.toLocaleTimeString()} - refreshes every 5s</p>
      )}
    </div>
  );
};
