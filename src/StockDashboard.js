import React, { useState, useEffect } from 'react';
import './HighRatedDashboard.css'; // Using the provided CSS file

const StockDashboard = () => {
  // API Configuration for deployed app
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://restaurant-dashboard-nqbi.onrender.com';

  // Hardcoded outlet names - bypassing API call for outlet list
  const hardcodedOutlets = [
    'Sahakarnagar',
    'Residency Road', 
    'Whitefield',
    'Koramangala',
    'Kalyan Nagar',
    'Bellandur',
    'Indiranagar',
    'Arekere',
    'Jayanagar',
    'HSR Layout',
    'Electronic City',
    'Rajajinagar'
  ];

  const [outlets, setOutlets] = useState(hardcodedOutlets);
  const [selectedOutlet, setSelectedOutlet] = useState('');
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [trackingTime, setTrackingTime] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [startTime, setStartTime] = useState(null);

  // Set hardcoded outlets on component mount (no API call needed)
  useEffect(() => {
    console.log('📦 Using hardcoded outlets:', hardcodedOutlets);
    console.log('🌐 API Base URL:', API_BASE_URL);
    setOutlets(hardcodedOutlets);
    setError(''); // Clear any previous errors
  }, []);

  // Timer effect
  useEffect(() => {
    let interval = null;
    if (timerActive && selectedOutlet) {
      interval = setInterval(() => {
        setTrackingTime((prevTime) => prevTime + 1);
      }, 1000);
    } else if (!timerActive || !selectedOutlet) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [timerActive, selectedOutlet]);

  const startTimer = () => {
    setStartTime(Date.now());
    setTimerActive(true);
    setTrackingTime(0);
  };

  const stopTimer = () => {
    setTimerActive(false);
  };

  const fetchStockData = async (outlet) => {
    if (!outlet) return;
    
    try {
      setLoading(true);
      setError('');
      
      console.log(`🔍 Fetching stock data for outlet: ${outlet}`);
      console.log(`🌐 Full API URL: ${API_BASE_URL}/api/stock-data?outlet=${encodeURIComponent(outlet)}`);
      
      const response = await fetch(`${API_BASE_URL}/api/stock-data?outlet=${encodeURIComponent(outlet)}`);
      console.log(`📡 Response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText}. Response: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('📦 Received data:', data);
      
      if (data.success) {
        setStockData(data.items || []);
        console.log(`✅ Successfully loaded ${data.items?.length || 0} stock items`);
      } else {
        setError(data.error || 'Failed to fetch stock data');
        setStockData([]);
        console.error('❌ API returned error:', data);
      }
    } catch (err) {
      const errorMsg = `Network error: ${err.message}`;
      setError(errorMsg);
      setStockData([]);
      console.error('💥 Fetch error:', err);
      console.error('💥 Full error object:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOutletChange = (outlet) => {
    console.log(`🏪 Outlet selected: ${outlet}`);
    stopTimer();
    if (selectedOutlet && selectedOutlet !== outlet) {
      console.log(`⏱️ Time tracked for ${selectedOutlet}: ${trackingTime} seconds`);
    }
    setSelectedOutlet(outlet);
    if (outlet) {
      startTimer();
      fetchStockData(outlet);
    } else {
      setStockData([]);
      setTrackingTime(0);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="highrated-dashboard">
      {/* Header */}
      <div className="highrated-header">
        <h1>Stock Management</h1>
        <div className="period-switch">
          <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            Out of Stock Items
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="highrated-stats">
        <div className="stat-card">
          <div className="stat-number">{outlets.length}</div>
          <div className="stat-label">Total Outlets</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stockData.length}</div>
          <div className="stat-label">Out of Stock Items</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{selectedOutlet || 'None'}</div>
          <div className="stat-label">Selected Outlet</div>
        </div>
        {selectedOutlet && (
          <div className="stat-card">
            <div className="stat-number">{formatTime(trackingTime)}</div>
            <div className="stat-label">Time Tracked</div>
          </div>
        )}
      </div>

      {/* Outlet Selection */}
      <div className="highrated-filters">
        <div className="filter-group">
          <label>Select Outlet</label>
          <select 
            value={selectedOutlet} 
            onChange={(e) => handleOutletChange(e.target.value)}
            disabled={loading}
          >
            <option value="">Choose an outlet...</option>
            {outlets.map(outlet => (
              <option key={outlet} value={outlet}>
                {outlet}
              </option>
            ))}
          </select>
        </div>
        
        {selectedOutlet && (
          <div className="filter-group">
            <label>Status</label>
            <div style={{ 
              padding: '14px 18px', 
              border: '1px solid var(--border-light)', 
              borderRadius: '12px',
              background: 'var(--surface-light)',
              color: 'var(--text-primary)',
              fontSize: '15px'
            }}>
              {loading ? 'Loading...' : `${stockData.length} items out of stock`}
            </div>
          </div>
        )}
      </div>

      {/* Debug Info (shows in development or when there are errors) */}
      {(process.env.NODE_ENV === 'development' || error) && (
        <div className="highrated-filters" style={{ marginTop: '10px', background: 'rgba(0,0,0,0.3)' }}>
          <div className="filter-group">
            <label>Debug Info</label>
            <div style={{ 
              padding: '10px', 
              border: '1px solid var(--border-light)', 
              borderRadius: '8px',
              background: 'var(--surface-dark)',
              color: 'var(--text-muted)',
              fontSize: '12px',
              fontFamily: 'monospace'
            }}>
              <div>API Base URL: {API_BASE_URL}</div>
              <div>Outlets loaded: {outlets.length} (hardcoded)</div>
              <div>Selected: {selectedOutlet || 'None'}</div>
              <div>Stock items: {stockData.length}</div>
              <div>Loading: {loading ? 'Yes' : 'No'}</div>
              <div>Error: {error || 'None'}</div>
              <div>Tracking Time: {trackingTime} seconds</div>
              {selectedOutlet && (
                <div>Full URL: {API_BASE_URL}/api/stock-data?outlet={selectedOutlet}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bottom-outlets">
          <div className="outlet-card" style={{ borderLeft: '3px solid #ff4757' }}>
            <h5 style={{ color: '#ff4757' }}>Error Loading Stock Data</h5>
            <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
            <div style={{ marginTop: '15px', padding: '10px', background: 'var(--surface-light)', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                <strong>Troubleshooting:</strong>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                API URL: <code>{API_BASE_URL}/api/stock-data?outlet={selectedOutlet}</code>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '5px' }}>
                Check if the backend server is running and the outlet name is correct.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stock Data Display */}
      {selectedOutlet && !loading && !error && (
        <div className="graphs-section">
          <h4>
            <span style={{ marginRight: '12px' }}>📦</span>
            Out of Stock Items - {selectedOutlet}
          </h4>
          
          {stockData.length === 0 ? (
            <div className="outlet-card">
              <h5 style={{ color: 'var(--text-primary)' }}>No Items Out of Stock</h5>
              <p style={{ color: 'var(--text-secondary)' }}>
                Great news! Either all items are in stock or no data is available for this outlet.
              </p>
              <div style={{ marginTop: '15px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                If this seems incorrect, check the Google Sheets tab "{selectedOutlet}" for data availability.
              </div>
            </div>
          ) : (
            <div style={{ 
              background: 'var(--surface-card)',
              borderRadius: '16px',
              border: '1px solid var(--border-light)',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
            }}>
              <table style={{ 
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.95rem'
              }}>
                <thead>
                  <tr style={{ 
                    background: 'linear-gradient(135deg, var(--surface-light) 0%, var(--surface-card) 100%)',
                    borderBottom: '2px solid var(--border-light)'
                  }}>
                    <th style={{ 
                      padding: '24px 32px',
                      textAlign: 'left',
                      fontWeight: '600',
                      color: 'var(--text-primary)',
                      fontSize: '0.9rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.8px',
                      width: '200px',
                      borderRight: '1px solid var(--border-light)'
                    }}>
                      SKU Code
                    </th>
                    <th style={{ 
                      padding: '24px 32px',
                      textAlign: 'left',
                      fontWeight: '600',
                      color: 'var(--text-primary)',
                      fontSize: '0.9rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.8px'
                    }}>
                      Item Name
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stockData.map((item, index) => (
                    <tr 
                      key={`${item.skuCode}-${index}`}
                      style={{ 
                        borderBottom: index < stockData.length - 1 ? '1px solid var(--border-light)' : 'none',
                        transition: 'all 0.2s ease',
                        cursor: 'default'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--surface-light)';
                        e.currentTarget.style.transform = 'translateX(2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.transform = 'translateX(0px)';
                      }}
                    >
                      <td style={{ 
                        padding: '24px 32px',
                        fontFamily: 'SF Mono, Monaco, Cascadia Code, Roboto Mono, monospace',
                        fontWeight: '700',
                        color: 'var(--text-primary)',
                        fontSize: '1rem',
                        borderRight: '1px solid var(--border-light)',
                        background: 'rgba(0, 0, 0, 0.02)'
                      }}>
                        {item.skuCode}
                      </td>
                      <td style={{ 
                        padding: '24px 32px',
                        color: 'var(--text-secondary)',
                        lineHeight: '1.6'
                      }}>
                        <div>
                          <div style={{ 
                            fontWeight: '500',
                            color: 'var(--text-primary)',
                            fontSize: '1rem',
                            marginBottom: '6px'
                          }}>
                            {item.longName}
                          </div>
                          {item.shortName && item.shortName !== item.longName && (
                            <div style={{ 
                              fontSize: '0.85rem',
                              color: 'var(--text-muted)',
                              fontStyle: 'italic',
                              opacity: '0.8'
                            }}>
                              {item.shortName}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {/* Table Footer with Count */}
              <div style={{
                padding: '16px 32px',
                background: 'var(--surface-light)',
                borderTop: '1px solid var(--border-light)',
                textAlign: 'center',
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
                fontWeight: '500'
              }}>
                {stockData.length} items out of stock in {selectedOutlet}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="graphs-section">
          <div className="outlet-card">
            <h5>Loading Stock Data...</h5>
            <p style={{ color: 'var(--text-secondary)' }}>
              Fetching out-of-stock items for {selectedOutlet}...
            </p>
            <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Loading from: {API_BASE_URL}/api/stock-data?outlet={selectedOutlet}
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      {!selectedOutlet && !loading && (
        <div className="bottom-outlets">
          <h4>
            <span style={{ marginRight: '12px' }}>ℹ️</span>
            Stock Management Instructions
          </h4>
          <div className="outlet-card">
            <h5>How to Use Stock Dashboard</h5>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              <li>Select an outlet from the dropdown above ({outlets.length} outlets available)</li>
              <li>View all out-of-stock items for that outlet</li>
              <li>Items display SKU Code, full product names, and short names</li>
              <li>Data is fetched from Google Sheets in real-time</li>
              <li>Zero items means all products are in stock (good news!)</li>
              <li>Time spent on each outlet is tracked and displayed</li>
            </ul>
            <div style={{ marginTop: '15px', padding: '15px', background: 'var(--surface-light)', borderRadius: '8px' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 10px 0' }}>
                <strong>System Info:</strong>
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0' }}>
                Backend API: {API_BASE_URL}<br/>
                Environment: {process.env.NODE_ENV || 'production'}<br/>
                Outlet data: Hardcoded (reliable)<br/>
                Stock data: Real-time from Google Sheets<br/>
                Tracking: Active when outlet selected
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockDashboard;