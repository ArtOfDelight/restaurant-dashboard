import React, { useState, useEffect } from 'react';
import './HighRatedDashboard.css'; // Using the provided CSS file

const StockDashboard = () => {
  // API Configuration for deployed app
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://restaurant-dashboard-1-nqbi.onrender.com';

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

  // Set hardcoded outlets on component mount (no API call needed)
  useEffect(() => {
    console.log('📦 Using hardcoded outlets:', hardcodedOutlets);
    console.log('🌐 API Base URL:', API_BASE_URL);
    setOutlets(hardcodedOutlets);
    setError(''); // Clear any previous errors
  }, []);

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
    setSelectedOutlet(outlet);
    if (outlet) {
      fetchStockData(outlet);
    } else {
      setStockData([]);
    }
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
            <div className="outlets-list">
              {stockData.map((item, index) => (
                <div key={`${item.skuCode}-${index}`} className="submission-card">
                  <div style={{ padding: '25px' }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'flex-start',
                      marginBottom: '15px'
                    }}>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ 
                          color: 'var(--text-primary)', 
                          fontSize: '1.2rem', 
                          fontWeight: '600',
                          margin: '0 0 8px 0',
                          fontFamily: 'SF Mono, Monaco, Cascadia Code, Roboto Mono, monospace'
                        }}>
                          {item.skuCode}
                        </h3>
                        <p style={{ 
                          color: 'var(--text-secondary)', 
                          fontSize: '0.95rem',
                          margin: '0',
                          lineHeight: '1.5'
                        }}>
                          {item.longName}
                        </p>
                        {item.shortName && item.shortName !== item.longName && (
                          <p style={{ 
                            color: 'var(--text-muted)', 
                            fontSize: '0.85rem',
                            margin: '5px 0 0 0',
                            fontStyle: 'italic'
                          }}>
                            Short Name: {item.shortName}
                          </p>
                        )}
                      </div>
                      <div style={{
                        background: 'rgba(255, 71, 87, 0.1)',
                        color: '#ff4757',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        Out of Stock
                      </div>
                    </div>
                    
                    <div style={{
                      borderTop: '1px solid var(--border-light)',
                      paddingTop: '15px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)'
                    }}>
                      <span>SKU: {item.skuCode}</span>
                      <span>Outlet: {selectedOutlet}</span>
                    </div>
                  </div>
                </div>
              ))}
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
            </ul>
            <div style={{ marginTop: '15px', padding: '15px', background: 'var(--surface-light)', borderRadius: '8px' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 10px 0' }}>
                <strong>System Info:</strong>
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0' }}>
                Backend API: {API_BASE_URL}<br/>
                Environment: {process.env.NODE_ENV || 'production'}<br/>
                Outlet data: Hardcoded (reliable)<br/>
                Stock data: Real-time from Google Sheets
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockDashboard;