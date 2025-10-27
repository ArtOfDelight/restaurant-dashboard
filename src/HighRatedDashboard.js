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
    <div className="checklist-container">
      {/* Header Section */}
      <div className="checklist-header">
        <div className="header-content">
          <h1 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
            HIGH RATED ORDERS DASHBOARD
          </h1>
          <p style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
            Track outlet performance across {selectedPeriod}
          </p>
        </div>

        {/* Period Selector */}
        <div className="filters-section">
          <div className="filter-group">
            {['7 Days', '28 Day'].map(period => (
              <button
                key={period}
                onClick={() => handlePeriodChange(period)}
                className={`period-btn ${selectedPeriod === period ? 'active' : ''}`}
                style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}
              >
                {period}
              </button>
            ))}
          </div>

          {/* Outlet Filter */}
          <div className="filter-group">
            <select
              value={filters.outlet}
              onChange={(e) => setFilters({ ...filters, outlet: e.target.value })}
              className="filter-select"
              style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}
            >
              <option value="">ALL OUTLETS</option>
              {filterOptions.outlets.map(outlet => (
                <option key={outlet} value={outlet}>{outlet.toUpperCase()}</option>
              ))}
            </select>
            {filters.outlet && (
              <button
                onClick={() => setFilters({ outlet: '' })}
                className="clear-filters-btn"
                style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}
              >
                CLEAR
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label" style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
            TOTAL OUTLETS
          </div>
          <div className="stat-value" style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
            {filteredData.length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
            TOTAL ORDERS
          </div>
          <div className="stat-value" style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
            {filteredData.reduce((sum, d) => sum + (d.total_orders || 0), 0).toLocaleString()}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
            HIGH RATED ORDERS
          </div>
          <div className="stat-value success" style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
            {filteredData.reduce((sum, d) => sum + (d.high_rated_orders || 0), 0).toLocaleString()}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
            LOW RATED ORDERS
          </div>
          <div className="stat-value error" style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
            {filteredData.reduce((sum, d) => sum + (d.low_rated_orders || 0), 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="submissions-list">
        {/* Performance Metrics Chart (Swiggy) */}
        {swiggyData && (
          <div className="submission-card">
            <div className="submission-header">
              <div className="submission-info">
                <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                  PERFORMANCE METRICS SWIGGY {filters.outlet ? `FOR ${filters.outlet.toUpperCase()}` : 'BY OUTLET'}
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
          <div className="table-container">
            <table className="performance-table">
              <thead>
                <tr>
                  <th style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>OUTLET</th>
                  <th style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>TOTAL ORDERS</th>
                  <th style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>HIGH RATED</th>
                  <th style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>LOW RATED</th>
                  <th style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>ERROR RATE</th>
                  <th style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>HIGH RATED %</th>
                  <th style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>STATUS</th>
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
                      className={needsWork ? 'needs-work' : hasGoodPerformance ? 'good-performance' : ''}
                    >
                      <td style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace", fontWeight: '600' }}>
                        {outlet.outlet_name}
                      </td>
                      <td style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                        {outlet.total_orders}
                      </td>
                      <td className="success" style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                        {outlet.high_rated_orders}
                      </td>
                      <td className="error" style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                        {outlet.low_rated_orders}
                      </td>
                      <td className={errorRate > 2 ? 'error' : ''} style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                        {outlet.error_rate}
                      </td>
                      <td className={highRatedPercent >= 8 ? 'success' : highRatedPercent >= 5 ? 'warning' : 'error'} style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                        {highRatedPercent}%
                      </td>
                      <td>
                        <span className={`status-badge ${hasGoodPerformance ? 'success' : needsWork ? 'error' : 'warning'}`} style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
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
      </div>

      {/* Outlet Detail Modal */}
      {expandedOutlet !== null && filteredData[expandedOutlet] && !minimized && (
        <div className="image-modal" onClick={clearOutletSelection}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={clearOutletSelection}>×</button>
            <div className="modal-body">
              <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                {filteredData[expandedOutlet].outlet_name.toUpperCase()} - DETAILED METRICS
              </h3>
              <div className="metrics-grid">
                {[
                  { label: 'OUTLET NAME', value: filteredData[expandedOutlet].outlet_name },
                  { label: 'TOTAL ORDERS', value: filteredData[expandedOutlet].total_orders },
                  { label: 'HIGH RATED ORDERS', value: filteredData[expandedOutlet].high_rated_orders },
                  { label: 'LOW RATED ORDERS', value: filteredData[expandedOutlet].low_rated_orders },
                  { label: 'ERROR RATE', value: filteredData[expandedOutlet].error_rate },
                  { label: 'HIGH RATED %', value: `${calculateHighRatedPercent(filteredData[expandedOutlet])}%` }
                ].map((item, index) => (
                  <div key={index} className="metric-item">
                    <div className="metric-label" style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                      {item.label}
                    </div>
                    <div className="metric-value" style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={minimizeModal} className="responses-btn" style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                MINIMIZE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Last Update Info */}
      {lastUpdate && (
        <div className="last-update" style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
          LAST UPDATED: {lastUpdate.toUpperCase()}
          {error && ' • USING SAMPLE DATA (API CONNECTION ISSUE)'}
          {!swiggyData && error && ' • PERFORMANCE METRICS UNAVAILABLE'}
        </div>
      )}

      {/* Minimized Modal Indicator */}
      {expandedOutlet !== null && minimized && (
        <div className="minimized-indicator" onClick={restoreModal}>
          <span style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
            {filteredData[expandedOutlet]?.outlet_name.toUpperCase()} DETAILS
          </span>
        </div>
      )}
    </div>
  );
};

export default HighRatedDashboard;