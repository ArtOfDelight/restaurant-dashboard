import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

const EmployeeDashboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('7 Days');
  const [filters, setFilters] = useState({
    employee: '',
    minOrders: '',
    performanceLevel: ''
  });
  const [expandedEmployee, setExpandedEmployee] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [sortBy, setSortBy] = useState('performance_score');
  const [sortOrder, setSortOrder] = useState('desc');

  // Fetch data with robust error handling
  const fetchData = async (period) => {
    try {
      setLoading(true);
      setError(null);
      
      console.log(`Fetching employee data for period: ${period}`);
      
      const possibleUrls = [
        `${API_URL}/api/employee-data`,
        `/api/employee-data`,
        `http://localhost:5000/api/employee-data`,
        `http://localhost:3001/api/employee-data`
      ];

      let lastError = null;
      
      for (const baseUrl of possibleUrls) {
        try {
          console.log(`Trying URL: ${baseUrl}?period=${encodeURIComponent(period)}`);
          
          const response = await fetch(`${baseUrl}?period=${encodeURIComponent(period)}`, {
            timeout: 10000
          });
          
          console.log(`Response status: ${response.status}`);
          
          if (response.ok) {
            const result = await response.json();
            
            if (result && result.success && result.data) {
              console.log(`Success! API returned ${result.data.length} employees for ${period}`);
              setData(result.data);
              setLastUpdate(new Date().toLocaleString());
              setError(null);
              return;
            } else if (result && Array.isArray(result)) {
              console.log(`Found array data with ${result.length} items`);
              setData(result);
              setLastUpdate(new Date().toLocaleString());
              setError(null);
              return;
            } else {
              lastError = new Error(`Unexpected response format from ${baseUrl}`);
              continue;
            }
          } else {
            lastError = new Error(`HTTP ${response.status} from ${baseUrl}`);
            continue;
          }
          
        } catch (fetchError) {
          lastError = fetchError;
          console.log(`Failed to fetch from ${baseUrl}:`, fetchError.message);
          continue;
        }
      }
      
      throw lastError || new Error('All API endpoints failed');
      
    } catch (err) {
      console.error('Load employee data error:', err);
      setError(err.message || 'Failed to load data');
      
      // Load sample data as fallback
      console.log('Loading sample employee data as fallback...');
      const sampleData = [
        {
          employee_name: "William",
          high_rated_7_days: 3,
          high_rated_28_days: 39,
          low_rated_7_days: 0,
          low_rated_28_days: 9,
          total_orders_7_days: 153,
          total_orders_28_days: 671,
          high_rated_percent_7_days: 1.96,
          high_rated_percent_28_days: 5.81,
          low_rated_percent_7_days: 0.00,
          low_rated_percent_28_days: 1.34,
          igcc_7_days: 6,
          igcc_28_days: 8,
          current_period: {
            total_orders: 153,
            high_rated: 3,
            low_rated: 0,
            high_rated_percent: 1.96,
            low_rated_percent: 0.00,
            igcc: 6,
            performance_score: 1.96
          }
        },
        {
          employee_name: "Lamgouhao",
          high_rated_7_days: 10,
          high_rated_28_days: 58,
          low_rated_7_days: 0,
          low_rated_28_days: 9,
          total_orders_7_days: 200,
          total_orders_28_days: 770,
          high_rated_percent_7_days: 5.00,
          high_rated_percent_28_days: 7.53,
          low_rated_percent_7_days: 0.00,
          low_rated_percent_28_days: 1.17,
          igcc_7_days: 7,
          igcc_28_days: 11,
          current_period: {
            total_orders: 200,
            high_rated: 10,
            low_rated: 0,
            high_rated_percent: 5.00,
            low_rated_percent: 0.00,
            igcc: 7,
            performance_score: 5.00
          }
        },
        {
          employee_name: "Risat",
          high_rated_7_days: 15,
          high_rated_28_days: 58,
          low_rated_7_days: 2,
          low_rated_28_days: 7,
          total_orders_7_days: 171,
          total_orders_28_days: 745,
          high_rated_percent_7_days: 8.77,
          high_rated_percent_28_days: 7.79,
          low_rated_percent_7_days: 1.17,
          low_rated_percent_28_days: 0.94,
          igcc_7_days: 1,
          igcc_28_days: 3,
          current_period: {
            total_orders: 171,
            high_rated: 15,
            low_rated: 2,
            high_rated_percent: 8.77,
            low_rated_percent: 1.17,
            igcc: 1,
            performance_score: 7.60
          }
        }
      ];
      setData(sampleData);
      setLastUpdate(new Date().toLocaleString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(selectedPeriod);
    const interval = setInterval(() => fetchData(selectedPeriod), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [selectedPeriod]);

  // Handle period change
  const handlePeriodChange = (period) => {
    setSelectedPeriod(period);
    setExpandedEmployee(null);
    setMinimized(false);
    fetchData(period);
  };

  // Get filtered and sorted data
  const getFilteredData = () => {
    let filtered = data.filter(employee => {
      const matchesEmployee = !filters.employee || 
        employee.employee_name.toLowerCase().includes(filters.employee.toLowerCase());
      
      const matchesMinOrders = !filters.minOrders || 
        employee.current_period.total_orders >= parseInt(filters.minOrders);
      
      const matchesPerformanceLevel = !filters.performanceLevel ||
        getPerformanceLevel(employee.current_period.performance_score) === filters.performanceLevel;
      
      return matchesEmployee && matchesMinOrders && matchesPerformanceLevel;
    });

    // Sort data
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'name':
          aValue = a.employee_name;
          bValue = b.employee_name;
          break;
        case 'total_orders':
          aValue = a.current_period.total_orders;
          bValue = b.current_period.total_orders;
          break;
        case 'high_rated_percent':
          aValue = a.current_period.high_rated_percent;
          bValue = b.current_period.high_rated_percent;
          break;
        case 'performance_score':
        default:
          aValue = a.current_period.performance_score;
          bValue = b.current_period.performance_score;
          break;
      }
      
      if (typeof aValue === 'string') {
        return sortOrder === 'desc' ? bValue.localeCompare(aValue) : aValue.localeCompare(bValue);
      }
      
      return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
    });

    return filtered;
  };

  // Get performance level
  const getPerformanceLevel = (score) => {
    if (score >= 7) return 'Excellent';
    if (score >= 4) return 'Good';
    if (score >= 2) return 'Average';
    return 'Needs Improvement';
  };

  // Get performance color
  const getPerformanceColor = (score) => {
    if (score >= 7) return '#10b981';
    if (score >= 4) return '#3b82f6';
    if (score >= 2) return '#f59e0b';
    return '#ef4444';
  };

  // Calculate stats
  const getTotalStats = () => {
    const filteredData = getFilteredData();
    const totalOrders = filteredData.reduce((sum, e) => sum + e.current_period.total_orders, 0);
    const totalHighRated = filteredData.reduce((sum, e) => sum + e.current_period.high_rated, 0);
    const totalLowRated = filteredData.reduce((sum, e) => sum + e.current_period.low_rated, 0);
    const avgPerformanceScore = filteredData.length > 0 ? 
      (filteredData.reduce((sum, e) => sum + e.current_period.performance_score, 0) / filteredData.length) : 0;
    
    return {
      totalEmployees: filteredData.length,
      totalOrders,
      totalHighRated,
      totalLowRated,
      avgPerformanceScore: avgPerformanceScore.toFixed(2),
      highRatedPercent: totalOrders > 0 ? ((totalHighRated / totalOrders) * 100).toFixed(2) : '0',
      lowRatedPercent: totalOrders > 0 ? ((totalLowRated / totalOrders) * 100).toFixed(2) : '0'
    };
  };

  // Get chart data
  const getChartData = () => {
    return getFilteredData().slice(0, 15).map(employee => ({
      name: employee.employee_name.length > 10 ? 
        employee.employee_name.substring(0, 10) + '...' : employee.employee_name,
      'Performance Score': Number(employee.current_period.performance_score.toFixed(2)),
      'High Rated %': Number(employee.current_period.high_rated_percent.toFixed(2)),
      'Low Rated %': Number(employee.current_period.low_rated_percent.toFixed(2)),
      'IGCC': employee.current_period.igcc,
      'Orders': employee.current_period.total_orders
    }));
  };

  // Get top performers
  const getTopPerformers = () => {
    return getFilteredData()
      .filter(e => e.current_period.total_orders >= 50) // Minimum order threshold
      .slice(0, 5);
  };

  // Get employees needing attention
  const getNeedsAttention = () => {
    return getFilteredData()
      .filter(e => e.current_period.performance_score < 3 || e.current_period.low_rated_percent > 2)
      .slice(0, 5);
  };

  const filteredData = getFilteredData();
  const stats = getTotalStats();
  const topPerformers = getTopPerformers();
  const needsAttention = getNeedsAttention();

  const clearAllFilters = () => {
    setFilters({ employee: '', minOrders: '', performanceLevel: '' });
  };

  const clearEmployeeSelection = () => {
    setExpandedEmployee(null);
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
          LOADING EMPLOYEE DASHBOARD...
        </p>
      </div>
    );
  }

  // Error screen with data fallback
  if (error && data.length === 0) {
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
            EMPLOYEE PERFORMANCE DASHBOARD
          </h1>
          <p style={{ 
            color: 'var(--text-secondary)', 
            marginTop: '10px',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            fontSize: '0.9rem',
            letterSpacing: '1px'
          }}>
            LIVE DATA FROM GOOGLE SHEETS • {data.length} EMPLOYEES • {selectedPeriod.toUpperCase()} DATA
            {error && ' • SHOWING SAMPLE DATA DUE TO CONNECTION ISSUE'}
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
            <option value="28 Days">28 DAYS DATA</option>
          </select>
          {expandedEmployee !== null && (
            <button
              onClick={minimized ? () => setMinimized(false) : clearEmployeeSelection}
              className="responses-btn"
            >
              {minimized ? `RESTORE ${data[expandedEmployee]?.employee_name?.toUpperCase()}` : 'CLEAR SELECTION'}
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
          { title: 'TOTAL EMPLOYEES', value: stats.totalEmployees },
          { title: 'TOTAL ORDERS', value: stats.totalOrders },
          { title: 'AVG PERFORMANCE', value: `${stats.avgPerformanceScore}` },
          { title: 'HIGH RATED %', value: `${stats.highRatedPercent}%` }
        ].map((metric, i) => (
          <div key={i} className="stat-card">
            <div className="stat-number">{metric.value}</div>
            <div className="stat-label">{metric.title}</div>
          </div>
        ))}
      </div>

      {/* Top Performers */}
      {topPerformers.length > 0 && (
        <div className="submission-card">
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                TOP 5 PERFORMERS - EXCEPTIONAL PERFORMANCE
              </h3>
            </div>
          </div>
          <div className="responses-section">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '20px'
            }}>
              {topPerformers.map((employee, index) => (
                <div 
                  key={index} 
                  style={{
                    padding: '20px',
                    borderRadius: '15px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid var(--border-light)',
                    borderLeft: `4px solid ${getPerformanceColor(employee.current_period.performance_score)}`
                  }}
                >
                  <h4 style={{
                    margin: '0 0 12px 0',
                    color: 'var(--text-primary)',
                    fontSize: '1.1rem',
                    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                  }}>
                    #{index + 1} {employee.employee_name.toUpperCase()} 
                    ({employee.current_period.performance_score.toFixed(2)} SCORE)
                  </h4>
                  <ul style={{ 
                    margin: 0, 
                    paddingLeft: '20px', 
                    color: 'var(--text-secondary)',
                    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                    fontSize: '0.9rem'
                  }}>
                    <li>Total Orders: {employee.current_period.total_orders}</li>
                    <li>High Rated: {employee.current_period.high_rated_percent.toFixed(2)}%</li>
                    <li>Low Rated: {employee.current_period.low_rated_percent.toFixed(2)}%</li>
                    <li>IGCC: {employee.current_period.igcc}</li>
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
              EMPLOYEE FILTERS & SORTING
            </h3>
          </div>
          {(filters.employee || filters.minOrders || filters.performanceLevel) && (
            <button onClick={clearAllFilters} className="responses-btn">
              CLEAR ALL FILTERS
            </button>
          )}
        </div>
        <div className="responses-section">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
            <div>
              <label style={{
                color: 'var(--text-primary)',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                fontSize: '0.9rem',
                letterSpacing: '1px',
                marginBottom: '8px',
                display: 'block'
              }}>
                EMPLOYEE NAME:
              </label>
              <input
                type="text"
                value={filters.employee}
                onChange={(e) => setFilters(prev => ({ ...prev, employee: e.target.value }))}
                placeholder="Search employee..."
                style={{
                  width: '100%',
                  padding: '12px 18px',
                  background: 'var(--surface-light)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '12px',
                  fontSize: '0.9rem',
                  color: 'var(--text-primary)',
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                }}
              />
            </div>
            <div>
              <label style={{
                color: 'var(--text-primary)',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                fontSize: '0.9rem',
                letterSpacing: '1px',
                marginBottom: '8px',
                display: 'block'
              }}>
                MIN ORDERS:
              </label>
              <input
                type="number"
                value={filters.minOrders}
                onChange={(e) => setFilters(prev => ({ ...prev, minOrders: e.target.value }))}
                placeholder="Minimum orders"
                style={{
                  width: '100%',
                  padding: '12px 18px',
                  background: 'var(--surface-light)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '12px',
                  fontSize: '0.9rem',
                  color: 'var(--text-primary)',
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                }}
              />
            </div>
            <div>
              <label style={{
                color: 'var(--text-primary)',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                fontSize: '0.9rem',
                letterSpacing: '1px',
                marginBottom: '8px',
                display: 'block'
              }}>
                PERFORMANCE LEVEL:
              </label>
              <select
                value={filters.performanceLevel}
                onChange={(e) => setFilters(prev => ({ ...prev, performanceLevel: e.target.value }))}
                style={{
                  width: '100%',
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
                <option value="">ALL LEVELS</option>
                <option value="Excellent">EXCELLENT</option>
                <option value="Good">GOOD</option>
                <option value="Average">AVERAGE</option>
                <option value="Needs Improvement">NEEDS IMPROVEMENT</option>
              </select>
            </div>
            <div>
              <label style={{
                color: 'var(--text-primary)',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                fontSize: '0.9rem',
                letterSpacing: '1px',
                marginBottom: '8px',
                display: 'block'
              }}>
                SORT BY:
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  width: '100%',
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
                <option value="performance_score">PERFORMANCE SCORE</option>
                <option value="name">EMPLOYEE NAME</option>
                <option value="total_orders">TOTAL ORDERS</option>
                <option value="high_rated_percent">HIGH RATED %</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="submissions-list">
        {/* High Rated Percentage Chart */}
        <div className="submission-card">
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                HIGH RATED PERCENTAGE BY EMPLOYEE (TOP 15)
              </h3>
            </div>
          </div>
          <div className="responses-section">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={getChartData()}>
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
                <Bar dataKey="High Rated %" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Low Rated Percentage Chart */}
        <div className="submission-card">
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                LOW RATED PERCENTAGE BY EMPLOYEE (TOP 15)
              </h3>
            </div>
          </div>
          <div className="responses-section">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={getChartData()}>
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
                <Bar dataKey="Low Rated %" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* IGCC Chart */}
        <div className="submission-card">
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                IGCC BY EMPLOYEE (TOP 15)
              </h3>
            </div>
          </div>
          <div className="responses-section">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={getChartData()}>
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
                />
                <Bar dataKey="IGCC" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Needs Attention Section */}
      {needsAttention.length > 0 && (
        <div className="submission-card">
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                EMPLOYEES NEEDING ATTENTION
              </h3>
            </div>
          </div>
          <div className="responses-section">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '20px'
            }}>
              {needsAttention.map((employee, index) => (
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
                    {employee.employee_name.toUpperCase()} 
                    ({employee.current_period.performance_score.toFixed(2)} SCORE)
                  </h4>
                  <ul style={{ 
                    margin: 0, 
                    paddingLeft: '20px', 
                    color: 'var(--text-secondary)',
                    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                    fontSize: '0.9rem'
                  }}>
                    <li>Performance Score: {employee.current_period.performance_score.toFixed(2)}</li>
                    <li>High Rated: {employee.current_period.high_rated_percent.toFixed(2)}%</li>
                    <li>Low Rated: {employee.current_period.low_rated_percent.toFixed(2)}%</li>
                    <li>Total Orders: {employee.current_period.total_orders}</li>
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Employee Details Table */}
      <div className="submission-card">
        <div className="submission-header">
          <div className="submission-info">
            <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
              EMPLOYEE PERFORMANCE DETAILS ({selectedPeriod.toUpperCase()})
            </h3>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="responses-btn"
              style={{ fontSize: '0.8rem' }}
            >
              {sortOrder === 'desc' ? 'DESC' : 'ASC'}
            </button>
          </div>
        </div>
        <div className="responses-section">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--secondary-gradient)' }}>
                  {[
                    'EMPLOYEE',
                    'TOTAL ORDERS',
                    'HIGH RATED',
                    'HIGH RATED %',
                    'LOW RATED',
                    'LOW RATED %',
                    'IGCC',
                    'PERFORMANCE SCORE',
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
                {filteredData.map((employee, i) => {
                  const needsWork = employee.current_period.performance_score < 3;
                  return (
                    <tr 
                      key={employee.employee_name} 
                      style={{ 
                        borderBottom: '1px solid var(--border-light)',
                        cursor: 'pointer',
                        transition: 'var(--transition)',
                        background: needsWork 
                          ? 'rgba(239, 68, 68, 0.1)' 
                          : expandedEmployee === i 
                            ? 'var(--surface-light)' 
                            : 'transparent'
                      }}
                      onClick={() => { setExpandedEmployee(i); setMinimized(false); }}
                    >
                      <td style={{ 
                        padding: '18px', 
                        fontWeight: '600', 
                        color: needsWork ? '#ffffff' : 'var(--text-primary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" 
                      }}>
                        {employee.employee_name.toUpperCase()}
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: needsWork ? '#ffffff' : 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        {employee.current_period.total_orders}
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: needsWork ? '#ffffff' : 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        {employee.current_period.high_rated}
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: needsWork ? '#ffffff' : 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        {employee.current_period.high_rated_percent.toFixed(2)}%
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: needsWork ? '#ffffff' : 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        {employee.current_period.low_rated}
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: needsWork ? '#ffffff' : 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        {employee.current_period.low_rated_percent.toFixed(2)}%
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: needsWork ? '#ffffff' : 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        {employee.current_period.igcc}
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: needsWork ? '#ffffff' : getPerformanceColor(employee.current_period.performance_score),
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                        fontWeight: '600'
                      }}>
                        {employee.current_period.performance_score.toFixed(2)}
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
                          background: `${getPerformanceColor(employee.current_period.performance_score)}20`,
                          color: needsWork ? '#ffffff' : getPerformanceColor(employee.current_period.performance_score)
                        }}>
                          {getPerformanceLevel(employee.current_period.performance_score)}
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

      {/* Employee Detail Modal */}
      {expandedEmployee !== null && filteredData[expandedEmployee] && !minimized && (
        <div className="image-modal" onClick={clearEmployeeSelection}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={clearEmployeeSelection}>×</button>
            <div style={{ padding: '30px', color: 'var(--text-primary)' }}>
              <h3 style={{
                margin: '0 0 25px 0',
                color: 'var(--text-primary)',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                fontSize: '1.3rem',
                letterSpacing: '1px',
                textTransform: 'uppercase'
              }}>
                {filteredData[expandedEmployee].employee_name.toUpperCase()} - DETAILED METRICS ({selectedPeriod.toUpperCase()})
              </h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '15px',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                fontSize: '0.9rem'
              }}>
                {[
                  { label: 'TOTAL ORDERS', value: filteredData[expandedEmployee].current_period.total_orders },
                  { label: 'HIGH RATED ORDERS', value: filteredData[expandedEmployee].current_period.high_rated },
                  { label: 'HIGH RATED %', value: `${filteredData[expandedEmployee].current_period.high_rated_percent.toFixed(2)}%` },
                  { label: 'LOW RATED ORDERS', value: filteredData[expandedEmployee].current_period.low_rated },
                  { label: 'LOW RATED %', value: `${filteredData[expandedEmployee].current_period.low_rated_percent.toFixed(2)}%` },
                  { label: 'IGCC', value: filteredData[expandedEmployee].current_period.igcc },
                  { label: 'PERFORMANCE SCORE', value: filteredData[expandedEmployee].current_period.performance_score.toFixed(2) },
                  { label: 'PERFORMANCE LEVEL', value: getPerformanceLevel(filteredData[expandedEmployee].current_period.performance_score) }
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
                <button onClick={() => setMinimized(true)} className="responses-btn">
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
            {error && ' • USING SAMPLE DATA DUE TO CONNECTION ISSUE'}
          </p>
        </div>
      )}

      {/* Minimized Modal Indicator */}
      {expandedEmployee !== null && minimized && (
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
          onClick={() => setMinimized(false)}
        >
          <span style={{
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            fontSize: '0.9rem',
            letterSpacing: '1px',
            color: 'var(--text-primary)'
          }}>
            {filteredData[expandedEmployee]?.employee_name.toUpperCase()} DETAILS
          </span>
        </div>
      )}
    </div>
  );
};

export default EmployeeDashboard;