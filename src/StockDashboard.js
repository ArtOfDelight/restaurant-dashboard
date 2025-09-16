import React, { useState, useEffect } from 'react';
import './HighRatedDashboard.css'; // Using the provided CSS file

// Tab configuration
const TABS = [
  { id: 'outofstock', label: 'Out of Stock', icon: '📦' },
  { id: 'tracker', label: 'Tracker', icon: '📊' }
];

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

  // Tab state
  const [activeTab, setActiveTab] = useState('outofstock');
  
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
          <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            Stock Management System
          </span>
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

      {/* Tab Navigation */}
      <div className="tab-navigation" style={{ 
        display: 'flex', 
        gap: '10px', 
        marginBottom: '2rem',
        borderBottom: '1px solid var(--border-light)',
        paddingBottom: '10px'
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              border: 'none',
              borderRadius: '8px',
              background: activeTab === tab.id ? 'var(--primary-color, #007bff)' : 'var(--surface-light)',
              color: activeTab === tab.id ? 'white' : 'var(--text-primary)',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              transition: 'all 0.2s ease'
            }}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
            <span className="tab-count" style={{
              background: activeTab === tab.id ? 'rgba(255,255,255,0.2)' : 'var(--surface-card)',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '12px'
            }}>
              ({tab.id === 'outofstock' ? stockData.length : trackerData.length})
            </span>
          </button>
        ))}
      </div>

      {/* Out of Stock Tab Content */}
      {activeTab === 'outofstock' && (
        <>
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

          {/* Instructions for Out of Stock */}
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
        </>
      )}

      {/* Tracker Tab Content */}
      {activeTab === 'tracker' && (
        <>
          {/* Tracker Filters */}
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

          {/* Tracker Data Display */}
          <div className="graphs-section">
            <h4>
              <span style={{ marginRight: '12px' }}>📊</span>
              Stock Tracker {trackerOutlet ? `- ${trackerOutlet}` : '- All Outlets'}
            </h4>
            
            {trackerData.length === 0 && !loading ? (
              <div className="outlet-card">
                <h5 style={{ color: 'var(--text-primary)' }}>No Tracker Data Found</h5>
                <p style={{ color: 'var(--text-secondary)' }}>
                  No tracking entries match your current filters. Try adjusting the date range or outlet selection.
                </p>
              </div>
            ) : trackerData.length > 0 ? (
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
            ) : null}
          </div>

          {/* Instructions for Tracker */}
          {trackerData.length === 0 && !loading && (
            <div className="bottom-outlets">
              <h4>
                <span style={{ marginRight: '12px' }}>ℹ️</span>
                Tracker Instructions
              </h4>
              <div className="outlet-card">
                <h5>How to Use Stock Tracker</h5>
                <ul style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  <li>Filter tracker data by outlet and date range</li>
                  <li>View historical stock tracking entries with timestamps</li>
                  <li>Track when and which items were monitored per outlet</li>
                  <li>Use date filters to analyze specific time periods</li>
                  <li>All data is synchronized with Google Sheets Tracker tab</li>
                </ul>
              </div>
            </div>
          )}
        </>
      )}

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
              <div>Active Tab: {activeTab}</div>
              <div>Selected Outlet: {selectedOutlet || 'None'}</div>
              <div>Stock items: {stockData.length}</div>
              <div>Tracker entries: {trackerData.length}</div>
              <div>Loading: {loading ? 'Yes' : 'No'}</div>
              <div>Error: {error || 'None'}</div>
              {selectedOutlet && activeTab === 'outofstock' && (
                <div>Stock URL: {API_BASE_URL}/api/stock-data?outlet={selectedOutlet}</div>
              )}
              {activeTab === 'tracker' && (
                <div>Tracker URL: {API_BASE_URL}/api/stock-tracker-data</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bottom-outlets">
          <div className="outlet-card" style={{ borderLeft: '3px solid #ff4757' }}>
            <h5 style={{ color: '#ff4757' }}>Error Loading {activeTab === 'outofstock' ? 'Stock' : 'Tracker'} Data</h5>
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

      {/* Loading State */}
      {loading && (
        <div className="graphs-section">
          <div className="outlet-card">
            <h5>Loading {activeTab === 'outofstock' ? 'Stock' : 'Tracker'} Data...</h5>
            <p style={{ color: 'var(--text-secondary)' }}>
              Fetching {activeTab === 'outofstock' ? `out-of-stock items for ${selectedOutlet}` : 'tracker entries'}...
            </p>
            <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Loading from: {API_BASE_URL}/api/{activeTab === 'outofstock' ? 'stock-data' : 'stock-tracker-data'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockDashboard;