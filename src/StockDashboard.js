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
  const [stockSummary, setStockSummary] = useState([]); // For tracker tab aggregated view
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Modal state for item details (for tracker tab)
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemDetails, setItemDetails] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  
  // Date filter state for tracker tab
  const [trackerStartDate, setTrackerStartDate] = useState('');
  const [trackerEndDate, setTrackerEndDate] = useState('');

  // Set hardcoded outlets on component mount (no API call needed)
  useEffect(() => {
    console.log('📦 Using hardcoded outlets:', hardcodedOutlets);
    console.log('🌐 API Base URL:', API_BASE_URL);
    setOutlets(hardcodedOutlets);
    setError(''); // Clear any previous errors
  }, []);

  // Fetch stock data for out-of-stock tab (single outlet)
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

  // Fetch stock summary data for tracker tab (aggregated across all outlets)
  const fetchStockSummary = async () => {
    try {
      setLoading(true);
      setError('');
      
      console.log('🔍 Fetching stock summary across all outlets');
      
      const response = await fetch(`${API_BASE_URL}/api/stock-summary`);
      console.log(`📡 Response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText}. Response: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('📦 Received summary data:', data);
      
      if (data.success) {
        setStockSummary(data.summary || []);
        console.log(`✅ Successfully loaded ${data.summary?.length || 0} unique items`);
      } else {
        setError(data.error || 'Failed to fetch stock summary');
        setStockSummary([]);
        console.error('❌ API returned error:', data);
      }
    } catch (err) {
      const errorMsg = `Network error: ${err.message}`;
      setError(errorMsg);
      setStockSummary([]);
      console.error('💥 Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Format date from "01/09/2025 00:13" to "Jan 15, 2025 10:30 AM"
  const formatTrackerDate = (dateString) => {
    try {
      // Handle format like "01/09/2025 00:13"
      const parts = dateString.split(' ');
      if (parts.length === 2) {
        const datePart = parts[0]; // "01/09/2025"
        const timePart = parts[1]; // "00:13"
        
        const [day, month, year] = datePart.split('/');
        const [hour, minute] = timePart.split(':');
        
        const date = new Date(year, month - 1, day, hour, minute);
        return date.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
      }
      
      // Fallback to direct parsing
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      console.warn('Date formatting error:', error);
      return dateString;
    }
  };

  // Fetch item details for modal with time filtering
  const fetchItemDetails = async (skuCode) => {
    try {
      setModalLoading(true);
      
      console.log(`🔍 Fetching item details for SKU: ${skuCode}`);
      
      let url = `${API_BASE_URL}/api/stock-item-details/${encodeURIComponent(skuCode)}`;
      const params = new URLSearchParams();
      
      if (trackerStartDate) params.append('startDate', trackerStartDate);
      if (trackerEndDate) params.append('endDate', trackerEndDate);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText}. Response: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('📋 Received item details:', data);
      
      if (data.success) {
        setItemDetails(data);
      } else {
        throw new Error(data.error || 'Failed to fetch item details');
      }
    } catch (err) {
      console.error('💥 Item details fetch error:', err);
      setItemDetails({
        success: false,
        error: err.message,
        itemInfo: { skuCode, longName: 'Unknown Item' },
        outletDetails: [],
        allTrackerEntries: []
      });
    } finally {
      setModalLoading(false);
    }
  };

  // Handle item click to show details modal (for tracker tab)
  const handleItemClick = async (item) => {
    setSelectedItem(item);
    setShowModal(true);
    setItemDetails(null);
    await fetchItemDetails(item.skuCode);
  };

  // Close modal
  const closeModal = () => {
    setShowModal(false);
    setSelectedItem(null);
    setItemDetails(null);
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

  // Handle tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setError('');
    
    if (tab === 'tracker' && stockSummary.length === 0) {
      fetchStockSummary(); // Load stock summary when switching to tracker tab
    }
  };

  // Format display date for regular timestamps
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
        <h1>Out of Stock Management</h1>
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
              <div className="stat-number">{stockSummary.length}</div>
              <div className="stat-label">Unique Items Tracked</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stockSummary.reduce((sum, item) => sum + item.outletCount, 0)}</div>
              <div className="stat-label">Total Instances</div>
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
              ({tab.id === 'outofstock' ? stockData.length : stockSummary.length})
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
          {/* Time Filters and Refresh Button */}
          <div className="highrated-filters">
            <div className="filter-group">
              <label>Start Date</label>
              <input 
                type="datetime-local"
                value={trackerStartDate}
                onChange={(e) => setTrackerStartDate(e.target.value)}
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
                value={trackerEndDate}
                onChange={(e) => setTrackerEndDate(e.target.value)}
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
              <label>Item Tracker</label>
              <button 
                onClick={fetchStockSummary}
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
                {loading ? 'Loading...' : 'Load Item Summary'}
              </button>
            </div>
            
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
                {loading ? 'Loading...' : `${stockSummary.length} unique items tracked`}
              </div>
            </div>
          </div>

          {/* Tracker Summary Display */}
          <div className="graphs-section">
            <h4>
              <span style={{ marginRight: '12px' }}>📊</span>
              Item Tracker - Outlet Distribution
            </h4>
            
            {!loading && !error && stockSummary.length === 0 ? (
              <div className="outlet-card">
                <h5 style={{ color: 'var(--text-primary)' }}>No Items to Track</h5>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Click "Load Item Summary" to see which items are out of stock across outlets.
                </p>
              </div>
            ) : !loading && !error && stockSummary.length > 0 ? (
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
                        letterSpacing: '0.8px',
                        borderRight: '1px solid var(--border-light)'
                      }}>
                        Item Name
                      </th>
                      <th style={{ 
                        padding: '24px 32px',
                        textAlign: 'center',
                        fontWeight: '600',
                        color: 'var(--text-primary)',
                        fontSize: '0.9rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.8px',
                        width: '150px'
                      }}>
                        Outlets Affected
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockSummary.map((item, index) => (
                      <tr 
                        key={`${item.skuCode}-${index}`}
                        style={{ 
                          borderBottom: index < stockSummary.length - 1 ? '1px solid var(--border-light)' : 'none',
                          transition: 'all 0.2s ease',
                          cursor: 'default'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--surface-light)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
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
                          lineHeight: '1.6',
                          borderRight: '1px solid var(--border-light)'
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
                        <td style={{ 
                          padding: '24px 32px',
                          textAlign: 'center'
                        }}>
                          <button
                            onClick={() => handleItemClick(item)}
                            style={{
                              background: item.outletCount > 5 ? '#ef4444' : item.outletCount > 2 ? '#f59e0b' : '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: '20px',
                              padding: '8px 16px',
                              fontSize: '14px',
                              fontWeight: '700',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              minWidth: '60px'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.transform = 'scale(1.05)';
                              e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.transform = 'scale(1)';
                              e.target.style.boxShadow = 'none';
                            }}
                          >
                            {item.outletCount}
                          </button>
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
                  {stockSummary.length} unique items tracked across all outlets
                </div>
              </div>
            ) : null}
          </div>

          {/* Instructions for Tracker */}
          {stockSummary.length === 0 && !loading && (
            <div className="bottom-outlets">
              <h4>
                <span style={{ marginRight: '12px' }}>ℹ️</span>
                Tracker Instructions
              </h4>
              <div className="outlet-card">
                <h5>How to Use Item Tracker</h5>
                <ul style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  <li>View all unique items that are out of stock across any outlets</li>
                  <li>See how many outlets have each item out of stock</li>
                  <li>Click on the outlet count number to see which specific outlets</li>
                  <li>Items are sorted by outlet count (most critical first)</li>
                  <li>Color coding: Red (5+ outlets), Orange (3-4 outlets), Green (1-2 outlets)</li>
                </ul>
              </div>
            </div>
          )}
        </>
      )}

      {/* Updated Item Details Modal with Historical Tracker Entries */}
      {showModal && selectedItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }} onClick={closeModal}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'var(--surface-dark, #1a1a1a)',
            borderRadius: '24px',
            padding: '0',
            maxWidth: '900px',
            width: '90%',
            maxHeight: '85vh',
            overflow: 'hidden',
            boxShadow: '0 25px 80px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1)',
            transform: 'scale(1)',
            animation: 'modalSlideIn 0.3s ease-out',
            border: '1px solid var(--border-light)'
          }}>
            {/* Modal Header */}
            <div style={{
              background: 'var(--surface-dark, #1a1a1a)',
              padding: '24px 32px',
              color: 'var(--text-primary)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid var(--border-light)'
            }}>
              <div>
                <h2 style={{ 
                  margin: 0, 
                  fontSize: '24px', 
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  textShadow: '0 0 10px rgba(255, 255, 255, 0.1)'
                }}>
                  Historical Tracking Analysis
                </h2>
                <p style={{ 
                  margin: '4px 0 0 0', 
                  fontSize: '16px', 
                  opacity: '0.8',
                  fontWeight: '500',
                  color: 'var(--text-secondary)'
                }}>
                  SKU: {selectedItem.skuCode}
                </p>
              </div>
              <button 
                onClick={closeModal}
                style={{
                  background: 'var(--surface-light)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '20px',
                  color: 'var(--text-primary)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => e.target.style.background = 'var(--surface-card)'}
                onMouseLeave={(e) => e.target.style.background = 'var(--surface-light)'}
              >
                ×
              </button>
            </div>
            
            {/* Modal Body */}
            <div style={{ padding: '32px', maxHeight: 'calc(85vh - 100px)', overflow: 'auto' }}>
              {modalLoading ? (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '60px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '20px'
                }}>
                  <div style={{
                    width: '50px',
                    height: '50px',
                    border: '4px solid #e2e8f0',
                    borderTop: '4px solid #667eea',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }}></div>
                  <div style={{ fontSize: '18px', color: '#64748b', fontWeight: '500' }}>
                    Loading historical tracking data...
                  </div>
                </div>
              ) : itemDetails ? (
                <div>
                  {/* Item Information Card */}
                  <div style={{ 
                    marginBottom: '28px', 
                    padding: '24px', 
                    background: 'var(--surface-card)', 
                    borderRadius: '16px',
                    border: '1px solid var(--border-light)'
                  }}>
                    <h3 style={{ 
                      margin: '0 0 8px 0', 
                      fontSize: '20px', 
                      color: 'var(--text-primary)',
                      fontWeight: '700'
                    }}>
                      {itemDetails.itemInfo?.longName}
                    </h3>
                    <div style={{ display: 'flex', gap: '24px', fontSize: '14px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                      <div>
                        <strong>SKU:</strong> {itemDetails.itemInfo?.skuCode}
                      </div>
                      <div>
                        <strong>Outlets Tracked:</strong> {itemDetails.summary?.outletsAffected || 0} outlets
                      </div>
                      <div>
                        <strong>Total Entries:</strong> {itemDetails.summary?.totalHistoricalEntries || 0}
                      </div>
                      {itemDetails.summary?.dateFiltersApplied && (
                        <div style={{ color: 'var(--primary-color, #7c3aed)', fontWeight: '600' }}>
                          📅 Date Filtered Results
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Historical Timeline - All Entries */}
                  {itemDetails.allTrackerEntries && itemDetails.allTrackerEntries.length > 0 && (
                    <div style={{ marginBottom: '24px' }}>
                      <h4 style={{ 
                        margin: '0 0 20px 0', 
                        fontSize: '18px', 
                        color: 'var(--text-primary)',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        🕐 Complete Historical Timeline ({itemDetails.allTrackerEntries.length} entries)
                      </h4>
                      
                      <div style={{
                        background: 'var(--surface-card)',
                        border: '1px solid var(--border-light)',
                        borderRadius: '16px',
                        padding: '20px',
                        maxHeight: '300px',
                        overflow: 'auto'
                      }}>
                        {itemDetails.allTrackerEntries
                          .sort((a, b) => new Date(b.time) - new Date(a.time)) // Sort by most recent first
                          .map((entry, index) => (
                          <div key={index} style={{
                            padding: '12px 16px',
                            marginBottom: index < itemDetails.allTrackerEntries.length - 1 ? '8px' : '0',
                            background: 'var(--surface-light)',
                            borderRadius: '12px',
                            border: '1px solid var(--border-light)',
                            fontSize: '14px',
                            lineHeight: '1.4'
                          }}>
                            <div style={{ 
                              color: 'var(--text-primary)', 
                              fontWeight: '600',
                              marginBottom: '4px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}>
                              <span>
                                📍 {entry.outlet}
                              </span>
                              <span style={{ 
                                fontSize: '12px', 
                                color: 'var(--text-muted)',
                                fontWeight: '500' 
                              }}>
                                {formatTrackerDate(entry.time)}
                              </span>
                            </div>
                            <div style={{ 
                              color: 'var(--text-secondary)',
                              fontSize: '13px',
                              paddingLeft: '20px'
                            }}>
                              Marked out of stock - {entry.items}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Outlets List with Tracker History */}
                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ 
                      margin: '0 0 20px 0', 
                      fontSize: '18px', 
                      color: 'var(--text-primary)',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      📍 Outlets with Tracking History ({itemDetails.outletDetails?.length || 0})
                    </h4>
                    
                    {itemDetails.outletDetails && itemDetails.outletDetails.length > 0 ? (
                      <div style={{ display: 'grid', gap: '16px' }}>
                        {itemDetails.outletDetails.map((outlet, index) => (
                          <div key={index} style={{
                            background: 'var(--surface-card)',
                            border: '1px solid var(--border-light)',
                            borderRadius: '16px',
                            padding: '20px',
                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.borderColor = 'var(--primary-color, #667eea)';
                            e.target.style.transform = 'translateY(-2px)';
                            e.target.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.15)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.borderColor = 'var(--border-light)';
                            e.target.style.transform = 'translateY(0px)';
                            e.target.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.05)';
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ 
                                  fontSize: '18px', 
                                  fontWeight: '700', 
                                  color: 'var(--text-primary)',
                                  marginBottom: '8px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px'
                                }}>
                                  📍 {outlet.outlet}
                                  <span style={{
                                    background: '#10b981',
                                    color: 'white',
                                    fontSize: '10px',
                                    fontWeight: '600',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    textTransform: 'uppercase'
                                  }}>
                                    {outlet.entryCount} ENTRIES
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            {/* Tracker History for this outlet */}
                            {outlet.trackerEntries && outlet.trackerEntries.length > 0 && (
                              <div>
                                <div style={{ 
                                  fontSize: '14px', 
                                  fontWeight: '600', 
                                  color: 'var(--primary-color, #7c3aed)',
                                  marginBottom: '12px',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center'
                                }}>
                                  <span>📊 Tracking History</span>
                                  <span style={{ fontSize: '12px', fontWeight: '500' }}>
                                    {outlet.trackerEntries.length} entries
                                  </span>
                                </div>
                                
                                <div style={{
                                  maxHeight: '200px',
                                  overflow: 'auto',
                                  background: 'var(--surface-light)',
                                  borderRadius: '12px',
                                  border: '1px solid var(--border-light)',
                                  padding: '16px'
                                }}>
                                  {outlet.trackerEntries
                                    .sort((a, b) => new Date(b.time) - new Date(a.time)) // Most recent first
                                    .map((entry, entryIndex) => (
                                    <div key={entryIndex} style={{
                                      padding: '10px 12px',
                                      marginBottom: entryIndex < outlet.trackerEntries.length - 1 ? '8px' : '0',
                                      background: 'var(--surface-card)',
                                      borderRadius: '8px',
                                      border: '1px solid var(--border-light)',
                                      fontSize: '13px'
                                    }}>
                                      <div style={{ 
                                        fontWeight: '600', 
                                        color: 'var(--text-primary)',
                                        marginBottom: '4px'
                                      }}>
                                        {formatTrackerDate(entry.time)}
                                      </div>
                                      <div style={{ 
                                        color: 'var(--text-secondary)',
                                        fontSize: '12px',
                                        lineHeight: '1.4'
                                      }}>
                                        {entry.items}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ 
                        textAlign: 'center', 
                        padding: '40px 20px',
                        background: 'var(--surface-card)',
                        borderRadius: '16px',
                        border: '1px solid var(--border-light)'
                      }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
                        <div style={{ fontSize: '16px', color: 'var(--text-primary)', fontWeight: '500' }}>
                          No tracking history found for this item
                        </div>
                        {itemDetails.summary?.dateFiltersApplied && (
                          <div style={{ fontSize: '14px', color: 'var(--primary-color, #7c3aed)', marginTop: '8px' }}>
                            Try adjusting your date filters to see more results
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Summary Footer */}
                  {itemDetails.summary && (
                    <div style={{
                      marginTop: '24px',
                      padding: '20px',
                      background: 'var(--surface-card)',
                      borderRadius: '16px',
                      border: '1px solid var(--border-light)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)' }}>
                            {itemDetails.summary.outletsAffected}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>
                            Outlets Tracked
                          </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)' }}>
                            {itemDetails.summary.totalHistoricalEntries}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>
                            Total Entries
                          </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)' }}>
                            {itemDetails.summary.dateRange?.oldest ? formatTrackerDate(itemDetails.summary.dateRange.oldest) : 'N/A'}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>
                            First Entry
                          </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)' }}>
                            {itemDetails.summary.dateRange?.newest ? formatTrackerDate(itemDetails.summary.dateRange.newest) : 'N/A'}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>
                            Latest Entry
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '60px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '16px'
                }}>
                  <div style={{ fontSize: '48px' }}>⚠️</div>
                  <div style={{ fontSize: '18px', color: 'var(--text-primary)', fontWeight: '500' }}>
                    Failed to load tracking details
                  </div>
                  <button
                    onClick={() => fetchItemDetails(selectedItem.skuCode)}
                    style={{
                      padding: '10px 20px',
                      background: 'var(--primary-color, #667eea)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* CSS Animation Styles */}
          <style>
            {`
              @keyframes modalSlideIn {
                from {
                  opacity: 0;
                  transform: scale(0.9) translateY(-20px);
                }
                to {
                  opacity: 1;
                  transform: scale(1) translateY(0px);
                }
              }
              
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}
          </style>
        </div>
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
              <div>Tracker Summary Items: {stockSummary.length}</div>
              <div>Loading: {loading ? 'Yes' : 'No'}</div>
              <div>Error: {error || 'None'}</div>
              {selectedOutlet && activeTab === 'outofstock' && (
                <div>Stock URL: {API_BASE_URL}/api/stock-data?outlet={selectedOutlet}</div>
              )}
              {activeTab === 'tracker' && (
                <div>Tracker URL: {API_BASE_URL}/api/stock-summary</div>
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
                API URL: <code>{API_BASE_URL}/api/{activeTab === 'outofstock' ? 'stock-data' : 'stock-summary'}</code>
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
              Fetching {activeTab === 'outofstock' ? `out-of-stock items for ${selectedOutlet}` : 'aggregated stock data from all outlets'}...
            </p>
            <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Loading from: {API_BASE_URL}/api/{activeTab === 'outofstock' ? 'stock-data' : 'stock-summary'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockDashboard;