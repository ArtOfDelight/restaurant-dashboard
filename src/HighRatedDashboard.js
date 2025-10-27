import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import OutletPerformanceTable from './OutletPerformanceTable';
import './HighRatedDashboard.css';

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
        timeout: 30000
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

  // Get graph data
  const getGraphData = () => {
    return getFilteredData().map(d => ({
      name: d.outlet_name,
      'Error Rate': parseErrorRate(d.error_rate),
      'High Rated %': parseFloat(calculateHighRatedPercent(d)),
      'Low Rated %': d.total_orders > 0 ? Number(((d.low_rated_orders / d.total_orders) * 100).toFixed(2)) : 0,
    }));
  };

  // Get performance metrics data
  const getPerformanceMetricsData = () => {
    if (!swiggyData) return [];
    
    const filteredOutlet = filters.outlet;
    if (filteredOutlet) {
      const outletIndex = swiggyData.outlets.findIndex(outlet => outlet.toLowerCase() === filteredOutlet.toLowerCase());
      if (outletIndex !== -1) {
        return [{
          outlet: swiggyData.outlets[outletIndex],
          online: swiggyData.currentData.onlinePercent[outletIndex],
          accuracy: swiggyData.currentData.foodAccuracy[outletIndex],
          delayed: swiggyData.currentData.delayedOrders[outletIndex]
        }];
      }
      return [];
    }
    
    return swiggyData.outlets.map((outlet, i) => ({
      outlet,
      online: swiggyData.currentData.onlinePercent[i],
      accuracy: swiggyData.currentData.foodAccuracy[i],
      delayed: swiggyData.currentData.delayedOrders[i]
    }));
  };

  const clearOutletSelection = () => {
    setExpandedOutlet(null);
    setMinimized(false);
  };

  const minimizeModal = () => setMinimized(true);
  const restoreModal = () => setMinimized(false);

  // Loading screen
  if (loading) {
    return (
      <div className="checklist-loading">
        <div className="loading-spinner"></div>
        <p style={{ 
          color: 'var(--text-primary)', 
          fontSize: '1.2rem', 
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
        }}>
          LOADING HIGH RATED DASHBOARD...
        </p>
      </div>
    );
  }

  return (
    <div className="highrated-dashboard">
      {/* Header */}
      <div className="highrated-header">
        <h1>HIGH RATED ORDERS DASHBOARD</h1>
        <div className="period-switch">
          {['7 Days', '28 Day'].map(period => (
            <button
              key={period}
              onClick={() => handlePeriodChange(period)}
              className={selectedPeriod === period ? 'active' : ''}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="highrated-stats">
        <div className="stat-card">
          <div className="stat-number">{filteredData.length}</div>
          <div className="stat-label">TOTAL OUTLETS</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">
            {filteredData.reduce((sum, d) => sum + (d.total_orders || 0), 0).toLocaleString()}
          </div>
          <div className="stat-label">TOTAL ORDERS</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#10b981' }}>
            {filteredData.reduce((sum, d) => sum + (d.high_rated_orders || 0), 0).toLocaleString()}
          </div>
          <div className="stat-label">HIGH RATED ORDERS</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#ef4444' }}>
            {filteredData.reduce((sum, d) => sum + (d.low_rated_orders || 0), 0).toLocaleString()}
          </div>
          <div className="stat-label">LOW RATED ORDERS</div>
        </div>
      </div>

      {/* Filters */}
      <div className="highrated-filters">
        <div className="filter-group">
          <label>OUTLET FILTER</label>
          <select
            value={filters.outlet}
            onChange={(e) => setFilters({ ...filters, outlet: e.target.value })}
          >
            <option value="">ALL OUTLETS</option>
            {filterOptions.outlets.map(outlet => (
              <option key={outlet} value={outlet}>{outlet.toUpperCase()}</option>
            ))}
          </select>
        </div>
        {filters.outlet && (
          <div className="filter-group">
            <label>&nbsp;</label>
            <button
              onClick={() => setFilters({ outlet: '' })}
              style={{
                padding: '14px 18px',
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '12px',
                color: '#ef4444',
                cursor: 'pointer',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                fontSize: '14px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}
            >
              CLEAR FILTERS
            </button>
          </div>
        )}
      </div>

      {/* Charts/Graphs Section */}
      <div className="outlets-list">
        {/* Performance Metrics Chart (Swiggy) */}
        {swiggyData && (
          <div className="graphs-section">
            <h4>📊 PERFORMANCE METRICS SWIGGY {filters.outlet ? `FOR ${filters.outlet.toUpperCase()}` : 'BY OUTLET'}</h4>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={getPerformanceMetricsData()}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                <XAxis 
                  dataKey="outlet" 
                  angle={-45} 
                  textAnchor="end" 
                  height={80} 
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} 
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'var(--surface-dark)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '10px',
                    color: 'var(--text-primary)'
                  }}
                />
                <Legend wrapperStyle={{ color: 'var(--text-secondary)', fontSize: '12px' }} />
                <Line type="monotone" dataKey="online" stroke="#3b82f6" strokeWidth={2} name="Online %" />
                <Line type="monotone" dataKey="accuracy" stroke="#10b981" strokeWidth={2} name="Food Accuracy %" />
                <Line type="monotone" dataKey="delayed" stroke="#ef4444" strokeWidth={2} name="Delayed Orders %" />
                <ReferenceLine y={98} stroke="#3b82f6" strokeDasharray="3 3" label={{ value: "Online Target: 98%", position: "topLeft" }} />
                <ReferenceLine y={85} stroke="#10b981" strokeDasharray="3 3" label={{ value: "Accuracy Target: 85%", position: "topLeft" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Error Rate Chart */}
        <div className="graphs-section">
          <h4>📉 ERROR RATE BY OUTLET</h4>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={getGraphData()}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
              <XAxis 
                dataKey="name" 
                angle={-45} 
                textAnchor="end" 
                height={100}
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
              />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'var(--surface-dark)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '10px',
                  color: 'var(--text-primary)'
                }}
                formatter={(value, name) => [`${value}%`, name]}
              />
              <Bar dataKey="Error Rate" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* High Rated Percentage Chart */}
        <div className="graphs-section">
          <h4>📈 HIGH RATED PERCENTAGE BY OUTLET</h4>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={getGraphData()}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
              <XAxis 
                dataKey="name" 
                angle={-45} 
                textAnchor="end" 
                height={100}
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
              />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'var(--surface-dark)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '10px',
                  color: 'var(--text-primary)'
                }}
                formatter={(value, name) => [`${value}%`, name]}
              />
              <Bar dataKey="High Rated %" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Low Rated Percentage Chart */}
        <div className="graphs-section">
          <h4>📊 LOW RATED PERCENTAGE BY OUTLET</h4>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={getGraphData()}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
              <XAxis 
                dataKey="name" 
                angle={-45} 
                textAnchor="end" 
                height={100}
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
              />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'var(--surface-dark)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '10px',
                  color: 'var(--text-primary)'
                }}
                formatter={(value, name) => [`${value}%`, name]}
              />
              <Bar dataKey="Low Rated %" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Outlet Details Table */}
      <div className="submission-card">
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
            OUTLET PERFORMANCE DETAILS ({selectedPeriod.toUpperCase()})
          </h3>
        </div>

        <div style={{ overflowX: 'auto', padding: '20px' }}>
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
            {!swiggyData && error && ' • PERFORMANCE METRICS UNAVAILABLE'}
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