import React, { useState, useEffect } from 'react';
import './HighRatedDashboard.css';

const AuditDashboard = () => {
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://restaurant-dashboard-nqbi.onrender.com';

  // Hardcoded outlet names (matching backend BRANCH_CODES)
  const hardcodedOutlets = [
    'Sahakarnagar', 'Residency Road', 'Whitefield', 'Koramangala',
    'Kalyan Nagar', 'Bellandur', 'Indiranagar', 'Arekere',
    'Jayanagar', 'HSR Layout', 'Electronic City', 'Rajajinagar'
  ];

  // State
  const [outlets] = useState(hardcodedOutlets);
  const [selectedOutlet, setSelectedOutlet] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [highVarianceOnly, setHighVarianceOnly] = useState(false);
  const [auditData, setAuditData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'absVariance', direction: 'desc' });

  // Set default date to yesterday (matching backend default)
  useEffect(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    setSelectedDate(yesterdayStr);
  }, []);

  // Fetch audit data
  const fetchAuditData = async () => {
    try {
      setLoading(true);
      setError('');

      // Build params
      const params = new URLSearchParams();
      if (selectedDate) {
        params.append('day', selectedDate);
      }

      console.log('Fetching audit data with params:', params.toString());

      // Fetch all outlets data
      const response = await fetch(`${API_BASE_URL}/api/audit-data-all?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Received audit data:', data);

      if (data.success) {
        let audits = data.audits || [];
        
        // Apply outlet filter on frontend
        if (selectedOutlet) {
          audits = audits.filter(a => a.branchName === selectedOutlet);
        }
        
        // Apply high variance filter
        if (highVarianceOnly) {
          audits = audits.filter(a => a.absVariance >= 5);
        }
        
        setAuditData(audits);
      } else {
        setError(data.error || 'Failed to fetch audit data');
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch summary
  const fetchSummary = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedDate) {
        params.append('day', selectedDate);
      }
      params.append('groupBy', 'outlet');

      const response = await fetch(`${API_BASE_URL}/api/audit-summary?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setSummary(data.overallStats);
        console.log('Summary received:', data.overallStats);
      }
    } catch (err) {
      console.error('Summary fetch error:', err);
    }
  };

  // Initial load
  useEffect(() => {
    if (selectedDate) {
      fetchAuditData();
      fetchSummary();
    }
  }, [selectedDate]);

  // Sort data
  const sortedData = React.useMemo(() => {
    let sorted = [...auditData];
    if (sortConfig.key) {
      sorted.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        
        // Handle string comparisons
        if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }
        
        if (sortConfig.direction === 'asc') {
          return aVal > bVal ? 1 : -1;
        }
        return aVal < bVal ? 1 : -1;
      });
    }
    return sorted;
  }, [auditData, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  // Get variance color
  const getVarianceColor = (variance) => {
    const abs = Math.abs(variance);
    if (abs === 0) return '#10b981';
    if (abs < 5) return '#f59e0b';
    if (abs < 10) return '#ef4444';
    return '#dc2626';
  };

  // Format time
  const formatAuditTime = (auditTimeString) => {
    try {
      if (!auditTimeString) return '';
      const parts = auditTimeString.split(' ');
      if (parts.length === 2) {
        return parts[1].substring(0, 5); // Return HH:MM
      }
      return auditTimeString;
    } catch {
      return auditTimeString;
    }
  };

  // Calculate filtered stats
  const filteredStats = {
    total: auditData.length,
    withVariance: auditData.filter(a => a.hasVariance).length,
    highVariance: auditData.filter(a => a.isHighVariance).length,
    toleranceViolations: auditData.filter(a => a.toleranceViolation).length
  };

  return (
    <div className="highrated-dashboard">
      {/* Header */}
      <div className="highrated-header">
        <h1>🔍 Audit Variance Dashboard</h1>
        <div className="period-switch">
          <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            Live Inventory Audit Tracking
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="highrated-stats">
        <div className="stat-card">
          <div className="stat-number">{filteredStats.total}</div>
          <div className="stat-label">Total Audits</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#ef4444' }}>
            {filteredStats.withVariance}
          </div>
          <div className="stat-label">Items with Variance</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#dc2626' }}>
            {filteredStats.highVariance}
          </div>
          <div className="stat-label">High Variance (≥10)</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#f59e0b' }}>
            {filteredStats.toleranceViolations}
          </div>
          <div className="stat-label">Tolerance Violations (&gt;8%)</div>
        </div>
      </div>

      {/* Filters */}
      <div className="highrated-filters">
        <div className="filter-group">
          <label>Date</label>
          <input 
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Outlet</label>
          <select 
            value={selectedOutlet} 
            onChange={(e) => setSelectedOutlet(e.target.value)}
          >
            <option value="">All Outlets</option>
            {outlets.map(outlet => (
              <option key={outlet} value={outlet}>{outlet}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input 
              type="checkbox"
              checked={highVarianceOnly}
              onChange={(e) => setHighVarianceOnly(e.target.checked)}
            />
            High Variance Only (≥5)
          </label>
        </div>

        <div className="filter-group">
          <label>&nbsp;</label>
          <button 
            onClick={() => {
              fetchAuditData();
              fetchSummary();
            }}
            disabled={loading}
            style={{ 
              padding: '14px 28px', 
              border: 'none', 
              borderRadius: '12px',
              background: loading ? '#ccc' : 'var(--primary-color, #007bff)',
              color: 'white',
              fontSize: '15px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              width: '100%'
            }}
          >
            {loading ? 'Loading...' : 'Apply Filters'}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{
          padding: '16px',
          background: '#fee',
          border: '1px solid #fcc',
          borderRadius: '8px',
          color: '#c33',
          marginBottom: '20px',
          fontWeight: '500'
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Data Table */}
      {!loading && auditData.length > 0 && (
        <div className="graphs-section">
          <h4>
            <span style={{ marginRight: '12px' }}>📊</span>
            Audit Results
            {selectedOutlet && ` - ${selectedOutlet}`}
            {selectedDate && ` (${selectedDate})`}
          </h4>

          <div style={{ 
            background: 'var(--surface-card)',
            borderRadius: '16px',
            border: '1px solid var(--border-light)',
            overflow: 'auto',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
          }}>
            <table style={{ 
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.9rem'
            }}>
              <thead>
                <tr style={{ 
                  background: 'linear-gradient(135deg, var(--surface-light) 0%, var(--surface-card) 100%)',
                  borderBottom: '2px solid var(--border-light)'
                }}>
                  <th onClick={() => handleSort('auditTime')} style={thStyle}>Time</th>
                  <th onClick={() => handleSort('branchName')} style={thStyle}>Outlet</th>
                  <th onClick={() => handleSort('itemName')} style={thStyle}>Item</th>
                  <th onClick={() => handleSort('categoryName')} style={thStyle}>Category</th>
                  <th onClick={() => handleSort('auditQty')} style={thStyle}>Qty</th>
                  <th onClick={() => handleSort('absVariance')} style={thStyle}>Variance</th>
                  <th onClick={() => handleSort('absVariancePercent')} style={thStyle}>Var %</th>
                  <th onClick={() => handleSort('toleranceViolation')} style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map((audit, index) => (
                  <tr 
                    key={`${audit.branchName}-${audit.sku}-${audit.auditTime}-${index}`}
                    style={{ 
                      borderBottom: index < sortedData.length - 1 ? '1px solid var(--border-light)' : 'none',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--surface-light)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <td style={tdStyle}>{formatAuditTime(audit.auditTime)}</td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: '600' }}>{audit.branchName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {audit.branchCode}
                      </div>
                    </td>
                    <td style={{...tdStyle, fontWeight: '600'}}>
                      {audit.itemName}
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        SKU: {audit.sku}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: '0.85rem' }}>{audit.categoryName}</div>
                    </td>
                    <td style={{...tdStyle, textAlign: 'center', fontWeight: '600'}}>
                      {audit.auditQty}
                    </td>
                    <td style={{
                      ...tdStyle,
                      textAlign: 'center',
                      fontWeight: '700',
                      fontSize: '1rem',
                      color: getVarianceColor(audit.variance)
                    }}>
                      {audit.variance > 0 ? '+' : ''}{audit.variance}
                    </td>
                    <td style={{
                      ...tdStyle,
                      textAlign: 'center',
                      fontWeight: '600',
                      color: getVarianceColor(audit.variance)
                    }}>
                      {audit.variancePercent.toFixed(1)}%
                    </td>
                    <td style={{
                      ...tdStyle,
                      textAlign: 'center'
                    }}>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        background: audit.toleranceViolation ? '#fee' : '#d1fae5',
                        color: audit.toleranceViolation ? '#991b1b' : '#065f46'
                      }}>
                        {audit.toleranceViolation ? '⚠️ Violation' : '✓ OK'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{
              padding: '16px 32px',
              background: 'var(--surface-light)',
              borderTop: '1px solid var(--border-light)',
              textAlign: 'center',
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
              fontWeight: '500'
            }}>
              Showing {sortedData.length} audit {sortedData.length === 1 ? 'entry' : 'entries'}
              {selectedOutlet && ` for ${selectedOutlet}`}
            </div>
          </div>
        </div>
      )}

      {/* No Data Message */}
      {!loading && auditData.length === 0 && !error && (
        <div className="bottom-outlets">
          <div className="outlet-card">
            <h5>📭 No Audit Data Found</h5>
            <p>No variance data available for the selected filters.</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>
              Try selecting a different date or outlet.
            </p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="graphs-section">
          <div className="outlet-card">
            <h5>⏳ Loading Audit Data...</h5>
            <p>Fetching inventory variance records from Ristaapps API...</p>
          </div>
        </div>
      )}
    </div>
  );
};

const thStyle = {
  padding: '16px 24px',
  textAlign: 'left',
  fontWeight: '600',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  userSelect: 'none',
  borderRight: '1px solid var(--border-light)',
  transition: 'background 0.2s ease'
};

const tdStyle = {
  padding: '16px 24px',
  color: 'var(--text-secondary)',
  borderRight: '1px solid var(--border-light)'
};

export default AuditDashboard;