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

  // State management
  const [activeTab, setActiveTab] = useState('outofstock'); // 'outofstock' or 'tracker'
  const [outlets, setOutlets] = useState(hardcodedOutlets);
  const [selectedOutlet, setSelectedOutlet] = useState('');
  const [stockData, setStockData] = useState([]);
  const [trackerData, setTrackerData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Tracker filters
  const [trackerOutlet, setTrackerOutlet] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Set hardcoded outlets on component mount (no API call needed)
  useEffect(() => {
    console.log('📦 Using hardcoded outlets:', hardcodedOutlets);
    console.log('🌐 API Base URL:', API_BASE_URL);
    setOutlets(hardcodedOutlets);
    setError(''); // Clear any previous errors
  }, []);

  // Fetch stock data for out-of-stock tab
  const fetchStockData = async (outlet) => {
    if (!outlet) return;
    
    try {
      setLoading(true);
      setError('');
      
      console.log(`🔍 Fetching stock data for outlet: ${outlet}`);
      
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
    } finally {
      setLoading(false);
    }
  };

  // Fetch tracker data
  const fetchTrackerData = async (outlet = trackerOutlet, start = startDate, end = endDate) => {
    try {
      setLoading(true);
      setError('');
      
      console.log(`🔍 Fetching tracker data - Outlet: ${outlet || 'all'}, Date range: ${start || 'any'} to ${end || 'any'}`);
      
      let url = `${API_BASE_URL}/api/stock-tracker-data`;
      const params = new URLSearchParams();
      
      if (outlet) params.append('outlet', outlet);
      if (start) params.append('startDate', start);
      if (end) params.append('endDate', end);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      console.log(`📡 Fetching from: ${url}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText}. Response: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('📊 Received tracker data:', data);
      
      if (data.success) {
        setTrackerData(data.trackerData || []);
        console.log(`✅ Successfully loaded ${data.trackerData?.length || 0} tracker entries`);
      } else {
        setError(data.error || 'Failed to fetch tracker data');
        setTrackerData([]);
      }
    } catch (err) {
      const errorMsg = `Network error: ${err.message}`;
      setError(errorMsg);
      setTrackerData([]);
      console.error('💥 Tracker fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle outlet change for out-of-stock tab
  const handleOutletChange = (outlet) => {
    console.log(`🏪 Outlet selected: ${outlet}`);
    setSelectedOutlet(outlet);
    if (outlet) {
      fetchStockData(outlet);
    } else {
      setStockData([]);
    }
  };

  // Handle tracker filter changes
  const handleTrackerFilter = () => {
    fetchTrackerData(trackerOutlet, startDate, endDate);
  };

  // Handle tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setError('');
    if (tab === 'tracker' && trackerData.length === 0) {
      fetchTrackerData(); // Load tracker data when switching to tracker tab
    }
  };

  // Format date for display
  const formatDisplayDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch (error) {
      return dateString;
    }
  };

  return (
    <div className="highrated-dashboard">
      {/* Header */}
      <div className="highrated-header">
        <h1>Stock Management</h1>
        <div className="period-switch">
          <button 
            className={activeTab === 'outofstock' ? 'active' : ''}
            onClick={() => handleTabChange('outofstock')}
          >
            Out of Stock Items
          </button>
          <button 
            className={activeTab === 'tracker' ? 'active' : ''}
            onClick={() => handleTabChange('tracker')}
          >
            Tracker
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="highrated-stats">
        <div className="stat-card">
          <div className="stat-number">{outlets.length}</div>
          <div className="stat-label">Total Outlets</div>
        </div>
        {activeTab === 'outofstock' ? (
          <>
            <div className="stat-card">
              <div className="stat-number">{stockData.length}</div>
              <div className="stat-label">Out of Stock Items</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{selectedOutlet || 'None'}</div>
              <div className="stat-label">Selected Outlet</div>
            </div>
          </>
        ) : (
          <>
            <div className="stat-card">
              <div className="stat-number">{trackerData.length}</div>
              <div className="stat-label">Tracker Entries</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{trackerOutlet || 'All'}</div>
              <div className="stat-label">Filtered Outlet</div>
            </div>
          </>
        )}
      </div>

      {/* Filters */}
      {activeTab === 'outofstock' ? (
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
      ) : (
        <div className="highrated-filters">
          <div className="filter-group">
            <label>Filter by Outlet</label>
            <select 
              value={trackerOutlet} 
              onChange={(e) => setTrackerOutlet(e.target.value)}
              disabled={loading}
            >
              <option value="">All outlets...</option>
              {outlets.map(outlet => (
                <option key={outlet} value={outlet}>
                  {outlet}
                </option>
              ))}
            </select>
          </div>
          
          <div className="filter-group">
            <label>Start Date</label>
            <input 
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ 
                padding: '14px 18px', 
                border: '1px solid var(--border-light)', 
                borderRadius: '12px',
                background: 'var(--surface-light)',
                color: 'var(--text-primary)',
                fontSize: '15px',
                width: '100%'
              }}
            />
          </div>
          
          <div className="filter-group">
            <label>End Date</label>
            <input 
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ 
                padding: '14px 18px', 
                border: '1px solid var(--border-light)', 
                borderRadius: '12px',
                background: 'var(--surface-light)',
                color: 'var(--text-primary)',
                fontSize: '15px',
                width: '100%'
              }}
            />
          </div>
          
          <div className="filter-group">
            <label>&nbsp;</label>
            <button 
              onClick={handleTrackerFilter}
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
              {loading ? 'Loading...' : 'Apply Filter'}
            </button>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bottom-outlets">
          <div className="outlet-card" style={{ borderLeft: '3px solid #ff4757' }}>
            <h5 style={{ color: '#ff4757' }}>Error Loading Data</h5>
            <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
            <div style={{ marginTop: '15px', padding: '10px', background: 'var(--surface-light)', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                <strong>Troubleshooting:</strong>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                API URL: <code>{API_BASE_URL}/api/{activeTab === 'outofstock' ? 'stock-data' : 'stock-tracker-data'}</code>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '5px' }}>
                Check if the backend server is running and the configuration is correct.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content Display */}
      {activeTab === 'outofstock' ? (
        <>
          {/* Out of Stock Data Display */}
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
        </>
      ) : (
        <>
          {/* Tracker Data Display */}
          {!loading && !error && (
            <div className="graphs-section">
              <h4>
                <span style={{ marginRight: '12px' }}>📊</span>
                Stock Tracker {trackerOutlet ? `- ${trackerOutlet}` : '- All Outlets'}
              </h4>
              
              {trackerData.length === 0 ? (
                <div className="outlet-card">
                  <h5 style={{ color: 'var(--text-primary)' }}>No Tracker Data Found</h5>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    No tracking entries match your current filters. Try adjusting the date range or outlet selection.
                  </p>
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
                          borderRight: '1px solid var(--border-light)'
                        }}>
                          Time
                        </th>
                        <th style={{ 
                          padding: '24px 32px',
                          textAlign: 'left',
                          fontWeight: '600',
                          color: 'var(--text-primary)',
                          fontSize: '0.9rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.8px',
                          borderRight: '1px solid var(--border-light)'
                        }}>
                          Outlet
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
                          Items
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {trackerData.map((entry, index) => (
                        <tr 
                          key={entry.id || index}
                          style={{ 
                            borderBottom: index < trackerData.length - 1 ? '1px solid var(--border-light)' : 'none',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <td style={{ 
                            padding: '24px 32px',
                            fontFamily: 'SF Mono, Monaco, Cascadia Code, Roboto Mono, monospace',
                            fontWeight: '600',
                            color: 'var(--text-primary)',
                            fontSize: '0.9rem',
                            borderRight: '1px solid var(--border-light)',
                            background: 'rgba(0, 0, 0, 0.02)'
                          }}>
                            {formatDisplayDate(entry.time)}
                          </td>
                          <td style={{ 
                            padding: '24px 32px',
                            fontWeight: '600',
                            color: 'var(--text-primary)',
                            fontSize: '1rem',
                            borderRight: '1px solid var(--border-light)'
                          }}>
                            {entry.outlet}
                          </td>
                          <td style={{ 
                            padding: '24px 32px',
                            color: 'var(--text-secondary)',
                            lineHeight: '1.6'
                          }}>
                            <div style={{ 
                              fontWeight: '400',
                              color: 'var(--text-primary)',
                              fontSize: '0.95rem'
                            }}>
                              {entry.items}
                            </div>
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
                    {trackerData.length} tracker entries found
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Loading State */}
      {loading && (
        <div className="graphs-section">
          <div className="outlet-card">
            <h5>Loading {activeTab === 'outofstock' ? 'Stock' : 'Tracker'} Data...</h5>
            <p style={{ color: 'var(--text-secondary)' }}>
              Fetching {activeTab === 'outofstock' ? `out-of-stock items for ${selectedOutlet}` : 'tracker entries'}...
            </p>
          </div>
        </div>
      )}

      {/* Instructions */}
      {((activeTab === 'outofstock' && !selectedOutlet) || (activeTab === 'tracker' && trackerData.length === 0)) && !loading && (
        <div className="bottom-outlets">
          <h4>
            <span style={{ marginRight: '12px' }}>ℹ️</span>
            {activeTab === 'outofstock' ? 'Stock Management Instructions' : 'Tracker Instructions'}
          </h4>
          <div className="outlet-card">
            <h5>How to Use {activeTab === 'outofstock' ? 'Stock Dashboard' : 'Stock Tracker'}</h5>
            {activeTab === 'outofstock' ? (
              <ul style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                <li>Select an outlet from the dropdown above ({outlets.length} outlets available)</li>
                <li>View all out-of-stock items for that outlet</li>
                <li>Items display SKU Code, full product names, and short names</li>
                <li>Data is fetched from Google Sheets in real-time</li>
                <li>Zero items means all products are in stock (good news!)</li>
              </ul>
            ) : (
              <ul style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                <li>Filter tracker data by outlet and date range</li>
                <li>View historical stock tracking entries with timestamps</li>
                <li>Track when and which items were monitored per outlet</li>
                <li>Use date filters to analyze specific time periods</li>
                <li>All data is synchronized with Google Sheets Tracker tab</li>
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StockDashboard;