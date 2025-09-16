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
  const [stockSummary, setStockSummary] = useState([]); // Changed from stockData
  const [trackerData, setTrackerData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Modal state for item details
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemDetails, setItemDetails] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  
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

  // Fetch stock summary data for out-of-stock tab (aggregated across all outlets)
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

  // Fetch item details for modal
  const fetchItemDetails = async (skuCode) => {
    try {
      setModalLoading(true);
      
      console.log(`🔍 Fetching item details for SKU: ${skuCode}`);
      
      const response = await fetch(`${API_BASE_URL}/api/stock-item-details/${encodeURIComponent(skuCode)}`);
      
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
        outletDetails: []
      });
    } finally {
      setModalLoading(false);
    }
  };

  // Handle item click to show details modal
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

  // Handle tracker filter changes
  const handleTrackerFilter = () => {
    fetchTrackerData(trackerOutlet, startDate, endDate);
  };

  // Handle tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setError('');
    
    if (tab === 'outofstock' && stockSummary.length === 0) {
      fetchStockSummary(); // Load stock summary when switching to out-of-stock tab
    } else if (tab === 'tracker' && trackerData.length === 0) {
      fetchTrackerData(); // Load tracker data when switching to tracker tab
    }
  };

  // Load stock summary on component mount for default tab
  useEffect(() => {
    if (activeTab === 'outofstock') {
      fetchStockSummary();
    }
  }, [activeTab]);

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
              <div className="stat-number">{stockSummary.length}</div>
              <div className="stat-label">Unique Out of Stock Items</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stockSummary.reduce((sum, item) => sum + item.outletCount, 0)}</div>
              <div className="stat-label">Total Out of Stock Instances</div>
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
              ({tab.id === 'outofstock' ? stockSummary.length : trackerData.length})
            </span>
          </button>
        ))}
      </div>

      {/* Out of Stock Tab Content */}
      {activeTab === 'outofstock' && (
        <>
          {/* Refresh Button for Stock Summary */}
          <div className="highrated-filters">
            <div className="filter-group">
              <label>Stock Summary</label>
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
                {loading ? 'Loading...' : 'Refresh All Outlets'}
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
                {loading ? 'Loading...' : `${stockSummary.length} unique items across all outlets`}
              </div>
            </div>
          </div>

          {/* Stock Summary Display */}
          <div className="graphs-section">
            <h4>
              <span style={{ marginRight: '12px' }}>📦</span>
              Out of Stock Items Summary - All Outlets
            </h4>
            
            {!loading && !error && stockSummary.length === 0 ? (
              <div className="outlet-card">
                <h5 style={{ color: 'var(--text-primary)' }}>No Items Out of Stock</h5>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Great news! No items are currently out of stock across all outlets.
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
                  {stockSummary.length} unique items out of stock across all outlets
                </div>
              </div>
            ) : null}
          </div>

          {/* Instructions for Out of Stock */}
          {stockSummary.length === 0 && !loading && (
            <div className="bottom-outlets">
              <h4>
                <span style={{ marginRight: '12px' }}>ℹ️</span>
                Stock Management Instructions
              </h4>
              <div className="outlet-card">
                <h5>How to Use Stock Summary</h5>
                <ul style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  <li>View all unique items that are out of stock across any outlets</li>
                  <li>See how many outlets have each item out of stock</li>
                  <li>Click on the outlet count number to see which specific outlets</li>
                  <li>Items are sorted by outlet count (most critical first)</li>
                  <li>Color coding: Red (5+ outlets), Orange (3-4 outlets), Green (1-2 outlets)</li>
                </ul>
                <div style={{ marginTop: '15px', padding: '15px', background: 'var(--surface-light)', borderRadius: '8px' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 10px 0' }}>
                    <strong>System Info:</strong>
                  </p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0' }}>
                    Backend API: {API_BASE_URL}<br/>
                    Environment: {process.env.NODE_ENV || 'production'}<br/>
                    Data Source: Real-time from all {outlets.length} outlet sheets<br/>
                    Aggregation: Cross-outlet item summary
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Item Details Modal */}
      {showModal && selectedItem && (
        <div className="image-modal" onClick={closeModal} style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{
            background: 'white',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                Item Details - {selectedItem.skuCode}
              </h3>
              <button 
                className="close-btn" 
                onClick={closeModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: '0',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>
            
            {modalLoading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div>Loading outlet details...</div>
              </div>
            ) : itemDetails ? (
              <div>
                <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--surface-light)', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 8px 0' }}>{itemDetails.itemInfo?.longName}</h4>
                  <p style={{ margin: '0', color: 'var(--text-muted)', fontSize: '14px' }}>
                    SKU: {itemDetails.itemInfo?.skuCode}
                  </p>
                </div>
                
                <h5 style={{ marginBottom: '16px' }}>
                  Outlets with this item out of stock ({itemDetails.outletDetails?.length || 0}):
                </h5>
                
                {itemDetails.outletDetails && itemDetails.outletDetails.length > 0 ? (
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {itemDetails.outletDetails.map((outlet, index) => (
                      <div key={index} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        background: 'var(--surface-card)',
                        border: '1px solid var(--border-light)',
                        borderRadius: '8px'
                      }}>
                        <div>
                          <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                            {outlet.outlet}
                          </div>
                          {outlet.shortName && (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              {outlet.shortName}
                            </div>
                          )}
                        </div>
                        <div style={{ 
                          background: '#ef4444', 
                          color: 'white', 
                          padding: '4px 8px', 
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}>
                          Out of Stock
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                    No outlet details available
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                Failed to load outlet details
              </div>
            )}
          </div>
        </div>
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
              <div>Stock Summary Items: {stockSummary.length}</div>
              <div>Tracker entries: {trackerData.length}</div>
              <div>Loading: {loading ? 'Yes' : 'No'}</div>
              <div>Error: {error || 'None'}</div>
              {activeTab === 'outofstock' && (
                <div>Stock Summary URL: {API_BASE_URL}/api/stock-summary</div>
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
            <h5 style={{ color: '#ff4757' }}>Error Loading {activeTab === 'outofstock' ? 'Stock Summary' : 'Tracker'} Data</h5>
            <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
            <div style={{ marginTop: '15px', padding: '10px', background: 'var(--surface-light)', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                <strong>Troubleshooting:</strong>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                API URL: <code>{API_BASE_URL}/api/{activeTab === 'outofstock' ? 'stock-summary' : 'stock-tracker-data'}</code>
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
            <h5>Loading {activeTab === 'outofstock' ? 'Stock Summary' : 'Tracker'} Data...</h5>
            <p style={{ color: 'var(--text-secondary)' }}>
              Fetching {activeTab === 'outofstock' ? 'aggregated stock data from all outlets' : 'tracker entries'}...
            </p>
            <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Loading from: {API_BASE_URL}/api/{activeTab === 'outofstock' ? 'stock-summary' : 'stock-tracker-data'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockDashboard;