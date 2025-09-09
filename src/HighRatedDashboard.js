import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

const HighRatedDashboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('7 Days');
  const [filters, setFilters] = useState({
    outlet: '',
  });
  const [expandedOutlet, setExpandedOutlet] = useState(null);
  const [minimized, setMinimized] = useState(false);

  // Enhanced sample data with performance metrics from both platforms
  const sampleDataSets = {
    '7 Days': [
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
        per_day: -51.43,
        // Swiggy performance metrics
        swiggy_online_percent: 97.5,
        swiggy_food_accuracy: 82.3,
        swiggy_delayed_orders: 8.5,
        swiggy_kitchen_prep_time: 4.2,
        // Zomato performance metrics
        zomato_online_percent: 96.8,
        zomato_food_accuracy: 85.1,
        zomato_delayed_orders: 6.2
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
        per_day: 92.86,
        // Swiggy performance metrics
        swiggy_online_percent: 98.2,
        swiggy_food_accuracy: 91.5,
        swiggy_delayed_orders: 3.8,
        swiggy_kitchen_prep_time: 3.1,
        // Zomato performance metrics
        zomato_online_percent: 98.5,
        zomato_food_accuracy: 89.7,
        zomato_delayed_orders: 4.2
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
        per_day: -30,
        // Swiggy performance metrics
        swiggy_online_percent: 95.3,
        swiggy_food_accuracy: 87.9,
        swiggy_delayed_orders: 7.1,
        swiggy_kitchen_prep_time: 3.8,
        // Zomato performance metrics
        zomato_online_percent: 97.1,
        zomato_food_accuracy: 92.4,
        zomato_delayed_orders: 5.5
      },
      {
        outlet_code: "KOR",
        outlet_name: "Koramangala",
        start_date: "11/08/2025",
        end_date: "17/08/2025",
        total_orders: 445,
        low_rated: 8,
        igcc: 3,
        errors: 15,
        error_rate: 3.37,
        high_rated: 48,
        high_rated_percent: 10.78,
        high_minus_error: 7.41,
        incentive: 0,
        deduction: -450,
        incentives: -450,
        per_day: -64.29,
        // Swiggy performance metrics
        swiggy_online_percent: 94.7,
        swiggy_food_accuracy: 79.8,
        swiggy_delayed_orders: 9.8,
        swiggy_kitchen_prep_time: 4.7,
        // Zomato performance metrics
        zomato_online_percent: 95.9,
        zomato_food_accuracy: 81.3,
        zomato_delayed_orders: 8.9
      },
      {
        outlet_code: "BTM",
        outlet_name: "BTM Layout",
        start_date: "11/08/2025",
        end_date: "17/08/2025",
        total_orders: 372,
        low_rated: 4,
        igcc: 1,
        errors: 5,
        error_rate: 1.34,
        high_rated: 52,
        high_rated_percent: 13.98,
        high_minus_error: 12.64,
        incentive: 1040,
        deduction: -150,
        incentives: 890,
        per_day: 127.14,
        // Swiggy performance metrics
        swiggy_online_percent: 99.1,
        swiggy_food_accuracy: 94.2,
        swiggy_delayed_orders: 2.1,
        swiggy_kitchen_prep_time: 2.8,
        // Zomato performance metrics
        zomato_online_percent: 98.8,
        zomato_food_accuracy: 93.6,
        zomato_delayed_orders: 2.5
      }
    ],
    '28 Day': [
      {
        outlet_code: "BLN",
        outlet_name: "Bellandur",
        start_date: "25/07/2025",
        end_date: "21/08/2025",
        total_orders: 2148,
        low_rated: 38,
        igcc: 8,
        errors: 48,
        error_rate: 2.23,
        high_rated: 212,
        high_rated_percent: 9.87,
        high_minus_error: 7.64,
        incentive: 0,
        deduction: -1440,
        incentives: -1440,
        per_day: -51.43,
        // Swiggy performance metrics
        swiggy_online_percent: 97.8,
        swiggy_food_accuracy: 84.1,
        swiggy_delayed_orders: 7.9,
        swiggy_kitchen_prep_time: 4.0,
        // Zomato performance metrics
        zomato_online_percent: 97.2,
        zomato_food_accuracy: 86.3,
        zomato_delayed_orders: 5.8
      },
      {
        outlet_code: "IND",
        outlet_name: "Indiranagar",
        start_date: "25/07/2025",
        end_date: "21/08/2025",
        total_orders: 1552,
        low_rated: 20,
        igcc: 8,
        errors: 28,
        error_rate: 1.8,
        high_rated: 172,
        high_rated_percent: 11.08,
        high_minus_error: 9.28,
        incentive: 3440,
        deduction: -840,
        incentives: 2600,
        per_day: 92.86,
        // Swiggy performance metrics
        swiggy_online_percent: 98.5,
        swiggy_food_accuracy: 92.8,
        swiggy_delayed_orders: 3.2,
        swiggy_kitchen_prep_time: 3.0,
        // Zomato performance metrics
        zomato_online_percent: 98.9,
        zomato_food_accuracy: 91.2,
        zomato_delayed_orders: 3.8
      },
      {
        outlet_code: "RR",
        outlet_name: "Residency Road",
        start_date: "25/07/2025",
        end_date: "21/08/2025",
        total_orders: 1312,
        low_rated: 24,
        igcc: 4,
        errors: 28,
        error_rate: 2.13,
        high_rated: 148,
        high_rated_percent: 11.28,
        high_minus_error: 9.15,
        incentive: 0,
        deduction: -840,
        incentives: -840,
        per_day: -30,
        // Swiggy performance metrics
        swiggy_online_percent: 96.1,
        swiggy_food_accuracy: 89.2,
        swiggy_delayed_orders: 6.5,
        swiggy_kitchen_prep_time: 3.6,
        // Zomato performance metrics
        zomato_online_percent: 97.8,
        zomato_food_accuracy: 93.7,
        zomato_delayed_orders: 4.9
      },
      {
        outlet_code: "KOR",
        outlet_name: "Koramangala",
        start_date: "25/07/2025",
        end_date: "21/08/2025",
        total_orders: 1780,
        low_rated: 32,
        igcc: 12,
        errors: 60,
        error_rate: 3.37,
        high_rated: 192,
        high_rated_percent: 10.78,
        high_minus_error: 7.41,
        incentive: 0,
        deduction: -1800,
        incentives: -1800,
        per_day: -64.29,
        // Swiggy performance metrics
        swiggy_online_percent: 95.3,
        swiggy_food_accuracy: 81.4,
        swiggy_delayed_orders: 8.7,
        swiggy_kitchen_prep_time: 4.4,
        // Zomato performance metrics
        zomato_online_percent: 96.5,
        zomato_food_accuracy: 83.8,
        zomato_delayed_orders: 7.6
      },
      {
        outlet_code: "BTM",
        outlet_name: "BTM Layout",
        start_date: "25/07/2025",
        end_date: "21/08/2025",
        total_orders: 1488,
        low_rated: 16,
        igcc: 4,
        errors: 20,
        error_rate: 1.34,
        high_rated: 208,
        high_rated_percent: 13.98,
        high_minus_error: 12.64,
        incentive: 4160,
        deduction: -600,
        incentives: 3560,
        per_day: 127.14,
        // Swiggy performance metrics
        swiggy_online_percent: 99.3,
        swiggy_food_accuracy: 95.1,
        swiggy_delayed_orders: 1.8,
        swiggy_kitchen_prep_time: 2.7,
        // Zomato performance metrics
        zomato_online_percent: 99.1,
        zomato_food_accuracy: 94.8,
        zomato_delayed_orders: 2.1
      }
    ]
  };

  // Simulate data fetching
  const fetchData = async (period) => {
    try {
      setLoading(true);
      setError(null);
      
      console.log(`Fetching data for period: ${period}`);
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const periodData = sampleDataSets[period] || sampleDataSets['7 Days'];
      setData(periodData);
      setLastUpdate(new Date().toLocaleString());
      setError(null);
      
    } catch (err) {
      console.error('Load data error:', err);
      setError(err.message || 'Failed to load data');
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

  // Swiggy Performance Data
  const getSwiggyPerformanceData = () => {
    return getFilteredData().map(d => ({
      outlet: d.outlet_name,
      online: d.swiggy_online_percent || 0,
      accuracy: d.swiggy_food_accuracy || 0,
      delayed: d.swiggy_delayed_orders || 0,
      kitchenTime: d.swiggy_kitchen_prep_time || 0
    }));
  };

  // Zomato Performance Data
  const getZomatoPerformanceData = () => {
    return getFilteredData().map(d => ({
      outlet: d.outlet_name,
      online: d.zomato_online_percent || 0,
      accuracy: d.zomato_food_accuracy || 0,
      delayed: d.zomato_delayed_orders || 0
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
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%)',
        color: '#ffffff'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '3px solid #333',
          borderTop: '3px solid #00ff88',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '20px'
        }}></div>
        <p style={{ 
          color: '#ffffff', 
          fontSize: '1.2rem', 
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
        }}>
          LOADING HIGH RATED DASHBOARD WITH PERFORMANCE METRICS...
        </p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Error screen with data fallback
  if (error && data.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%)',
        color: '#ffffff',
        padding: '20px',
        textAlign: 'center'
      }}>
        <h3 style={{
          color: '#ff4444',
          fontSize: '1.5rem',
          marginBottom: '15px',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
        }}>
          SYSTEM ERROR: {error}
        </h3>
        <p>Please check your server connection or contact support if the issue persists.</p>
        <button 
          onClick={() => fetchData(selectedPeriod)}
          style={{
            padding: '12px 24px',
            background: '#ff4444',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            cursor: 'pointer',
            marginTop: '20px'
          }}
        >
          RETRY CONNECTION
        </button>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%)',
      color: '#ffffff',
      padding: '20px'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '30px',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <div>
          <h1 style={{
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            fontSize: '2.5rem',
            margin: '0 0 10px 0',
            background: 'linear-gradient(135deg, #00ff88 0%, #00cc70 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '2px'
          }}>
            HIGH RATED PERFORMANCE DASHBOARD
          </h1>
          <p style={{ 
            color: '#888', 
            marginTop: '10px',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            fontSize: '0.9rem',
            letterSpacing: '1px'
          }}>
            LIVE DATA WITH PERFORMANCE METRICS • {data.length} OUTLETS • {selectedPeriod.toUpperCase()} DATA
            {error && ' • USING SAMPLE DATA DUE TO CONNECTION ISSUE'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedPeriod}
            onChange={(e) => handlePeriodChange(e.target.value)}
            style={{
              padding: '12px 18px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              color: '#ffffff',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              textTransform: 'uppercase',
              letterSpacing: '1px',
              backdropFilter: 'blur(10px)'
            }}
          >
            <option value="7 Days" style={{background: '#1a1a1a'}}>7 DAYS DATA</option>
            <option value="28 Day" style={{background: '#1a1a1a'}}>28 DAY DATA</option>
          </select>
          {expandedOutlet !== null && (
            <button
              onClick={minimized ? restoreModal : clearOutletSelection}
              style={{
                padding: '12px 18px',
                background: 'rgba(0, 255, 136, 0.2)',
                border: '1px solid #00ff88',
                borderRadius: '12px',
                color: '#00ff88',
                fontSize: '0.9rem',
                cursor: 'pointer',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}
            >
              {minimized ? `RESTORE ${data[expandedOutlet]?.outlet_name?.toUpperCase()}` : 'CLEAR SELECTION'}
            </button>
          )}
          <button 
            onClick={() => fetchData(selectedPeriod)}
            style={{
              padding: '12px 18px',
              background: '#00ff88',
              border: 'none',
              borderRadius: '12px',
              color: '#000000',
              fontSize: '0.9rem',
              fontWeight: '600',
              cursor: 'pointer',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}
          >
            REFRESH DATA
          </button>
        </div>
      </div>

      {/* Performance Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '20px',
        marginBottom: '30px'
      }}>
        {[
          { title: 'TOTAL ORDERS', value: stats.totalOrders },
          { title: 'HIGH RATED %', value: `${stats.highRatedPercent}%` },
          { title: 'LOW RATED %', value: `${stats.lowRatedPercent}%` },
          { title: 'ERROR RATE %', value: `${stats.errorRate}%` }
        ].map((metric, i) => (
          <div key={i} style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '15px',
            padding: '25px',
            textAlign: 'center',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{
              fontSize: '2.5rem',
              fontWeight: '700',
              color: '#00ff88',
              marginBottom: '10px',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
            }}>
              {metric.value}
            </div>
            <div style={{
              fontSize: '0.9rem',
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
            }}>
              {metric.title}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom 3 Outlets */}
      {bottom3.length > 0 && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderLeft: '4px solid #ff4444',
          borderRadius: '15px',
          padding: '25px',
          marginBottom: '30px',
          backdropFilter: 'blur(10px)'
        }}>
          <h3 style={{ 
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            margin: '0 0 20px 0',
            color: '#ffffff',
            fontSize: '1.2rem',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            TOP 3 HIGHEST ERROR RATE OUTLETS - NEEDS ATTENTION
          </h3>
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
                  background: 'rgba(255, 68, 68, 0.1)',
                  border: '1px solid rgba(255, 68, 68, 0.3)',
                  borderLeft: '4px solid #ff4444'
                }}
              >
                <h4 style={{
                  margin: '0 0 12px 0',
                  color: '#ffffff',
                  fontSize: '1.1rem',
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                }}>
                  #{index + 1} {outlet.name.toUpperCase()} ({outlet.error_rate}% ERROR RATE)
                </h4>
                <ul style={{ 
                  margin: 0, 
                  paddingLeft: '20px', 
                  color: '#ccc',
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
      )}

      {/* Filter Section */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '15px',
        padding: '25px',
        marginBottom: '30px',
        backdropFilter: 'blur(10px)'
      }}>
        <h3 style={{ 
          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
          margin: '0 0 20px 0',
          color: '#ffffff',
          fontSize: '1.2rem',
          textTransform: 'uppercase',
          letterSpacing: '1px'
        }}>
          OUTLET FILTER
        </h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <label style={{
            color: '#ffffff',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            fontSize: '0.9rem',
            letterSpacing: '1px'
          }}>
            FILTER BY OUTLET:
          </label>
          {filters.outlet && (
            <button 
              onClick={clearAllFilters} 
              style={{
                padding: '8px 16px',
                background: 'rgba(0, 255, 136, 0.2)',
                border: '1px solid #00ff88',
                borderRadius: '8px',
                color: '#00ff88',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
              }}
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
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '12px',
            fontSize: '0.9rem',
            cursor: 'pointer',
            color: '#ffffff',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
          }}
        >
          <option value="" style={{background: '#1a1a1a'}}>ALL OUTLETS</option>
          {filterOptions.outlets.map(outlet => (
            <option key={outlet} value={outlet} style={{background: '#1a1a1a'}}>{outlet.toUpperCase()}</option>
          ))}
        </select>
      </div>

      {/* Charts Grid - Enhanced with Performance Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(600px, 1fr))',
        gap: '30px',
        marginBottom: '30px'
      }}>
        {/* Error Rate Chart */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '15px',
          padding: '25px',
          backdropFilter: 'blur(10px)'
        }}>
          <h3 style={{ 
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            margin: '0 0 20px 0',
            color: '#ffffff',
            fontSize: '1.1rem',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            ERROR RATE BY OUTLET
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={getGraphData()}>
              <XAxis 
                dataKey="name" 
                angle={-45} 
                textAnchor="end" 
                height={100}
                tick={{ fontSize: 11, fill: '#888' }}
              />
              <YAxis tick={{ fontSize: 11, fill: '#888' }} />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'rgba(0, 0, 0, 0.9)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '10px',
                  color: '#ffffff'
                }}
                formatter={(value, name) => [`${value}%`, name]}
              />
              <Bar dataKey="Error Rate" fill="#ff4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* High Rated Percentage Chart */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '15px',
          padding: '25px',
          backdropFilter: 'blur(10px)'
        }}>
          <h3 style={{ 
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            margin: '0 0 20px 0',
            color: '#ffffff',
            fontSize: '1.1rem',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            HIGH RATED PERCENTAGE BY OUTLET
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={getGraphData()}>
              <XAxis 
                dataKey="name" 
                angle={-45} 
                textAnchor="end" 
                height={100}
                tick={{ fontSize: 11, fill: '#888' }}
              />
              <YAxis tick={{ fontSize: 11, fill: '#888' }} />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'rgba(0, 0, 0, 0.9)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '10px',
                  color: '#ffffff'
                }}
                formatter={(value, name) => [`${value}%`, name]}
              />
              <Bar dataKey="High Rated %" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Swiggy Performance Metrics */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderLeft: '4px solid #ff6600',
          borderRadius: '15px',
          padding: '25px',
          backdropFilter: 'blur(10px)'
        }}>
          <h3 style={{ 
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            margin: '0 0 20px 0',
            color: '#ff6600',
            fontSize: '1.1rem',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            SWIGGY PERFORMANCE METRICS BY OUTLET
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={getSwiggyPerformanceData()}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
              <XAxis dataKey="outlet" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 11, fill: '#888' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#888' }} />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'rgba(0, 0, 0, 0.9)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '10px',
                  color: '#ffffff'
                }}
              />
              <Legend wrapperStyle={{ color: '#888', fontSize: '12px' }} />
              <Line type="monotone" dataKey="online" stroke="#3b82f6" strokeWidth={2} name="Online %" />
              <Line type="monotone" dataKey="accuracy" stroke="#10b981" strokeWidth={2} name="Food Accuracy %" />
              <Line type="monotone" dataKey="delayed" stroke="#ff4444" strokeWidth={2} name="Delayed Orders %" />
              <ReferenceLine y={98} stroke="#3b82f6" strokeDasharray="3 3" label={{ value: "Online Target: 98%", position: "topLeft" }} />
              <ReferenceLine y={85} stroke="#10b981" strokeDasharray="3 3" label={{ value: "Accuracy Target: 85%", position: "topLeft" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Zomato Performance Metrics */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderLeft: '4px solid #e23744',
          borderRadius: '15px',
          padding: '25px',
          backdropFilter: 'blur(10px)'
        }}>
          <h3 style={{ 
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            margin: '0 0 20px 0',
            color: '#e23744',
            fontSize: '1.1rem',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            ZOMATO PERFORMANCE METRICS BY OUTLET
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={getZomatoPerformanceData()}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
              <XAxis dataKey="outlet" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 11, fill: '#888' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#888' }} />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'rgba(0, 0, 0, 0.9)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '10px',
                  color: '#ffffff'
                }}
              />
              <Legend wrapperStyle={{ color: '#888', fontSize: '12px' }} />
              <Line type="monotone" dataKey="online" stroke="#3b82f6" strokeWidth={2} name="Online %" />
              <Line type="monotone" dataKey="accuracy" stroke="#10b981" strokeWidth={2} name="Food Accuracy %" />
              <Line type="monotone" dataKey="delayed" stroke="#ff4444" strokeWidth={2} name="Delayed Orders %" />
              <ReferenceLine y={98} stroke="#3b82f6" strokeDasharray="3 3" label={{ value: "Online Target: 98%", position: "topLeft" }} />
              <ReferenceLine y={95} stroke="#10b981" strokeDasharray="3 3" label={{ value: "Accuracy Target: 95%", position: "topLeft" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Low Rated Percentage Chart */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '15px',
          padding: '25px',
          backdropFilter: 'blur(10px)'
        }}>
          <h3 style={{ 
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            margin: '0 0 20px 0',
            color: '#ffffff',
            fontSize: '1.1rem',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            LOW RATED PERCENTAGE BY OUTLET
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={getGraphData()}>
              <XAxis 
                dataKey="name" 
                angle={-45} 
                textAnchor="end" 
                height={100}
                tick={{ fontSize: 11, fill: '#888' }}
              />
              <YAxis tick={{ fontSize: 11, fill: '#888' }} />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'rgba(0, 0, 0, 0.9)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '10px',
                  color: '#ffffff'
                }}
                formatter={(value, name) => [`${value}%`, name]}
              />
              <Bar dataKey="Low Rated %" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Outlet Details Table */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '15px',
        padding: '25px',
        marginBottom: '30px',
        backdropFilter: 'blur(10px)'
      }}>
        <h3 style={{ 
          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
          margin: '0 0 20px 0',
          color: '#ffffff',
          fontSize: '1.2rem',
          textTransform: 'uppercase',
          letterSpacing: '1px'
        }}>
          OUTLET PERFORMANCE DETAILS ({selectedPeriod.toUpperCase()})
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'linear-gradient(135deg, #00ff88 0%, #00cc70 100%)' }}>
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
                    color: '#000000', 
                    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                    fontSize: '0.9rem',
                    letterSpacing: '1px',
                    fontWeight: '600'
                  }}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredData.map((outlet, i) => {
                const hasNeedsWork = outlet.high_minus_error <= 5;
                return (
                  <tr 
                    key={outlet.outlet_code} 
                    style={{ 
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      background: hasNeedsWork 
                        ? 'rgba(255, 68, 68, 0.15)' 
                        : expandedOutlet === i 
                          ? 'rgba(255, 255, 255, 0.1)' 
                          : 'transparent'
                    }}
                    onClick={() => { setExpandedOutlet(i); setMinimized(false); }}
                    onMouseEnter={(e) => e.target.closest('tr').style.background = 'rgba(255, 255, 255, 0.05)'}
                    onMouseLeave={(e) => e.target.closest('tr').style.background = hasNeedsWork 
                      ? 'rgba(255, 68, 68, 0.15)' 
                      : expandedOutlet === i 
                        ? 'rgba(255, 255, 255, 0.1)' 
                        : 'transparent'}
                  >
                    <td style={{ 
                      padding: '18px', 
                      fontWeight: '600', 
                      color: hasNeedsWork ? '#ffffff' : '#ffffff',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" 
                    }}>
                      {outlet.outlet_name.toUpperCase()}
                    </td>
                    <td style={{ 
                      padding: '18px',
                      color: hasNeedsWork ? '#ffffff' : '#ccc',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                    }}>
                      {outlet.total_orders}
                    </td>
                    <td style={{ 
                      padding: '18px',
                      color: hasNeedsWork ? '#ffffff' : '#ccc',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                    }}>
                      {outlet.high_rated}
                    </td>
                    <td style={{ 
                      padding: '18px',
                      color: hasNeedsWork ? '#ffffff' : '#ccc',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                    }}>
                      {outlet.low_rated}
                    </td>
                    <td style={{ 
                      padding: '18px',
                      color: hasNeedsWork ? '#ffffff' : '#ccc',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                    }}>
                      {outlet.igcc}
                    </td>
                    <td style={{ 
                      padding: '18px',
                      color: hasNeedsWork ? '#ffffff' : '#ccc',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                    }}>
                      {outlet.errors}
                    </td>
                    <td style={{ 
                      padding: '18px',
                      color: hasNeedsWork ? '#ffffff' : '#ccc',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                    }}>
                      {outlet.error_rate}%
                    </td>
                    <td style={{ 
                      padding: '18px',
                      color: hasNeedsWork ? '#ffffff' : '#ccc',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                    }}>
                      {outlet.high_rated_percent}%
                    </td>
                    <td style={{ 
                      padding: '18px',
                      color: hasNeedsWork ? '#ffffff' : '#ccc',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                    }}>
                      {outlet.high_minus_error}%
                    </td>
                    <td style={{ 
                      padding: '18px',
                      color: hasNeedsWork 
                        ? '#ffffff' 
                        : outlet.incentive >= 0 
                          ? '#00ff88' 
                          : '#ff4444',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                    }}>
                      ₹{outlet.incentive}
                    </td>
                    <td style={{ 
                      padding: '18px',
                      color: hasNeedsWork ? '#ffffff' : '#ff4444',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                    }}>
                      ₹{outlet.deduction}
                    </td>
                    <td style={{ 
                      padding: '18px',
                      color: hasNeedsWork 
                        ? '#ffffff' 
                        : outlet.incentives >= 0 
                          ? '#00ff88' 
                          : '#ff4444',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                    }}>
                      ₹{outlet.incentives}
                    </td>
                    <td style={{ 
                      padding: '18px',
                      color: hasNeedsWork 
                        ? '#ffffff' 
                        : outlet.per_day >= 0 
                          ? '#00ff88' 
                          : '#ff4444',
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
                        background: outlet.high_minus_error > 8 
                          ? 'rgba(0, 255, 136, 0.2)' 
                          : outlet.high_minus_error > 5 
                            ? 'rgba(59, 130, 246, 0.2)' 
                            : 'rgba(255, 68, 68, 0.2)',
                        color: hasNeedsWork 
                          ? '#ffffff' 
                          : outlet.high_minus_error > 8 
                            ? '#00ff88' 
                            : outlet.high_minus_error > 5 
                              ? '#3b82f6' 
                              : '#ff4444',
                        border: `1px solid ${outlet.high_minus_error > 8 
                          ? '#00ff88' 
                          : outlet.high_minus_error > 5 
                            ? '#3b82f6' 
                            : '#ff4444'}`
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

      {/* Outlet Detail Modal */}
      {expandedOutlet !== null && filteredData[expandedOutlet] && !minimized && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }} onClick={clearOutletSelection}>
          <div style={{
            background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '20px',
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflow: 'auto',
            backdropFilter: 'blur(20px)'
          }} onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={clearOutletSelection}
              style={{
                position: 'absolute',
                top: '20px',
                right: '30px',
                background: 'none',
                border: 'none',
                color: '#ffffff',
                fontSize: '2rem',
                cursor: 'pointer',
                zIndex: 1001
              }}
            >
              ×
            </button>
            <div style={{ padding: '30px', color: '#ffffff' }}>
              <h3 style={{
                margin: '0 0 25px 0',
                color: '#ffffff',
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
                  { label: 'PER DAY', value: `₹${filteredData[expandedOutlet].per_day}` },
                  // Performance metrics
                  { label: 'SWIGGY ONLINE %', value: `${(filteredData[expandedOutlet].swiggy_online_percent || 0).toFixed(2)}%`, highlight: 'swiggy' },
                  { label: 'SWIGGY FOOD ACCURACY', value: `${(filteredData[expandedOutlet].swiggy_food_accuracy || 0).toFixed(2)}%`, highlight: 'swiggy' },
                  { label: 'SWIGGY DELAYED ORDERS', value: `${(filteredData[expandedOutlet].swiggy_delayed_orders || 0).toFixed(2)}%`, highlight: 'swiggy' },
                  { label: 'SWIGGY KITCHEN PREP TIME', value: `${(filteredData[expandedOutlet].swiggy_kitchen_prep_time || 0).toFixed(1)}min`, highlight: 'swiggy' },
                  { label: 'ZOMATO ONLINE %', value: `${(filteredData[expandedOutlet].zomato_online_percent || 0).toFixed(2)}%`, highlight: 'zomato' },
                  { label: 'ZOMATO FOOD ACCURACY', value: `${(filteredData[expandedOutlet].zomato_food_accuracy || 0).toFixed(2)}%`, highlight: 'zomato' },
                  { label: 'ZOMATO DELAYED ORDERS', value: `${(filteredData[expandedOutlet].zomato_delayed_orders || 0).toFixed(2)}%`, highlight: 'zomato' }
                ].map((item, index) => (
                  <div key={index} style={{
                    padding: '15px',
                    background: item.highlight === 'swiggy' 
                      ? 'rgba(255, 102, 0, 0.1)' 
                      : item.highlight === 'zomato' 
                        ? 'rgba(226, 55, 68, 0.1)' 
                        : 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '10px',
                    border: item.highlight === 'swiggy' 
                      ? '1px solid rgba(255, 102, 0, 0.3)' 
                      : item.highlight === 'zomato' 
                        ? '1px solid rgba(226, 55, 68, 0.3)' 
                        : '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <div style={{ 
                      fontSize: '0.8rem', 
                      color: item.highlight === 'swiggy' 
                        ? '#ff6600' 
                        : item.highlight === 'zomato' 
                          ? '#e23744' 
                          : '#888', 
                      marginBottom: '5px',
                      letterSpacing: '1px'
                    }}>
                      {item.label}
                    </div>
                    <div style={{ 
                      fontSize: '1rem', 
                      color: '#ffffff', 
                      fontWeight: '600'
                    }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '25px' }}>
                <button 
                  onClick={minimizeModal}
                  style={{
                    padding: '12px 18px',
                    background: 'rgba(0, 255, 136, 0.2)',
                    border: '1px solid #00ff88',
                    borderRadius: '12px',
                    color: '#00ff88',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                    textTransform: 'uppercase',
                    letterSpacing: '1px'
                  }}
                >
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
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '15px',
          padding: '15px',
          marginTop: '25px',
          textAlign: 'center',
          backdropFilter: 'blur(10px)',
          fontSize: '0.8rem'
        }}>
          <p style={{
            color: '#888',
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
      {expandedOutlet !== null && minimized && (
        <div 
          style={{
            position: 'fixed',
            bottom: '30px',
            right: '30px',
            background: 'rgba(0, 0, 0, 0.9)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '15px',
            padding: '15px 25px',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            backdropFilter: 'blur(15px)',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
            zIndex: 999
          }}
          onClick={restoreModal}
        >
          <span style={{
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            fontSize: '0.9rem',
            letterSpacing: '1px',
            color: '#ffffff'
          }}>
            {filteredData[expandedOutlet]?.outlet_name.toUpperCase()} DETAILS
          </span>
        </div>
      )}
    </div>
  );
};

export default HighRatedDashboard;