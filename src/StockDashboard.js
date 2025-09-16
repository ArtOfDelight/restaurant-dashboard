import React, { useState, useEffect } from 'react';
import './HighRatedDashboard.css'; // Using the provided CSS file

const StockDashboard = () => {
  const [outlets, setOutlets] = useState([]);
  const [selectedOutlet, setSelectedOutlet] = useState('');
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch available outlets on component mount
  useEffect(() => {
    fetchOutlets();
  }, []);

  const fetchOutlets = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/stock-data');
      const data = await response.json();
      
      if (data.success && data.outlets) {
        setOutlets(data.outlets);
        setError('');
      } else {
        setError('Failed to fetch outlets');
      }
    } catch (err) {
      setError('Network error while fetching outlets');
      console.error('Error fetching outlets:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStockData = async (outlet) => {
    if (!outlet) return;
    
    try {
      setLoading(true);
      setError('');
      
      const response = await fetch(`/api/stock-data?outlet=${encodeURIComponent(outlet)}`);
      const data = await response.json();
      
      if (data.success) {
        setStockData(data.items || []);
      } else {
        setError(data.error || 'Failed to fetch stock data');
        setStockData([]);
      }
    } catch (err) {
      setError('Network error while fetching stock data');
      setStockData([]);
      console.error('Error fetching stock data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOutletChange = (outlet) => {
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

      {/* Error Display */}
      {error && (
        <div className="bottom-outlets">
          <div className="outlet-card" style={{ borderLeft: '3px solid #ff4757' }}>
            <h5 style={{ color: '#ff4757' }}>Error</h5>
            <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
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
              <h5 style={{ color: 'var(--text-primary)' }}>No Items</h5>
              <p style={{ color: 'var(--text-secondary)' }}>
                All items are in stock or no data available for this outlet.
              </p>
            </div>
          ) : (
            <div className="outlets-list">
              {stockData.map((item, index) => (
                <div key={index} className="submission-card">
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
                        {item.shortName && (
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
            <h5>Loading...</h5>
            <p style={{ color: 'var(--text-secondary)' }}>
              {selectedOutlet ? `Fetching data for ${selectedOutlet}...` : 'Loading outlets...'}
            </p>
          </div>
        </div>
      )}

      {/* Instructions */}
      {!selectedOutlet && !loading && (
        <div className="bottom-outlets">
          <h4>
            <span style={{ marginRight: '12px' }}>ℹ️</span>
            Instructions
          </h4>
          <div className="outlet-card">
            <h5>How to Use Stock Dashboard</h5>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              <li>Select an outlet from the dropdown above</li>
              <li>View all out-of-stock items for that outlet</li>
              <li>Items show SKU Code and full product names</li>
              <li>Data is updated in real-time from inventory system</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockDashboard;