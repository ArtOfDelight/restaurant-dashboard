import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import OutletPerformanceTable from './OutletPerformanceTable';

const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

const HighRatedDashboard = () => {
  const [data, setData] = useState([]);
  const [swiggyData, setSwiggyData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('7 Days');
  const [filters, setFilters] = useState({
    outlet: '',
  });
  const [expandedOutlet, setExpandedOutlet] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [showOutletPerformanceTable, setShowOutletPerformanceTable] = useState(false);

  // Fetch data for High Rated Dashboard
  const fetchHighRatedData = async (period) => {
    try {
      setLoading(true);
      setError(null);
      
      const periodParam = period === '7 Days' ? '7 Days' : '28 Day';
      console.log(`Fetching high-rated data for period: ${periodParam}`);
      console.log(`Using API URL: ${API_URL}`);
      
      const response = await axios.get(`${API_URL}/api/high-rated-data-gemini`, {
        params: { period: periodParam },
        timeout: 30000 // Increased timeout for Gemini processing
      });
      
      console.log('API Response:', response.data);
      
      if (response.data && response.data.success && response.data.data) {
        console.log(`✅ Success! API returned ${response.data.data.length} outlets for ${periodParam}`);
        console.log('Sample outlet data:', response.data.data[0]);
        setData(response.data.data);
        setLastUpdate(new Date().toLocaleString());
        setError(null);
      } else if (response.data && Array.isArray(response.data)) {
        console.log(`✅ Found array data with ${response.data.length} items`);
        setData(response.data);
        setLastUpdate(new Date().toLocaleString());
        setError(null);
      } else {
        throw new Error('Unexpected response format');
      }
      
    } catch (err) {
      console.error('❌ Load high-rated data error:', err);
      console.error('Error details:', err.response?.data || err.message);
      setError(err.message || 'Failed to load high-rated data');
      
      // Load sample data as fallback
      console.log('⚠️ Loading sample data as fallback...');
      const sampleData = [
        {
          outlet_name: "Bellandur",
          total_orders: 537,
          high_rated_orders: 53,
          low_rated_orders: 10,
          error_rate: "2.23%"
        },
        {
          outlet_name: "Indiranagar",
          total_orders: 388,
          high_rated_orders: 43,
          low_rated_orders: 5,
          error_rate: "1.80%"
        },
        {
          outlet_name: "Residency Road",
          total_orders: 328,
          high_rated_orders: 37,
          low_rated_orders: 6,
          error_rate: "2.13%"
        }
      ];
      setData(sampleData);
      setLastUpdate(new Date().toLocaleString());
    }
  };

  // Fetch Swiggy performance metrics data
  const fetchSwiggyData = async (period) => {
    try {
      const periodParam = period === '7 Days' ? '7 Day' : '28 Day';
      console.log(`Fetching Swiggy data for period: ${periodParam}`);
      
      const response = await axios.get(`${API_URL}/api/swiggy-dashboard-data`, {
        params: { period: periodParam },
        timeout: 10000
      });
      
      if (response.data.success) {
        const apiData = response.data.data;
        setSwiggyData({
          outlets: apiData.outlets,
          currentData: {
            onlinePercent: apiData.onlinePercent,
            foodAccuracy: apiData.foodAccuracy,
            delayedOrders: apiData.delayedOrders
          }
        });
        console.log(`✅ Success! Swiggy API returned ${apiData.outlets.length} outlets`);
      } else {
        throw new Error(response.data.error || 'Failed to fetch Swiggy data');
      }
      
    } catch (err) {
      console.error('⚠️ Load Swiggy data error:', err);
      // Don't set main error for Swiggy failures
    }
  };

  // Combined fetch function
  const fetchData = async (period) => {
    await fetchHighRatedData(period);
    await fetchSwiggyData(period);
    setLoading(false);
  };

  useEffect(() => {
    fetchData(selectedPeriod);
    const interval = setInterval(() => fetchData(selectedPeriod), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [selectedPeriod]);

  // Handle period change
  const handlePeriodChange = (period) => {
    setSelectedPeriod(period);
    setExpandedOutlet(null);
    setMinimized(false);
    fetchData(period);
  };

  // Filter options
  const filterOptions = {
    outlets: [...new Set(data.map(d => d.outlet_name))].sort(),
  };

  const getFilteredData = () => {
    return data.filter(outlet => {
      if (filters.outlet && outlet.outlet_name !== filters.outlet) return false;
      return true;
    });
  };

  const filteredData = getFilteredData();

  // Calculate high rated percentage
  const calculateHighRatedPercent = (outlet) => {
    if (!outlet.total_orders || outlet.total_orders === 0) return 0;
    return ((outlet.high_rated_orders / outlet.total_orders) * 100).toFixed(2);
  };

  // Parse error rate string to number
  const parseErrorRate = (errorRate) => {
    if (typeof errorRate === 'number') return errorRate;
    if (typeof errorRate === 'string') {
      return parseFloat(errorRate.replace('%', '')) || 0;
    }
    return 0;
  };

  const clearOutletSelection = () => {
    setExpandedOutlet(null);
    setMinimized(false);
  };

  const minimizeModal = () => setMinimized(true);
  const restoreModal = () => setMinimized(false);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '400px',
        color: 'var(--text-primary)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{
            width: '50px',
            height: '50px',
            border: '3px solid var(--border-light)',
            borderTop: '3px solid var(--primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }} />
          <p style={{
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            letterSpacing: '1px'
          }}>
            LOADING HIGH RATED DATA...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-content">
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Debug Info - Remove after testing */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '10px',
          padding: '15px',
          marginBottom: '20px',
          fontSize: '0.85rem',
          fontFamily: 'monospace'
        }}>
          <strong>🔍 Debug Info:</strong><br/>
          API URL: {API_URL}<br/>
          Data loaded: {data.length} outlets<br/>
          Error: {error || 'None'}<br/>
          Sample data keys: {data[0] ? Object.keys(data[0]).join(', ') : 'N/A'}
        </div>
      )}

      {/* Header */}
      <div style={{
        background: 'var(--surface-dark)',
        border: '1px solid var(--border-light)',
        borderRadius: '20px',
        padding: '30px',
        marginBottom: '25px',
        backdropFilter: 'blur(15px)',
        boxShadow: 'var(--shadow-dark)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px'
        }}>
          <div>
            <h2 style={{
              margin: '0 0 10px 0',
              color: 'var(--text-primary)',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              fontSize: '1.5rem',
              letterSpacing: '2px',
              textTransform: 'uppercase'
            }}>
              HIGH RATED ORDERS DASHBOARD
            </h2>
            <p style={{
              margin: 0,
              color: 'var(--text-muted)',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              fontSize: '0.85rem',
              letterSpacing: '0.5px'
            }}>
              TRACK OUTLET PERFORMANCE • {selectedPeriod.toUpperCase()}
            </p>
          </div>

          {/* Period Selector */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {['7 Days', '28 Day'].map(period => (
              <button
                key={period}
                onClick={() => handlePeriodChange(period)}
                style={{
                  padding: '12px 24px',
                  background: selectedPeriod === period 
                    ? 'linear-gradient(135deg, var(--primary), var(--primary-dark))' 
                    : 'var(--surface-light)',
                  color: selectedPeriod === period ? '#ffffff' : 'var(--text-primary)',
                  border: selectedPeriod === period ? 'none' : '1px solid var(--border-light)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  transition: 'var(--transition)',
                  boxShadow: selectedPeriod === period ? 'var(--shadow-primary)' : 'none'
                }}
                onMouseOver={(e) => {
                  if (selectedPeriod !== period) {
                    e.currentTarget.style.background = 'var(--surface-hover)';
                  }
                }}
                onMouseOut={(e) => {
                  if (selectedPeriod !== period) {
                    e.currentTarget.style.background = 'var(--surface-light)';
                  }
                }}
              >
                {period}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div style={{
          marginTop: '25px',
          display: 'flex',
          gap: '15px',
          flexWrap: 'wrap'
        }}>
          <select
            value={filters.outlet}
            onChange={(e) => setFilters({ ...filters, outlet: e.target.value })}
            style={{
              padding: '12px 18px',
              background: 'var(--surface-light)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              color: 'var(--text-primary)',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              fontSize: '0.85rem',
              cursor: 'pointer',
              minWidth: '200px'
            }}
          >
            <option value="">ALL OUTLETS</option>
            {filterOptions.outlets.map(outlet => (
              <option key={outlet} value={outlet}>{outlet.toUpperCase()}</option>
            ))}
          </select>

          {(filters.outlet) && (
            <button
              onClick={() => setFilters({ outlet: '' })}
              style={{
                padding: '12px 24px',
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '12px',
                color: '#ef4444',
                cursor: 'pointer',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                fontSize: '0.85rem',
                fontWeight: '600',
                letterSpacing: '1px',
                textTransform: 'uppercase'
              }}
            >
              CLEAR FILTERS
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px',
        marginBottom: '25px'
      }}>
        {[
          {
            label: 'TOTAL OUTLETS',
            value: filteredData.length,
            color: 'var(--primary)'
          },
          {
            label: 'TOTAL ORDERS',
            value: filteredData.reduce((sum, d) => sum + (d.total_orders || 0), 0).toLocaleString(),
            color: '#3b82f6'
          },
          {
            label: 'HIGH RATED ORDERS',
            value: filteredData.reduce((sum, d) => sum + (d.high_rated_orders || 0), 0).toLocaleString(),
            color: '#10b981'
          },
          {
            label: 'LOW RATED ORDERS',
            value: filteredData.reduce((sum, d) => sum + (d.low_rated_orders || 0), 0).toLocaleString(),
            color: '#ef4444'
          }
        ].map((card, index) => (
          <div
            key={index}
            style={{
              background: 'var(--surface-dark)',
              border: '1px solid var(--border-light)',
              borderRadius: '15px',
              padding: '25px',
              backdropFilter: 'blur(15px)',
              boxShadow: 'var(--shadow-dark)',
              transition: 'var(--transition)'
            }}
          >
            <div style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              marginBottom: '10px',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              letterSpacing: '1.5px',
              textTransform: 'uppercase'
            }}>
              {card.label}
            </div>
            <div style={{
              fontSize: '2rem',
              fontWeight: '700',
              color: card.color,
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
            }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Data Table */}
      <div style={{
        background: 'var(--surface-dark)',
        border: '1px solid var(--border-light)',
        borderRadius: '20px',
        overflow: 'hidden',
        backdropFilter: 'blur(15px)',
        boxShadow: 'var(--shadow-dark)'
      }}>
        <div style={{
          padding: '25px 30px',
          borderBottom: '1px solid var(--border-light)'
        }}>
          <h3 style={{
            margin: 0,
            color: 'var(--text-primary)',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            fontSize: '1.1rem',
            letterSpacing: '1.5px',
            textTransform: 'uppercase'
          }}>
            OUTLET PERFORMANCE ({selectedPeriod.toUpperCase()})
          </h3>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse'
          }}>
            <thead>
              <tr style={{
                background: 'var(--surface-light)',
                borderBottom: '2px solid var(--border-light)'
              }}>
                {['OUTLET', 'TOTAL ORDERS', 'HIGH RATED', 'LOW RATED', 'ERROR RATE', 'HIGH RATED %', 'STATUS'].map((header, index) => (
                  <th
                    key={index}
                    style={{
                      padding: '18px',
                      textAlign: 'left',
                      color: 'var(--text-secondary)',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      letterSpacing: '1.5px',
                      textTransform: 'uppercase',
                      borderBottom: '1px solid var(--border-light)'
                    }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredData.map((outlet, index) => {
                const errorRate = parseErrorRate(outlet.error_rate);
                const highRatedPercent = parseFloat(calculateHighRatedPercent(outlet));
                const hasGoodPerformance = highRatedPercent >= 8 && errorRate <= 2;
                const needsWork = highRatedPercent < 5 || errorRate > 3;

                return (
                  <tr
                    key={index}
                    onClick={() => setExpandedOutlet(index)}
                    style={{
                      background: needsWork 
                        ? 'rgba(239, 68, 68, 0.1)' 
                        : hasGoodPerformance 
                          ? 'rgba(16, 185, 129, 0.1)' 
                          : 'transparent',
                      borderBottom: '1px solid var(--border-light)',
                      cursor: 'pointer',
                      transition: 'var(--transition)'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = needsWork 
                        ? 'rgba(239, 68, 68, 0.15)' 
                        : hasGoodPerformance 
                          ? 'rgba(16, 185, 129, 0.15)' 
                          : 'var(--surface-hover)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = needsWork 
                        ? 'rgba(239, 68, 68, 0.1)' 
                        : hasGoodPerformance 
                          ? 'rgba(16, 185, 129, 0.1)' 
                          : 'transparent';
                    }}
                  >
                    <td style={{
                      padding: '18px',
                      color: 'var(--text-primary)',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      fontWeight: '600'
                    }}>
                      {outlet.outlet_name}
                    </td>
                    <td style={{
                      padding: '18px',
                      color: 'var(--text-primary)',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                    }}>
                      {outlet.total_orders}
                    </td>
                    <td style={{
                      padding: '18px',
                      color: '#10b981',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                    }}>
                      {outlet.high_rated_orders}
                    </td>
                    <td style={{
                      padding: '18px',
                      color: '#ef4444',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                    }}>
                      {outlet.low_rated_orders}
                    </td>
                    <td style={{
                      padding: '18px',
                      color: errorRate > 2 ? '#ef4444' : 'var(--text-primary)',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                    }}>
                      {outlet.error_rate}
                    </td>
                    <td style={{
                      padding: '18px',
                      color: highRatedPercent >= 8 ? '#10b981' : highRatedPercent >= 5 ? '#3b82f6' : '#ef4444',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                    }}>
                      {highRatedPercent}%
                    </td>
                    <td style={{ padding: '18px' }}>
                      <span style={{
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                        background: hasGoodPerformance 
                          ? 'rgba(16, 185, 129, 0.2)' 
                          : needsWork 
                            ? 'rgba(239, 68, 68, 0.2)' 
                            : 'rgba(59, 130, 246, 0.2)',
                        color: hasGoodPerformance 
                          ? '#10b981' 
                          : needsWork 
                            ? '#ef4444' 
                            : '#3b82f6'
                      }}>
                        {hasGoodPerformance ? 'EXCELLENT' : needsWork ? 'NEEDS WORK' : 'GOOD'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Outlet Detail Modal */}
      {expandedOutlet !== null && filteredData[expandedOutlet] && !minimized && (
        <div className="image-modal" onClick={clearOutletSelection}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={clearOutletSelection}>×</button>
            <div style={{ padding: '30px', color: 'var(--text-primary)' }}>
              <h3 style={{
                margin: '0 0 25px 0',
                color: 'var(--text-primary)',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                fontSize: '1.3rem',
                letterSpacing: '1px',
                textTransform: 'uppercase'
              }}>
                {filteredData[expandedOutlet].outlet_name.toUpperCase()} - DETAILED METRICS ({selectedPeriod.toUpperCase()})
              </h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '15px',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                fontSize: '0.9rem'
              }}>
                {[
                  { label: 'OUTLET NAME', value: filteredData[expandedOutlet].outlet_name },
                  { label: 'TOTAL ORDERS', value: filteredData[expandedOutlet].total_orders },
                  { label: 'HIGH RATED ORDERS', value: filteredData[expandedOutlet].high_rated_orders },
                  { label: 'LOW RATED ORDERS', value: filteredData[expandedOutlet].low_rated_orders },
                  { label: 'ERROR RATE', value: filteredData[expandedOutlet].error_rate },
                  { label: 'HIGH RATED %', value: `${calculateHighRatedPercent(filteredData[expandedOutlet])}%` }
                ].map((item, index) => (
                  <div key={index} style={{
                    padding: '15px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '10px',
                    border: '1px solid var(--border-light)'
                  }}>
                    <div style={{ 
                      fontSize: '0.8rem', 
                      color: 'var(--text-secondary)', 
                      marginBottom: '5px',
                      letterSpacing: '1px'
                    }}>
                      {item.label}
                    </div>
                    <div style={{ 
                      fontSize: '1rem', 
                      color: 'var(--text-primary)', 
                      fontWeight: '600'
                    }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '25px' }}>
                <button onClick={minimizeModal} className="responses-btn">
                  MINIMIZE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Last Update Info */}
      {lastUpdate && (
        <div style={{
          background: 'var(--surface-light)',
          border: '1px solid var(--border-light)',
          borderRadius: '15px',
          padding: '15px',
          marginTop: '25px',
          textAlign: 'center',
          backdropFilter: 'blur(10px)',
          fontSize: '0.8rem'
        }}>
          <p style={{
            color: 'var(--text-muted)',
            margin: 0,
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            letterSpacing: '0.5px'
          }}>
            LAST UPDATED: {lastUpdate.toUpperCase()}
            {error && ' • USING SAMPLE DATA (API CONNECTION ISSUE)'}
          </p>
        </div>
      )}

      {/* Minimized Modal Indicator */}
      {expandedOutlet !== null && minimized && (
        <div 
          style={{
            position: 'fixed',
            bottom: '30px',
            right: '30px',
            background: 'var(--surface-dark)',
            border: '1px solid var(--border-light)',
            borderRadius: '15px',
            padding: '15px 25px',
            cursor: 'pointer',
            transition: 'var(--transition)',
            backdropFilter: 'blur(15px)',
            boxShadow: 'var(--shadow-dark)',
            zIndex: 999
          }}
          onClick={restoreModal}
        >
          <span style={{
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            fontSize: '0.9rem',
            letterSpacing: '1px',
            color: 'var(--text-primary)'
          }}>
            {filteredData[expandedOutlet]?.outlet_name.toUpperCase()} DETAILS
          </span>
        </div>
      )}
    </div>
  );
};

export default HighRatedDashboard;