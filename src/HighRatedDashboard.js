import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

const HighRatedDashboard = () => {
  const [data, setData] = useState([]);
  const [swiggyData, setSwiggyData] = useState(null); // New state for Swiggy data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('7 Days');
  const [filters, setFilters] = useState({
    outlet: '',
  });
  const [expandedOutlet, setExpandedOutlet] = useState(null);
  const [minimized, setMinimized] = useState(false);

  // Fetch data for High Rated Dashboard
  const fetchHighRatedData = async (period) => {
    try {
      setLoading(true);
      setError(null);
      
      const periodParam = period === '7 Days' ? '7 Days' : '28 Day';
      console.log(`Fetching high-rated data for period: ${periodParam}`);
      
      const possibleUrls = [
        `${API_URL}/api/high-rated-data-gemini`,
        `/api/high-rated-data-gemini`,
        `http://localhost:5000/api/high-rated-data-gemini`,
        `http://localhost:3001/api/high-rated-data-gemini`
      ];

      let lastError = null;
      
      for (const baseUrl of possibleUrls) {
        try {
          console.log(`Trying URL: ${baseUrl}?period=${encodeURIComponent(periodParam)}`);
          
          const response = await axios.get(baseUrl, {
            params: { period: periodParam },
            timeout: 10000
          });
          
          console.log(`Response status: ${response.status}`);
          
          if (response.data && response.data.success && response.data.data) {
            console.log(`Success! API returned ${response.data.data.length} outlets for ${periodParam}`);
            setData(response.data.data);
            setLastUpdate(new Date().toLocaleString());
            setError(null);
            return;
          } else if (response.data && Array.isArray(response.data)) {
            console.log(`Found array data with ${response.data.length} items`);
            setData(response.data);
            setLastUpdate(new Date().toLocaleString());
            setError(null);
            return;
          } else {
            lastError = new Error(`Unexpected response format from ${baseUrl}`);
            continue;
          }
          
        } catch (fetchError) {
          lastError = fetchError;
          console.log(`Failed to fetch from ${baseUrl}:`, fetchError.message);
          continue;
        }
      }
      
      // All URLs failed, throw the last error
      throw lastError || new Error('All API endpoints failed');
      
    } catch (err) {
      console.error('Load high-rated data error:', err);
      setError(err.message || 'Failed to load high-rated data');
      
      // Load sample data as fallback
      console.log('Loading sample data as fallback...');
      const sampleData = [
        {
          outlet_code: "BLN",
          outlet_name: "Bellandur",
          start_date: "11/08/2025",
          end_date: "17/08/2025",
          total_orders: 537,
          low_rated: 10,
          igcc: 2,
          errors: 12,
          error_rate: 2.23,
          high_rated: 53,
          high_rated_percent: 9.87,
          high_minus_error: 7.64,
          incentive: 0,
          deduction: -360,
          incentives: -360,
          per_day: -51.43
        },
        {
          outlet_code: "IND",
          outlet_name: "Indiranagar",
          start_date: "11/08/2025",
          end_date: "17/08/2025",
          total_orders: 388,
          low_rated: 5,
          igcc: 2,
          errors: 7,
          error_rate: 1.8,
          high_rated: 43,
          high_rated_percent: 11.08,
          high_minus_error: 9.28,
          incentive: 860,
          deduction: -210,
          incentives: 650,
          per_day: 92.86
        },
        {
          outlet_code: "RR",
          outlet_name: "Residency Road",
          start_date: "11/08/2025",
          end_date: "17/08/2025",
          total_orders: 328,
          low_rated: 6,
          igcc: 1,
          errors: 7,
          error_rate: 2.13,
          high_rated: 37,
          high_rated_percent: 11.28,
          high_minus_error: 9.15,
          incentive: 0,
          deduction: -210,
          incentives: -210,
          per_day: -30
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
        console.log(`Success! Swiggy API returned ${apiData.outlets.length} outlets`);
      } else {
        throw new Error(response.data.error || 'Failed to fetch Swiggy data');
      }
      
    } catch (err) {
      console.error('Load Swiggy data error:', err);
      setError(prev => prev || 'Failed to load Swiggy performance metrics');
    }
  };

  // Combined fetch function
  const fetchData = async (period) => {
    await Promise.all([fetchHighRatedData(period), fetchSwiggyData(period)]);
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
    return data.filter(d => (!filters.outlet || d.outlet_name === filters.outlet));
  };

  const getTotalStats = () => {
    const filteredData = getFilteredData();
    const totalOrders = filteredData.reduce((sum, d) => sum + (d.total_orders || 0), 0);
    const totalHighRated = filteredData.reduce((sum, d) => sum + (d.high_rated || 0), 0);
    const totalErrors = filteredData.reduce((sum, d) => sum + (d.errors || 0), 0);
    const totalLowRated = filteredData.reduce((sum, d) => sum + (d.low_rated || 0), 0);
    
    return {
      totalOrders,
      highRatedPercent: totalOrders > 0 ? ((totalHighRated / totalOrders) * 100).toFixed(2) : 0,
      errorRate: totalOrders > 0 ? ((totalErrors / totalOrders) * 100).toFixed(2) : 0,
      lowRatedPercent: totalOrders > 0 ? ((totalLowRated / totalOrders) * 100).toFixed(2) : 0,
    };
  };

  const getGraphData = () => {
    return getFilteredData().map(d => ({
      name: d.outlet_name,
      'Error Rate': Number(d.error_rate),
      'High Rated %': Number(d.high_rated_percent),
      'Low Rated %': d.total_orders > 0 ? Number(((d.low_rated / d.total_orders) * 100).toFixed(2)) : 0,
    }));
  };

  // New function to get performance metrics graph data
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

  const getBottom3Outlets = () => {
    const sorted = [...getFilteredData()].sort((a, b) => b.error_rate - a.error_rate);
    return sorted.slice(0, 3).map(outlet => ({
      name: outlet.outlet_name,
      error_rate: outlet.error_rate,
      outlet_code: outlet.outlet_code,
      reasons: [
        `High error rate of ${outlet.error_rate}%`,
        `Low high rated % of ${outlet.high_rated_percent}%`,
        `Low rated orders: ${outlet.low_rated}`,
      ],
    }));
  };

  const filteredData = getFilteredData();
  const stats = getTotalStats();
  const bottom3 = getBottom3Outlets();

  const clearAllFilters = () => {
    setFilters({ outlet: '' });
  };

  const minimizeModal = () => {
    setMinimized(true);
  };

  const restoreModal = () => {
    setMinimized(false);
  };

  const clearOutletSelection = () => {
    setExpandedOutlet(null);
    setMinimized(false);
  };

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

  // Error screen with data fallback
  if (error && data.length === 0 && !swiggyData) {
    return (
      <div className="checklist-error">
        <h3 style={{
          color: 'var(--text-primary)',
          fontSize: '1.5rem',
          marginBottom: '15px',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
        }}>
          SYSTEM ERROR: {error}
        </h3>
        <p>Please check your server connection or contact support if the issue persists.</p>
        <button onClick={() => fetchData(selectedPeriod)} className="retry-btn">
          RETRY CONNECTION
        </button>
      </div>
    );
  }

  return (
    <div className="checklist-dashboard">
      {/* Header */}
      <div className="checklist-header">
        <div>
          <h1 style={{
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
          }}>
            HIGH RATED PERFORMANCE DASHBOARD
          </h1>
          <p style={{ 
            color: 'var(--text-secondary)', 
            marginTop: '10px',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            fontSize: '0.9rem',
            letterSpacing: '1px'
          }}>
            LIVE DATA FROM GOOGLE SHEETS • {data.length} OUTLETS • {selectedPeriod.toUpperCase()} DATA
            {error && ' • SHOWING SAMPLE DATA DUE TO CONNECTION ISSUE'}
            {filters.outlet && ` • VIEWING: ${filters.outlet.toUpperCase()}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedPeriod}
            onChange={(e) => handlePeriodChange(e.target.value)}
            style={{
              padding: '12px 18px',
              background: 'var(--surface-light)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              textTransform: 'uppercase',
              letterSpacing: '1px',
              backdropFilter: 'blur(10px)'
            }}
          >
            <option value="7 Days">7 DAYS DATA</option>
            <option value="28 Day">28 DAY DATA</option>
          </select>
          {expandedOutlet !== null && (
            <button
              onClick={minimized ? restoreModal : clearOutletSelection}
              className="responses-btn"
            >
              {minimized ? `RESTORE ${data[expandedOutlet]?.outlet_name?.toUpperCase()}` : 'CLEAR SELECTION'}
            </button>
          )}
          <button onClick={() => fetchData(selectedPeriod)} className="refresh-btn">
            REFRESH DATA
          </button>
        </div>
      </div>

      {/* Performance Stats */}
      <div className="checklist-stats">
        {[
          { title: 'TOTAL ORDERS', value: stats.totalOrders },
          { title: 'HIGH RATED %', value: `${stats.highRatedPercent}%` },
          { title: 'LOW RATED %', value: `${stats.lowRatedPercent}%` },
          { title: 'ERROR RATE %', value: `${stats.errorRate}%` }
        ].map((metric, i) => (
          <div key={i} className="stat-card">
            <div className="stat-number">{metric.value}</div>
            <div className="stat-label">{metric.title}</div>
          </div>
        ))}
      </div>

      {/* Bottom 3 Outlets - After stats cards */}
      {bottom3.length > 0 && (
        <div className="submission-card">
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                TOP 3 HIGHEST ERROR RATE OUTLETS - NEEDS ATTENTION
              </h3>
            </div>
          </div>
          <div className="responses-section">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '20px'
            }}>
              {bottom3.map((outlet, index) => (
                <div 
                  key={index} 
                  style={{
                    padding: '20px',
                    borderRadius: '15px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid var(--border-light)',
                    borderLeft: '4px solid #ef4444'
                  }}
                >
                  <h4 style={{
                    margin: '0 0 12px 0',
                    color: 'var(--text-primary)',
                    fontSize: '1.1rem',
                    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                  }}>
                    #{index + 1} {outlet.name.toUpperCase()} ({outlet.error_rate}% ERROR RATE)
                  </h4>
                  <ul style={{ 
                    margin: 0, 
                    paddingLeft: '20px', 
                    color: 'var(--text-secondary)',
                    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                    fontSize: '0.9rem'
                  }}>
                    {outlet.reasons.map((reason, rIndex) => (
                      <li key={rIndex} style={{ marginBottom: '5px' }}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filter Section */}
      <div className="submission-card">
        <div className="submission-header">
          <div className="submission-info">
            <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
              OUTLET FILTER
            </h3>
          </div>
        </div>
        <div className="responses-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <label style={{
              color: 'var(--text-primary)',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              fontSize: '0.9rem',
              letterSpacing: '1px'
            }}>
              FILTER BY OUTLET:
            </label>
            {filters.outlet && (
              <button 
                onClick={clearAllFilters} 
                className="responses-btn"
                style={{ fontSize: '0.8rem' }}
              >
                CLEAR FILTERS
              </button>
            )}
          </div>
          <select
            value={filters.outlet}
            onChange={(e) => setFilters(prev => ({ ...prev, outlet: e.target.value }))}
            style={{
              width: '100%',
              maxWidth: '300px',
              padding: '12px 18px',
              background: 'var(--surface-light)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
            }}
          >
            <option value="">ALL OUTLETS</option>
            {filterOptions.outlets.map(outlet => (
              <option key={outlet} value={outlet}>{outlet.toUpperCase()}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="submissions-list">
        {/* Performance Metrics Chart */}
        {swiggyData && (
          <div className="submission-card">
            <div className="submission-header">
              <div className="submission-info">
                <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                  PERFORMANCE METRICS {filters.outlet ? `FOR ${filters.outlet.toUpperCase()}` : 'BY OUTLET'}
                </h3>
              </div>
            </div>
            <div className="responses-section">
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
          </div>
        )}

        {/* Error Rate Chart */}
        <div className="submission-card">
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                ERROR RATE BY OUTLET
              </h3>
            </div>
          </div>
          <div className="responses-section">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={getGraphData()}>
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
        </div>

        {/* High Rated Percentage Chart */}
        <div className="submission-card">
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                HIGH RATED PERCENTAGE BY OUTLET
              </h3>
            </div>
          </div>
          <div className="responses-section">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={getGraphData()}>
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
        </div>

        {/* Low Rated Percentage Chart */}
        <div className="submission-card">
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                LOW RATED PERCENTAGE BY OUTLET
              </h3>
            </div>
          </div>
          <div className="responses-section">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={getGraphData()}>
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
      </div>

      {/* Outlet Details Table */}
      <div className="submission-card">
        <div className="submission-header">
          <div className="submission-info">
            <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
              OUTLET PERFORMANCE DETAILS ({selectedPeriod.toUpperCase()})
            </h3>
          </div>
        </div>
        <div className="responses-section">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--secondary-gradient)' }}>
                  {[
                    'OUTLET',
                    'TOTAL ORDERS',
                    'HIGH RATED',
                    'LOW RATED',
                    'IGCC',
                    'ERRORS',
                    'ERROR RATE',
                    'HIGH RATED %',
                    'HIGH - ERROR %',
                    'INCENTIVE',
                    'DEDUCTION',
                    'NET INCENTIVES',
                    'PER DAY',
                    'STATUS'
                  ].map((header) => (
                    <th key={header} style={{ 
                      padding: '18px', 
                      textAlign: 'left', 
                      color: 'var(--text-primary)', 
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      fontSize: '0.9rem',
                      letterSpacing: '1px'
                    }}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.map((outlet, i) => {
                  const hasNeedsWork = outlet.high_minus_error <= 5; // "NEEDS WORK" threshold
                  return (
                    <tr 
                      key={outlet.outlet_code} 
                      style={{ 
                        borderBottom: '1px solid var(--border-light)',
                        cursor: 'pointer',
                        transition: 'var(--transition)',
                        background: hasNeedsWork 
                          ? 'rgba(239, 68, 68, 0.15)' 
                          : expandedOutlet === i 
                            ? 'var(--surface-light)' 
                            : 'transparent'
                      }}
                      onClick={() => { setExpandedOutlet(i); setMinimized(false); }}
                    >
                      <td style={{ 
                        padding: '18px', 
                        fontWeight: '600', 
                        color: hasNeedsWork ? '#ffffff' : 'var(--text-primary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" 
                      }}>
                        {outlet.outlet_name.toUpperCase()}
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: hasNeedsWork ? '#ffffff' : 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        {outlet.total_orders}
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: hasNeedsWork ? '#ffffff' : 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        {outlet.high_rated}
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: hasNeedsWork ? '#ffffff' : 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        {outlet.low_rated}
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: hasNeedsWork ? '#ffffff' : 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        {outlet.igcc}
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: hasNeedsWork ? '#ffffff' : 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        {outlet.errors}
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: hasNeedsWork ? '#ffffff' : 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        {outlet.error_rate}%
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: hasNeedsWork ? '#ffffff' : 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        {outlet.high_rated_percent}%
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: hasNeedsWork ? '#ffffff' : 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        {outlet.high_minus_error}%
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: hasNeedsWork 
                          ? '#ffffff' 
                          : outlet.incentive >= 0 
                            ? 'var(--text-primary)' 
                            : '#ef4444',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        ₹{outlet.incentive}
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: hasNeedsWork ? '#ffffff' : '#ef4444',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        ₹{outlet.deduction}
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: hasNeedsWork 
                          ? '#ffffff' 
                          : outlet.incentives >= 0 
                            ? 'var(--text-primary)' 
                            : '#ef4444',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        ₹{outlet.incentives}
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: hasNeedsWork 
                          ? '#ffffff' 
                          : outlet.per_day >= 0 
                            ? 'var(--text-primary)' 
                            : '#ef4444',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        ₹{outlet.per_day}
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
                          background: outlet.high_minus_error > 8 ? 'rgba(16, 185, 129, 0.2)' : outlet.high_minus_error > 5 ? 'rgba(59, 130, 246, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: hasNeedsWork 
                            ? '#ffffff' 
                            : outlet.high_minus_error > 8 
                              ? '#10b981' 
                              : outlet.high_minus_error > 5 
                                ? '#3b82f6' 
                                : '#ef4444'
                        }}>
                          {outlet.high_minus_error > 8 ? 'EXCELLENT' : outlet.high_minus_error > 5 ? 'GOOD' : 'NEEDS WORK'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
                  { label: 'START DATE', value: filteredData[expandedOutlet].start_date },
                  { label: 'END DATE', value: filteredData[expandedOutlet].end_date },
                  { label: 'TOTAL ORDERS', value: filteredData[expandedOutlet].total_orders },
                  { label: 'LOW RATED', value: filteredData[expandedOutlet].low_rated },
                  { label: 'IGCC', value: filteredData[expandedOutlet].igcc },
                  { label: 'ERRORS', value: filteredData[expandedOutlet].errors },
                  { label: 'ERROR RATE', value: `${filteredData[expandedOutlet].error_rate}%` },
                  { label: 'HIGH RATED ORDERS', value: filteredData[expandedOutlet].high_rated },
                  { label: 'HIGH RATED %', value: `${filteredData[expandedOutlet].high_rated_percent}%` },
                  { label: 'HIGH MINUS ERROR', value: `${filteredData[expandedOutlet].high_minus_error}%` },
                  { label: 'INCENTIVE', value: `₹${filteredData[expandedOutlet].incentive}` },
                  { label: 'DEDUCTION', value: `₹${filteredData[expandedOutlet].deduction}` },
                  { label: 'NET INCENTIVES', value: `₹${filteredData[expandedOutlet].incentives}` },
                  { label: 'PER DAY', value: `₹${filteredData[expandedOutlet].per_day}` }
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
            {error && ' • USING SAMPLE DATA FOR HIGH RATED METRICS'}
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