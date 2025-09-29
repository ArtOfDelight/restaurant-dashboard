import React, { useState, useEffect } from 'react';
import './HighRatedDashboard.css'; // Reuse existing styles

const AuditDashboard = () => {
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://restaurant-dashboard-nqbi.onrender.com';

  // Hardcoded outlet names
  const hardcodedOutlets = [
    'Sahakarnagar', 'Residency Road', 'Whitefield', 'Koramangala',
    'Kalyan Nagar', 'Bellandur', 'Indiranagar', 'Arekere',
    'Jayanagar', 'HSR Layout', 'Electronic City', 'Rajajinagar'
  ];

  // State
  const [outlets] = useState(hardcodedOutlets);
  const [selectedOutlet, setSelectedOutlet] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [highVarianceOnly, setHighVarianceOnly] = useState(false);
  const [auditData, setAuditData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'absVariance', direction: 'desc' });

  // Set default date to today
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
  }, []);

  // Fetch audit data
  const fetchAuditData = async () => {
    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams();
      if (selectedOutlet) params.append('outlet', selectedOutlet);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (highVarianceOnly) params.append('highVarianceOnly', 'true');

      console.log('Fetching audit data with params:', params.toString());

      const response = await fetch(`${API_BASE_URL}/api/audit-data?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Received audit data:', data);

      if (data.success) {
        setAuditData(data.audits || []);
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
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await fetch(`${API_BASE_URL}/api/audit-summary?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setSummary(data.stats);
      }
    } catch (err) {
      console.error('Summary fetch error:', err);
    }
  };

  // Initial load
  useEffect(() => {
    fetchAuditData();
    fetchSummary();
  }, []);

  // Sort data
  const sortedData = React.useMemo(() => {
    let sorted = [...auditData];
    if (sortConfig.key) {
      sorted.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        
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
    if (abs === 0) return '#10b981'; // green
    if (abs < 5) return '#f59e0b'; // orange
    if (abs < 10) return '#ef4444'; // red
    return '#dc2626'; // dark red
  };

  // Format time from audit time string
  const formatAuditTime = (auditTimeString) => {
    try {
      if (!auditTimeString) return '';
      // Format: "2025-06-26 12:25:09"
      const parts = auditTimeString.split(' ');
      if (parts.length === 2) {
        return parts[1]; // Return time part
      }
      return auditTimeString;
    } catch {
      return auditTimeString;
    }
  };

  return (
    <div className="highrated-dashboard">
      {/* Header */}
      <div className="highrated-header">
        <h1>Audit Variance Dashboard</h1>
        <div className="period-switch">
          <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            Track inventory variances
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="highrated-stats">
        <div className="stat-card">
          <div className="stat-number">{auditData.length}</div>
          <div className="stat-label">Total Items Audited</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#ef4444' }}>
            {auditData.filter(a => a.hasVariance).length}
          </div>
          <div className="stat-label">Items with Variance</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#dc2626' }}>
            {auditData.filter(a => a.isHighVariance).length}
          </div>
          <div className="stat-label">High Variance (≥10)</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#f59e0b' }}>
            {auditData.filter(a => a.toleranceViolation).length}
          </div>
          <div className="stat-label">Tolerance Violations</div>
        </div>
      </div>

      {/* Filters */}
      <div className="highrated-filters">
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
          <label>Start Date</label>
          <input 
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>End Date</label>
          <input 
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
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
              background: 'var(--primary-color, #007bff)',
              color: 'white',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
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
          marginBottom: '20px'
        }}>
          {error}
        </div>
      )}

      {/* Data Table */}
      {!loading && auditData.length > 0 && (
        <div className="graphs-section">
          <h4>
            <span style={{ marginRight: '12px' }}>📊</span>
            Audit Results {selectedOutlet && `- ${selectedOutlet}`}
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
                  <th onClick={() => handleSort('date')} style={thStyle}>Date</th>
                  <th onClick={() => handleSort('auditTime')} style={thStyle}>Time</th>
                  <th onClick={() => handleSort('branchName')} style={thStyle}>Outlet</th>
                  <th onClick={() => handleSort('itemName')} style={thStyle}>Item</th>
                  <th onClick={() => handleSort('categoryName')} style={thStyle}>Category</th>
                  <th onClick={() => handleSort('auditQty')} style={thStyle}>Qty</th>
                  <th onClick={() => handleSort('absVariance')} style={thStyle}>Variance</th>
                  <th onClick={() => handleSort('absVariancePercent')} style={thStyle}>Var %</th>
                  <th onClick={() => handleSort('toleranceCheck')} style={thStyle}>Tolerance</th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map((audit, index) => (
                  <tr 
                    key={audit.id}
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
                    <td style={tdStyle}>{audit.date}</td>
                    <td style={tdStyle}>{formatAuditTime(audit.auditTime)}</td>
                    <td style={tdStyle}>{audit.branchName}</td>
                    <td style={{...tdStyle, fontWeight: '600'}}>
                      {audit.itemName}
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        SKU: {audit.sku}
                      </div>
                    </td>
                    <td style={tdStyle}>{audit.categoryName}</td>
                    <td style={{...tdStyle, textAlign: 'center'}}>{audit.auditQty}</td>
                    <td style={{
                      ...tdStyle,
                      textAlign: 'center',
                      fontWeight: '700',
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
                        background: audit.toleranceCheck === 'Yes' ? '#d1fae5' : '#fee',
                        color: audit.toleranceCheck === 'Yes' ? '#065f46' : '#991b1b'
                      }}>
                        {audit.toleranceCheck}
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
              Showing {sortedData.length} audit entries
            </div>
          </div>
        </div>
      )}

      {/* No Data Message */}
      {!loading && auditData.length === 0 && (
        <div className="bottom-outlets">
          <div className="outlet-card">
            <h5>No Audit Data Found</h5>
            <p>Try adjusting your filters or date range.</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="graphs-section">
          <div className="outlet-card">
            <h5>Loading Audit Data...</h5>
            <p>Please wait while we fetch the audit records...</p>
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
  borderRight: '1px solid var(--border-light)'
};

const tdStyle = {
  padding: '16px 24px',
  color: 'var(--text-secondary)',
  borderRight: '1px solid var(--border-light)'
};

export default AuditDashboard;