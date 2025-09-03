import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine
} from 'recharts';

const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

const SwiggyDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('7 Day');
  const [selectedOutlet, setSelectedOutlet] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [aiInsights, setAiInsights] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);

  // Mock data based on the provided document structure
  const mockData = {
    outlets: [
      'Yelahanka', 'Residency Road', 'Mahadevapura', 'Koramangala', 'Kalyan Nagar', 
      'Bellandur', 'Indiranagar', 'J P Nagar', 'Jayanagar', 'HSR', 'Rajajinagara'
    ],
    oneDayData: {
      m2o: [24.2, 25.7, 19.5, 28.9, 21.6, 22.8, 23.4, 19.5, 20.3, 23.5, 11.8],
      m2oTrend: [36.4, 39.4, 7.8, 21.7, 24.2, -11.5, 10.2, 21.8, 8.3, 21.0, -48.4],
      newCustomers: [31.4, 41.5, 37.5, 38.0, 35.4, 39.7, 44.7, 39.5, 45.8, 50.7, 52.2],
      newCustomerTrend: [-5.88, 83.33, -34.78, -5.00, 27.78, 3.57, 13.33, 240.00, -26.67, 48.00, -33.33],
      repeatCustomers: [43.1, 34.0, 42.5, 36.0, 38.5, 37.0, 34.2, 30.2, 33.3, 31.5, 43.5],
      repeatCustomerTrend: [10.00, 0.00, -10.53, -18.18, -21.88, -37.21, -51.85, -27.78, -52.94, -8.00, -44.44],
      dormantCustomers: [25.5, 24.5, 20.0, 26.0, 26.2, 23.3, 21.1, 30.2, 20.8, 17.8, 4.3],
      totalCustomers: [51, 53, 40, 50, 65, 73, 38, 43, 24, 73, 23],
      totalCustomerTrend: [37.84, 76.67, -4.76, 19.05, 30.00, 2.82, -9.52, 86.96, -25.00, 46.00, -36.11],
      kitchenPrepTime: [3.3, 1.6, 5.8, 3.3, 3.9, 3.1, 4.5, 4.2, 6.8, 4.7, 2.4],
      foodAccuracy: [96.08, 92.45, 92.68, 82.00, 90.77, 91.78, 90.00, 90.70, 84.00, 93.24, 83.33],
      delayedOrders: [5.88, 3.77, 9.76, 4.00, 3.08, 1.37, 10.00, 11.63, 8.00, 4.05, 4.17],
      adOrders: [5.4, 37.8, -87.6, -67.7, 14.1, -82.4, -74.0, 97.5, -100.0, 28.6, 18.6],
      adSpend: [1612, 1488, 204, 480, 2724, 384, 384, 1920, 0, 2700, 1275],
      adM2o: [15.5, 20.2, 18.6, 19.6, 15.8, 17.5, 19.6, 12.8, 6.1, 19.1, 8.4],
      adM2oTrend: [13.1, 15.6, 42.5, 5.4, 25.9, -20.9, 16.8, 32.9, -58.1, 51.4, -49.1],
      organicM2o: [41.1, 34.6, 20.6, 41.0, 37.2, 29.1, 29.2, 38.6, 30.4, 34.0, 17.6],
      organicM2oTrend: [57.9, 54.6, -19.2, 9.4, 18.1, -15.7, -7.7, 57.0, -11.2, -9.3, -46.2],
      onlinePercent: [100.00, 99.88, 88.85, 100.00, 97.93, 94.94, 100.00, 98.05, 100.00, 94.83, 100.00]
    },
    sevenDayData: {
      m2o: [22.3, 21.2, 19.0, 21.2, 18.7, 20.3, 23.9, 15.9, 19.4, 20.5, 14.5],
      m2oTrend: [22.5, -4.0, 15.3, 10.7, 4.3, -11.0, 4.1, -6.3, 17.2, -3.9, -23.2],
      newCustomers: [36.4, 38.1, 45.7, 33.0, 33.0, 38.3, 36.3, 39.6, 44.9, 51.4, 48.3],
      newCustomerTrend: [13.79, 48.53, 21.84, 7.14, -5.17, 22.73, 22.22, 24.59, 20.97, 41.98, 14.75],
      repeatCustomers: [58.8, 57.0, 50.9, 61.2, 61.9, 57.7, 60.8, 53.6, 52.1, 45.0, 51.0],
      repeatCustomerTrend: [60.00, 18.90, 81.54, 80.52, 54.89, 45.24, 31.75, 35.53, 42.62, 11.64, -5.13],
      dormantCustomers: [4.8, 4.9, 3.4, 5.7, 5.1, 4.0, 2.9, 6.8, 3.0, 3.6, 0.7],
      dormantCustomerTrend: [8.33, -50.00, 14.29, -7.14, -19.05, -37.04, -42.86, -13.33, -44.44, -31.58, -90.00],
      totalCustomers: [272, 265, 232, 227, 333, 423, 273, 192, 167, 362, 145],
      totalCustomerTrend: [-26.84, -16.60, -31.47, -29.07, -18.92, -22.70, -19.05, -20.83, -20.96, -18.23, 2.76],
      kitchenPrepTime: [4.0, 1.2, 5.4, 2.2, 3.1, 3.3, 3.8, 3.5, 5.2, 2.8, 2.7],
      foodAccuracy: [87.36, 95.05, 92.61, 90.59, 95.11, 95.07, 90.29, 96.17, 78.91, 96.75, 89.30],
      delayedOrders: [9.52, 2.35, 6.01, 3.85, 2.53, 4.20, 6.50, 5.34, 10.31, 0.51, 5.03],
      adOrders: [22.8, 34.6, -5.5, -2.7, 16.1, -8.4, 6.2, 48.2, -43.9, 24.5, 20.4],
      adSpend: [8427, 8736, 6132, 5700, 13188, 9087, 7248, 8784, 3168, 13536, 6339],
      adM2o: [20.1, 18.8, 16.4, 16.5, 15.1, 17.9, 20.7, 12.8, 14.5, 18.5, 11.5],
      adM2oTrend: [15.8, 7.2, 9.9, 7.6, 17.6, -3.9, 16.3, -20.7, 8.8, 11.5, -21.1],
      organicM2o: [25.9, 24.4, 22.6, 27.4, 26.9, 23.4, 29.9, 21.7, 24.5, 24.7, 19.1],
      organicM2oTrend: [23.5, -10.2, 23.0, 10.4, -0.8, -19.2, -5.3, 20.1, 11.4, -19.7, -22.5],
      onlinePercent: [98.41, 99.74, 93.51, 99.97, 97.96, 95.49, 99.68, 97.83, 99.55, 90.26, 100.00]
    }
  };

  // Fetch data with AI analysis
  const fetchData = async (period) => {
    try {
      setLoading(true);
      // In a real implementation, this would call Google Sheets API
      // const response = await axios.get(`${API_URL}/api/swiggy-dashboard-data`, {
      //   params: { 
      //     fileId: '1XmKondedSs_c6PZflanfB8OFUsGxVoqi5pUPvscT8cs',
      //     period,
      //     oneDayRange: 'C9:C21',
      //     sevenDayRange: 'C25:C37'
      //   }
      // });
      
      // Using mock data for now
      const dashboardData = {
        outlets: mockData.outlets,
        currentData: period === '1 Day' ? mockData.oneDayData : mockData.sevenDayData,
        summary: {
          totalOutlets: mockData.outlets.length,
          avgM2O: period === '1 Day' 
            ? (mockData.oneDayData.m2o.reduce((a, b) => a + b, 0) / mockData.outlets.length).toFixed(2)
            : (mockData.sevenDayData.m2o.reduce((a, b) => a + b, 0) / mockData.outlets.length).toFixed(2),
          avgOnlinePercent: period === '1 Day'
            ? (mockData.oneDayData.onlinePercent.reduce((a, b) => a + b, 0) / mockData.outlets.length).toFixed(2)
            : (mockData.sevenDayData.onlinePercent.reduce((a, b) => a + b, 0) / mockData.outlets.length).toFixed(2),
          avgFoodAccuracy: period === '1 Day'
            ? (mockData.oneDayData.foodAccuracy.reduce((a, b) => a + b, 0) / mockData.outlets.length).toFixed(2)
            : (mockData.sevenDayData.foodAccuracy.reduce((a, b) => a + b, 0) / mockData.outlets.length).toFixed(2),
          avgKitchenPrepTime: period === '1 Day'
            ? (mockData.oneDayData.kitchenPrepTime.reduce((a, b) => a + b, 0) / mockData.outlets.length).toFixed(2)
            : (mockData.sevenDayData.kitchenPrepTime.reduce((a, b) => a + b, 0) / mockData.outlets.length).toFixed(2)
        }
      };
      
      setData(dashboardData);
      setLastUpdate(new Date().toLocaleString());
      setError(null);
      
      // Generate AI insights for new data
      generateAIInsights(dashboardData, period);
      
    } catch (err) {
      setError('Failed to load data. Make sure backend is running.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Generate AI insights focusing on bottom performers
  const generateAIInsights = async (dashboardData, period) => {
    try {
      setLoadingAI(true);
      
      // Mock AI insights generation - in real implementation, use Gemini API
      const currentData = dashboardData.currentData;
      
      // Find bottom 3 outlets based on M2O
      const outletPerformance = dashboardData.outlets.map((outlet, index) => ({
        name: outlet,
        index,
        m2o: currentData.m2o[index],
        onlinePercent: currentData.onlinePercent[index],
        foodAccuracy: currentData.foodAccuracy[index],
        kitchenPrepTime: currentData.kitchenPrepTime[index]
      })).sort((a, b) => a.m2o - b.m2o);

      const bottomThree = outletPerformance.slice(0, 3);
      const flaggedOutlets = outletPerformance.filter(outlet => 
        outlet.onlinePercent < 98 || 
        outlet.foodAccuracy < 85 || 
        outlet.kitchenPrepTime > 4
      );

      const insights = {
        keyFindings: [
          `Bottom 3 performers: ${bottomThree.map(o => o.name).join(', ')} with M2O rates below ${bottomThree[2].m2o.toFixed(1)}%`,
          `${flaggedOutlets.length} outlets flagged for immediate attention based on critical thresholds`,
          `Average food accuracy: ${dashboardData.summary.avgFoodAccuracy}% - target should be 95%+`,
          `${outletPerformance.filter(o => o.onlinePercent < 98).length} outlets below 98% online presence threshold`
        ],
        recommendations: [
          'Immediate intervention needed for bottom 3 M2O performers',
          'Focus on food accuracy improvements for outlets below 85%',
          'Optimize kitchen workflows for outlets with prep time > 4 minutes',
          'Enhance online presence strategy for flagged outlets'
        ],
        bottomThreeAnalysis: bottomThree,
        flaggedOutlets: flaggedOutlets
      };
      
      setAiInsights(insights);
      
    } catch (err) {
      console.error('AI insights generation failed:', err);
    } finally {
      setLoadingAI(false);
    }
  };

  // Generate specific outlet analysis using real backend
  const analyzeOutlet = async (outletIndex) => {
    if (!data || outletIndex === null) return;
    
    try {
      setLoadingAI(true);
      const currentData = data.currentData;
      const outletData = {
        name: data.outlets[outletIndex],
        m2o: currentData.m2o[outletIndex],
        m2oTrend: currentData.m2oTrend[outletIndex],
        onlinePercent: currentData.onlinePercent[outletIndex],
        foodAccuracy: currentData.foodAccuracy[outletIndex],
        delayedOrders: currentData.delayedOrders[outletIndex],
        kitchenPrepTime: currentData.kitchenPrepTime[outletIndex],
        newCustomers: currentData.newCustomers[outletIndex],
        repeatCustomers: currentData.repeatCustomers[outletIndex],
        dormantCustomers: currentData.dormantCustomers[outletIndex]
      };
      
      // Call real Swiggy outlet analysis endpoint
      const response = await axios.post(`${API_URL}/api/swiggy-analyze-outlet`, {
        outlet: outletData,
        period: selectedPeriod,
        allData: data
      });
      
      if (response.data.success) {
        setAiInsights({
          ...aiInsights,
          outletAnalysis: response.data.analysis,
          focusOutlet: data.outlets[outletIndex]
        });
        setShowAIPanel(true);
        console.log('✅ Successfully generated outlet analysis for:', data.outlets[outletIndex]);
      } else {
        throw new Error(response.data.error || 'Failed to analyze outlet');
      }
      
    } catch (err) {
      console.error('Outlet analysis failed:', err);
      
      // Fallback analysis if backend fails
      const currentData = data.currentData;
      const outletData = {
        name: data.outlets[outletIndex],
        m2o: currentData.m2o[outletIndex],
        onlinePercent: currentData.onlinePercent[outletIndex],
        foodAccuracy: currentData.foodAccuracy[outletIndex],
        kitchenPrepTime: currentData.kitchenPrepTime[outletIndex]
      };
      
      const criticalIssues = [];
      if (outletData.onlinePercent < 98) criticalIssues.push('online presence below 98%');
      if (outletData.foodAccuracy < 85) criticalIssues.push('food accuracy below 85%');
      if (outletData.kitchenPrepTime > 4) criticalIssues.push('kitchen prep time over 4 minutes');
      
      const performance = outletData.m2o > 20 ? 'excellent' : outletData.m2o > 15 ? 'good' : outletData.m2o > 10 ? 'average' : 'critical';
      
      let analysis = `${outletData.name} shows ${performance} performance with ${outletData.m2o.toFixed(2)}% M2O.`;
      
      if (criticalIssues.length > 0) {
        analysis += ` CRITICAL ISSUES: ${criticalIssues.join(', ')}. Immediate intervention required.`;
      } else if (outletData.m2o < 15) {
        analysis += ' Focus needed on customer satisfaction and operational efficiency.';
      } else {
        analysis += ' Maintain current strategies while monitoring key metrics.';
      }
      
      setAiInsights({
        ...aiInsights,
        outletAnalysis: analysis,
        focusOutlet: data.outlets[outletIndex]
      });
      setShowAIPanel(true);
    } finally {
      setLoadingAI(false);
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
    setSelectedOutlet(null);
    setMinimized(false);
    setShowAIPanel(false);
    fetchData(period);
  };

  // Handle outlet click with AI analysis
  const handleOutletClick = (event) => {
    const index = event?.activeTooltipIndex ?? null;
    setSelectedOutlet(index);
    setMinimized(false);
    if (index !== null) {
      analyzeOutlet(index);
    }
  };

  // Clear outlet selection
  const clearOutletSelection = () => {
    setSelectedOutlet(null);
    setMinimized(false);
    setShowAIPanel(false);
  };

  // Minimize modal
  const minimizeModal = () => {
    setMinimized(true);
  };

  // Restore modal
  const restoreModal = () => {
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
          LOADING SWIGGY DASHBOARD WITH AI INSIGHTS...
        </p>
      </div>
    );
  }

  // Error screen
  if (error) {
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

  if (!data) return null;

  const currentData = data.currentData;

  // Enhanced data preparations
  const m2oChartData = selectedOutlet !== null
    ? [{
        outlet: data.outlets[selectedOutlet],
        m2o: currentData.m2o[selectedOutlet],
        trend: currentData.m2oTrend[selectedOutlet]
      }]
    : data.outlets.map((outlet, i) => ({
        outlet,
        m2o: currentData.m2o[i],
        trend: currentData.m2oTrend[i]
      }));

  // Customer segmentation data
  const customerData = selectedOutlet !== null
    ? [
        { 
          name: 'New Customers', 
          value: parseFloat((currentData.newCustomers[selectedOutlet] || 0).toFixed(1)),
        },
        { 
          name: 'Repeat Customers', 
          value: parseFloat((currentData.repeatCustomers[selectedOutlet] || 0).toFixed(1)),
        },
        { 
          name: 'Dormant Customers', 
          value: parseFloat((currentData.dormantCustomers[selectedOutlet] || 0).toFixed(1)),
        }
      ]
    : [
        { 
          name: 'New Customers', 
          value: parseFloat((currentData.newCustomers.reduce((a, b) => a + b, 0) / (currentData.newCustomers.length || 1)).toFixed(1)),
        },
        { 
          name: 'Repeat Customers', 
          value: parseFloat((currentData.repeatCustomers.reduce((a, b) => a + b, 0) / (currentData.repeatCustomers.length || 1)).toFixed(1)),
        },
        { 
          name: 'Dormant Customers', 
          value: parseFloat((currentData.dormantCustomers.reduce((a, b) => a + b, 0) / (currentData.dormantCustomers.length || 1)).toFixed(1)),
        }
      ];

  // Performance data with market share trend
  const performanceData = selectedOutlet !== null
    ? [{
        outlet: data.outlets[selectedOutlet],
        online: currentData.onlinePercent[selectedOutlet],
        accuracy: currentData.foodAccuracy[selectedOutlet],
        delayed: currentData.delayedOrders[selectedOutlet],
        marketShareTrend: currentData.m2oTrend[selectedOutlet] // Using M2O trend as market share trend proxy
      }]
    : data.outlets.map((outlet, i) => ({
        outlet,
        online: currentData.onlinePercent[i],
        accuracy: currentData.foodAccuracy[i],
        delayed: currentData.delayedOrders[i],
        marketShareTrend: currentData.m2oTrend[i]
      }));

  const COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1'];

  // AI-powered performance categorization
  const getPerformanceCategory = (m2o, trend, accuracy, onlinePercent) => {
    if (m2o > 20 && trend > 10 && accuracy > 95 && onlinePercent > 98) return 'EXCELLENT';
    if (m2o > 18 && accuracy > 90 && onlinePercent > 95) return 'GOOD';
    if (m2o > 15 && onlinePercent > 90) return 'AVERAGE';
    return 'NEEDS URGENT ATTENTION';
  };

  // Bottom three performers
  const bottomThreeOutlets = data.outlets
    .map((outlet, i) => ({ outlet, index: i, m2o: currentData.m2o[i] }))
    .sort((a, b) => a.m2o - b.m2o)
    .slice(0, 3);

  return (
    <div className="checklist-dashboard">
      {/* Header */}
      <div className="checklist-header">
        <div>
          <h1 style={{
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
          }}>
            SWIGGY DASHBOARD
          </h1>
          <p style={{ 
            color: 'var(--text-secondary)', 
            marginTop: '10px',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            fontSize: '0.9rem',
            letterSpacing: '1px'
          }}>
            AI-POWERED INSIGHTS • LIVE DATA FROM GOOGLE SHEETS • {data.summary.totalOutlets} OUTLETS • {selectedPeriod.toUpperCase()} DATA
            {selectedOutlet !== null && ` • VIEWING: ${data.outlets[selectedOutlet].toUpperCase()}`}
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
            <option value="7 Day">7 DAY DATA</option>
            <option value="1 Day">1 DAY DATA</option>
          </select>
          <button
            onClick={() => setShowAIPanel(!showAIPanel)}
            className={showAIPanel ? "responses-btn" : "refresh-btn"}
            style={{ background: showAIPanel ? 'var(--surface-light)' : undefined }}
          >
            {loadingAI ? '⟲ ANALYZING...' : 'AI INSIGHTS'}
          </button>
          {selectedOutlet !== null && (
            <button
              onClick={minimized ? restoreModal : clearOutletSelection}
              className="responses-btn"
            >
              {minimized ? `RESTORE ${data.outlets[selectedOutlet].toUpperCase()}` : 'CLEAR SELECTION'}
            </button>
          )}
          <button onClick={() => fetchData(selectedPeriod)} className="refresh-btn">
            REFRESH DATA
          </button>
        </div>
      </div>

      {/* AI Insights Panel */}
      {showAIPanel && aiInsights && (
        <div className="submission-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ 
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                color: '#10b981'
              }}>
                AI-POWERED BOTTOM 3 OUTLET ANALYSIS {aiInsights.focusOutlet ? `FOR ${aiInsights.focusOutlet.toUpperCase()}` : ''}
              </h3>
            </div>
          </div>
          <div className="responses-section">
            <div style={{
              background: 'rgba(239, 68, 68, 0.05)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '15px',
              padding: '25px',
              marginBottom: '20px'
            }}>
              <h4 style={{
                margin: '0 0 15px 0',
                color: '#ef4444',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                fontSize: '1rem',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                CRITICAL FINDINGS
              </h4>
              {aiInsights.keyFindings && (
                <ul style={{
                  margin: 0,
                  paddingLeft: '20px',
                  color: 'var(--text-secondary)',
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                  fontSize: '0.9rem',
                  lineHeight: 1.6
                }}>
                  {aiInsights.keyFindings.map((finding, index) => (
                    <li key={index} style={{ marginBottom: '8px' }}>{finding}</li>
                  ))}
                </ul>
              )}
            </div>
            
            <div style={{
              background: 'rgba(59, 130, 246, 0.05)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '15px',
              padding: '25px',
              marginBottom: '20px'
            }}>
              <h4 style={{
                margin: '0 0 15px 0',
                color: 'var(--text-primary)',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                fontSize: '1rem',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                URGENT INTERVENTIONS REQUIRED
              </h4>
              {aiInsights.recommendations && (
                <ul style={{
                  margin: 0,
                  paddingLeft: '20px',
                  color: 'var(--text-secondary)',
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                  fontSize: '0.9rem',
                  lineHeight: 1.6
                }}>
                  {aiInsights.recommendations.map((rec, index) => (
                    <li key={index} style={{ marginBottom: '8px' }}>{rec}</li>
                  ))}
                </ul>
              )}
            </div>

            {aiInsights.flaggedOutlets && aiInsights.flaggedOutlets.length > 0 && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.05)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                borderRadius: '15px',
                padding: '25px'
              }}>
                <h4 style={{
                  margin: '0 0 15px 0',
                  color: '#f59e0b',
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                  fontSize: '1rem',
                  textTransform: 'uppercase',
                  letterSpacing: '1px'
                }}>
                  OUTLETS FLAGGED FOR IMMEDIATE ATTENTION
                </h4>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {aiInsights.flaggedOutlets.map((outlet, index) => (
                    <div key={index} style={{
                      padding: '10px',
                      background: 'rgba(245, 158, 11, 0.1)',
                      borderRadius: '8px',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      fontSize: '0.8rem'
                    }}>
                      <strong>{outlet.name.toUpperCase()}:</strong> 
                      {outlet.onlinePercent < 98 && ` Online: ${outlet.onlinePercent.toFixed(1)}% (Target: 98%+)`}
                      {outlet.foodAccuracy < 85 && ` Food Accuracy: ${outlet.foodAccuracy.toFixed(1)}% (Target: 85%+)`}
                      {outlet.kitchenPrepTime > 4 && ` Kitchen Prep: ${outlet.kitchenPrepTime.toFixed(1)}min (Target: <4min)`}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {aiInsights.outletAnalysis && (
              <div style={{
                background: 'rgba(16, 185, 129, 0.05)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                borderRadius: '15px',
                padding: '25px',
                marginTop: '20px'
              }}>
                <h4 style={{
                  margin: '0 0 15px 0',
                  color: '#10b981',
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                  fontSize: '1rem',
                  textTransform: 'uppercase',
                  letterSpacing: '1px'
                }}>
                  OUTLET-SPECIFIC ANALYSIS
                </h4>
                <p style={{
                  margin: 0,
                  color: 'var(--text-secondary)',
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                  fontSize: '0.9rem',
                  lineHeight: 1.6
                }}>
                  {aiInsights.outletAnalysis}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Enhanced Performance Stats */}
      <div className="checklist-stats">
        {[
          { 
            title: 'AVERAGE M2O', 
            value: selectedOutlet !== null ? `${(currentData.m2o[selectedOutlet] || 0).toFixed(2)}%` : `${data.summary.avgM2O}%`, 
            trend: selectedOutlet !== null ? currentData.m2oTrend[selectedOutlet] : null,
            target: 20,
            performance: selectedOutlet !== null ? currentData.m2o[selectedOutlet] : parseFloat(data.summary.avgM2O)
          },
          { 
            title: 'ONLINE PRESENCE', 
            value: selectedOutlet !== null ? `${(currentData.onlinePercent[selectedOutlet] || 0).toFixed(2)}%` : `${data.summary.avgOnlinePercent}%`,
            target: 98,
            performance: selectedOutlet !== null ? currentData.onlinePercent[selectedOutlet] : parseFloat(data.summary.avgOnlinePercent)
          },
          { 
            title: 'FOOD ACCURACY', 
            value: selectedOutlet !== null ? `${(currentData.foodAccuracy[selectedOutlet] || 0).toFixed(2)}%` : `${data.summary.avgFoodAccuracy}%`,
            target: 85,
            performance: selectedOutlet !== null ? currentData.foodAccuracy[selectedOutlet] : parseFloat(data.summary.avgFoodAccuracy)
          },
          { 
            title: 'KITCHEN PREP TIME', 
            value: selectedOutlet !== null ? `${(currentData.kitchenPrepTime[selectedOutlet] || 0).toFixed(1)}min` : `${data.summary.avgKitchenPrepTime}min`,
            target: 4,
            performance: selectedOutlet !== null ? currentData.kitchenPrepTime[selectedOutlet] : parseFloat(data.summary.avgKitchenPrepTime),
            reverse: true // Lower is better
          }
        ].map((metric, i) => (
          <div key={i} className="stat-card" style={{
            border: metric.target && (
              metric.reverse ? metric.performance > metric.target : metric.performance < metric.target
            ) ? '2px solid #ef4444' : '1px solid var(--border-light)'
          }}>
            <div className="stat-number" style={{
              color: metric.target && (
                metric.reverse ? metric.performance > metric.target : metric.performance < metric.target
              ) ? '#ef4444' : 'var(--text-primary)'
            }}>
              {metric.value}
            </div>
            <div className="stat-label">{metric.title}</div>
            {metric.trend && (
              <div style={{
                fontSize: '0.85rem',
                fontWeight: '600',
                letterSpacing: '0.5px',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                color: parseFloat(metric.trend) > 0 ? '#10b981' : '#ef4444',
                marginTop: '8px'
              }}>
                {parseFloat(metric.trend) > 0 ? '↑' : '↓'} {Math.abs(metric.trend).toFixed(2)}%
              </div>
            )}
            {metric.target && (
              <div style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                marginTop: '4px'
              }}>
                TARGET: {metric.reverse ? '<' : '>'}{metric.target}{metric.title.includes('TIME') ? 'min' : '%'}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Outlet Detail Modal */}
      {selectedOutlet !== null && data.outlets[selectedOutlet] && !minimized && (
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
                {data.outlets[selectedOutlet].toUpperCase()} - AI ANALYSIS ({selectedPeriod.toUpperCase()})
              </h3>
              
              {/* Performance Category */}
              <div style={{
                padding: '15px',
                borderRadius: '10px',
                marginBottom: '20px',
                background: getPerformanceCategory(
                  currentData.m2o[selectedOutlet], 
                  currentData.m2oTrend[selectedOutlet], 
                  currentData.foodAccuracy[selectedOutlet],
                  currentData.onlinePercent[selectedOutlet]
                ) === 'EXCELLENT' ? 'rgba(16, 185, 129, 0.2)' :
                getPerformanceCategory(
                  currentData.m2o[selectedOutlet], 
                  currentData.m2oTrend[selectedOutlet], 
                  currentData.foodAccuracy[selectedOutlet],
                  currentData.onlinePercent[selectedOutlet]
                ) === 'GOOD' ? 'rgba(59, 130, 246, 0.2)' : 
                getPerformanceCategory(
                  currentData.m2o[selectedOutlet], 
                  currentData.m2oTrend[selectedOutlet], 
                  currentData.foodAccuracy[selectedOutlet],
                  currentData.onlinePercent[selectedOutlet]
                ) === 'AVERAGE' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)'
              }}>
                <p style={{
                  margin: 0,
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                  fontSize: '1rem',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '1px'
                }}>
                  AI CATEGORY: {getPerformanceCategory(
                    currentData.m2o[selectedOutlet], 
                    currentData.m2oTrend[selectedOutlet], 
                    currentData.foodAccuracy[selectedOutlet],
                    currentData.onlinePercent[selectedOutlet]
                  )}
                </p>
              </div>

              <div style={{
                display: 'grid',
                gap: '12px',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                fontSize: '0.9rem'
              }}>
                <p><strong style={{ color: 'var(--text-primary)' }}>M2O:</strong> <span style={{ color: 'var(--text-secondary)' }}>{(currentData.m2o[selectedOutlet] || 0).toFixed(2)}%</span></p>
                <p><strong style={{ color: 'var(--text-primary)' }}>M2O TREND:</strong> <span style={{ color: (currentData.m2oTrend[selectedOutlet] || 0) > 0 ? '#10b981' : '#ef4444' }}>
                  {(currentData.m2oTrend[selectedOutlet] || 0) > 0 ? '↑' : '↓'} {Math.abs(currentData.m2oTrend[selectedOutlet] || 0).toFixed(2)}%
                </span></p>
                <p><strong style={{ color: 'var(--text-primary)' }}>ONLINE %:</strong> <span style={{ color: 'var(--text-secondary)' }}>{(currentData.onlinePercent[selectedOutlet] || 0).toFixed(2)}%</span></p>
                <p><strong style={{ color: 'var(--text-primary)' }}>FOOD ACCURACY:</strong> <span style={{ color: 'var(--text-secondary)' }}>{(currentData.foodAccuracy[selectedOutlet] || 0).toFixed(2)}%</span></p>
                <p><strong style={{ color: 'var(--text-primary)' }}>DELAYED ORDERS:</strong> <span style={{ color: 'var(--text-secondary)' }}>{(currentData.delayedOrders[selectedOutlet] || 0).toFixed(2)}%</span></p>
                <p><strong style={{ color: 'var(--text-primary)' }}>KITCHEN PREP TIME:</strong> <span style={{ color: 'var(--text-secondary)' }}>{(currentData.kitchenPrepTime[selectedOutlet] || 0).toFixed(1)} min</span></p>
                <p><strong style={{ color: 'var(--text-primary)' }}>NEW CUSTOMERS:</strong> <span style={{ color: 'var(--text-secondary)' }}>{(currentData.newCustomers[selectedOutlet] || 0).toFixed(2)}%</span></p>
                <p><strong style={{ color: 'var(--text-primary)' }}>REPEAT CUSTOMERS:</strong> <span style={{ color: 'var(--text-secondary)' }}>{(currentData.repeatCustomers[selectedOutlet] || 0).toFixed(2)}%</span></p>
                <p><strong style={{ color: 'var(--text-primary)' }}>DORMANT CUSTOMERS:</strong> <span style={{ color: 'var(--text-secondary)' }}>{(currentData.dormantCustomers[selectedOutlet] || 0).toFixed(2)}%</span></p>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '25px' }}>
                <button onClick={minimizeModal} className="responses-btn">
                  MINIMIZE
                </button>
                <button onClick={() => analyzeOutlet(selectedOutlet)} className="refresh-btn">
                  RE-ANALYZE WITH AI
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Charts Grid */}
      <div className="submissions-list">
        {/* M2O Performance */}
        <div className="submission-card">
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                M2O PERFORMANCE {selectedOutlet !== null ? `FOR ${data.outlets[selectedOutlet].toUpperCase()}` : 'BY OUTLET'}
              </h3>
            </div>
          </div>
          <div className="responses-section">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={m2oChartData} onClick={selectedOutlet === null ? handleOutletClick : null}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                <XAxis dataKey="outlet" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'var(--surface-dark)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '10px',
                    color: 'var(--text-primary)'
                  }}
                />
                <Bar 
                  dataKey="m2o" 
                  fill="#ff6b6b" 
                  radius={[4, 4, 0, 0]}
                  label={{ position: 'top', fill: 'var(--text-primary)', fontSize: 11, fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}
                />
                <ReferenceLine y={20} stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" label={{ value: "Target: 20%", position: "topRight" }} />
                <ReferenceLine y={15} stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" label={{ value: "Warning: 15%", position: "topRight" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Customer Segmentation */}
        <div className="submission-card">
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                CUSTOMER SEGMENTATION {selectedOutlet !== null ? `FOR ${data.outlets[selectedOutlet].toUpperCase()}` : '(AVERAGE)'}
              </h3>
            </div>
          </div>
          <div className="responses-section">
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={customerData}
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}%`}
                  labelLine={false}
                >
                  {customerData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'var(--surface-dark)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '10px',
                    color: 'var(--text-primary)'
                  }}
                  formatter={(value, name) => [`${value}%`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Market Share Trend */}
        <div className="submission-card">
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                MARKET SHARE TREND {selectedOutlet !== null ? `FOR ${data.outlets[selectedOutlet].toUpperCase()}` : 'BY OUTLET'}
              </h3>
            </div>
          </div>
          <div className="responses-section">
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={performanceData} onClick={selectedOutlet === null ? handleOutletClick : null}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                <XAxis dataKey="outlet" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'var(--surface-dark)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '10px',
                    color: 'var(--text-primary)'
                  }}
                />
                <Legend wrapperStyle={{ color: 'var(--text-secondary)', fontSize: '12px' }} />
                <Line type="monotone" dataKey="marketShareTrend" stroke="#4ecdc4" strokeWidth={3} name="Market Share Trend %" />
                <ReferenceLine y={0} stroke="#666" strokeDasharray="2 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Multi-Metric Performance */}
        <div className="submission-card">
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                PERFORMANCE METRICS {selectedOutlet !== null ? `FOR ${data.outlets[selectedOutlet].toUpperCase()}` : 'BY OUTLET'}
              </h3>
            </div>
          </div>
          <div className="responses-section">
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={performanceData} onClick={selectedOutlet === null ? handleOutletClick : null}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                <XAxis dataKey="outlet" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
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
      </div>

      {/* Enhanced Performance Table */}
      <div className="submission-card">
        <div className="submission-header">
          <div className="submission-info">
            <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
              OUTLET PERFORMANCE ANALYSIS WITH AI ALERTS ({selectedPeriod.toUpperCase()})
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
                    'M2O %',
                    'M2O TREND',
                    'MARKET SHARE TREND',
                    'ONLINE %',
                    'FOOD ACCURACY %',
                    'DELAYED ORDERS %',
                    'KITCHEN PREP TIME',
                    'AI ALERT',
                    'ACTIONS'
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
                {data.outlets.map((outlet, i) => {
                  const category = getPerformanceCategory(
                    currentData.m2o[i], 
                    currentData.m2oTrend[i], 
                    currentData.foodAccuracy[i],
                    currentData.onlinePercent[i]
                  );
                  const isBottomThree = bottomThreeOutlets.some(bottom => bottom.index === i);
                  const hasAlerts = currentData.onlinePercent[i] < 98 || 
                                   currentData.foodAccuracy[i] < 85 || 
                                   currentData.kitchenPrepTime[i] > 4;
                  
                  return (
                    <tr 
                      key={i} 
                      style={{ 
                        borderBottom: '1px solid var(--border-light)',
                        cursor: 'pointer',
                        transition: 'var(--transition)',
                        background: selectedOutlet === i ? 'var(--surface-light)' : 
                                   isBottomThree ? 'rgba(239, 68, 68, 0.1)' :
                                   hasAlerts ? 'rgba(245, 158, 11, 0.05)' : 'transparent'
                      }}
                      onClick={() => { setSelectedOutlet(i); setMinimized(false); analyzeOutlet(i); }}
                    >
                      <td style={{ 
                        padding: '18px', 
                        fontWeight: '600', 
                        color: isBottomThree ? '#ef4444' : 'var(--text-primary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" 
                      }}>
                        {outlet.toUpperCase()}
                        {isBottomThree && <span style={{ color: '#ef4444', fontSize: '0.7rem', marginLeft: '5px' }}>⚠ BOTTOM 3</span>}
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: currentData.m2o[i] > 20 ? '#10b981' : currentData.m2o[i] > 15 ? 'var(--text-secondary)' : '#ef4444',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                        fontWeight: '600'
                      }}>
                        {(currentData.m2o[i] || 0).toFixed(2)}%
                      </td>
                      <td style={{ padding: '18px' }}>
                        <span style={{
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          color: (currentData.m2oTrend[i] || 0) > 0 ? '#10b981' : '#ef4444',
                          fontWeight: '600'
                        }}>
                          {(currentData.m2oTrend[i] || 0) > 0 ? '↑' : '↓'} {Math.abs(currentData.m2oTrend[i] || 0).toFixed(2)}%
                        </span>
                      </td>
                      <td style={{ padding: '18px' }}>
                        <span style={{
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          color: (currentData.m2oTrend[i] || 0) > 0 ? '#10b981' : '#ef4444',
                          fontWeight: '600'
                        }}>
                          {(currentData.m2oTrend[i] || 0) > 0 ? '↗' : '↘'} {Math.abs(currentData.m2oTrend[i] || 0).toFixed(1)}%
                        </span>
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: currentData.onlinePercent[i] < 98 ? '#ef4444' : '#10b981',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                        fontWeight: '600'
                      }}>
                        {(currentData.onlinePercent[i] || 0).toFixed(2)}%
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: currentData.foodAccuracy[i] < 85 ? '#ef4444' : currentData.foodAccuracy[i] > 95 ? '#10b981' : 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                        fontWeight: '600'
                      }}>
                        {(currentData.foodAccuracy[i] || 0).toFixed(2)}%
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        {(currentData.delayedOrders[i] || 0).toFixed(2)}%
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: currentData.kitchenPrepTime[i] > 4 ? '#ef4444' : '#10b981',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                        fontWeight: '600'
                      }}>
                        {(currentData.kitchenPrepTime[i] || 0).toFixed(1)}min
                      </td>
                      <td style={{ padding: '18px' }}>
                        <span style={{
                          padding: '6px 12px',
                          borderRadius: '15px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          background: hasAlerts ? 'rgba(239, 68, 68, 0.2)' : 
                                     category === 'EXCELLENT' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                          color: hasAlerts ? '#ef4444' :
                                category === 'EXCELLENT' ? '#10b981' : '#3b82f6'
                        }}>
                          {hasAlerts ? 'CRITICAL' : category === 'NEEDS URGENT ATTENTION' ? 'URGENT' : 'OK'}
                        </span>
                      </td>
                      <td style={{ padding: '18px' }}>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            analyzeOutlet(i);
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                            background: hasAlerts ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                            color: hasAlerts ? '#ef4444' : '#10b981',
                            border: `1px solid ${hasAlerts ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                            cursor: 'pointer'
                          }}
                        >
                          {hasAlerts ? 'URGENT ANALYSIS' : 'AI ANALYZE'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bottom Three Outlets Analysis */}
      <div className="submission-card">
        <div className="submission-header">
          <div className="submission-info">
            <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
              BOTTOM THREE OUTLETS - IMMEDIATE INTERVENTION REQUIRED ({selectedPeriod.toUpperCase()})
            </h3>
          </div>
        </div>
        <div className="responses-section">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
            gap: '25px'
          }}>
            {bottomThreeOutlets.map((outlet, index) => (
              <div key={outlet.index} style={{
                padding: '25px',
                borderRadius: '15px',
                background: 'rgba(239, 68, 68, 0.05)',
                border: '2px solid rgba(239, 68, 68, 0.3)',
                borderLeft: '6px solid #ef4444'
              }}>
                <h4 style={{
                  margin: '0 0 15px 0',
                  color: '#ef4444',
                  fontSize: '1.2rem',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                }}>
                  #{index + 1} PRIORITY: {outlet.outlet.toUpperCase()}
                </h4>
                
                <div style={{
                  display: 'grid',
                  gap: '10px',
                  marginBottom: '15px',
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                  fontSize: '0.9rem'
                }}>
                  <p><strong>M2O:</strong> <span style={{color: '#ef4444'}}>{outlet.m2o.toFixed(2)}%</span></p>
                  <p><strong>Online:</strong> <span style={{color: currentData.onlinePercent[outlet.index] < 98 ? '#ef4444' : 'var(--text-secondary)'}}>{currentData.onlinePercent[outlet.index].toFixed(1)}%</span></p>
                  <p><strong>Food Accuracy:</strong> <span style={{color: currentData.foodAccuracy[outlet.index] < 85 ? '#ef4444' : 'var(--text-secondary)'}}>{currentData.foodAccuracy[outlet.index].toFixed(1)}%</span></p>
                  <p><strong>Kitchen Prep:</strong> <span style={{color: currentData.kitchenPrepTime[outlet.index] > 4 ? '#ef4444' : 'var(--text-secondary)'}}>{currentData.kitchenPrepTime[outlet.index].toFixed(1)}min</span></p>
                </div>

                <div style={{
                  display: 'flex',
                  gap: '10px',
                  flexWrap: 'wrap'
                }}>
                  {currentData.onlinePercent[outlet.index] < 98 && (
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '0.7rem',
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: '#ef4444',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                    }}>
                      ONLINE LOW
                    </span>
                  )}
                  {currentData.foodAccuracy[outlet.index] < 85 && (
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '0.7rem',
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: '#ef4444',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                    }}>
                      ACCURACY CRITICAL
                    </span>
                  )}
                  {currentData.kitchenPrepTime[outlet.index] > 4 && (
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '0.7rem',
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: '#ef4444',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                    }}>
                      KITCHEN SLOW
                    </span>
                  )}
                </div>

                <button 
                  onClick={() => { setSelectedOutlet(outlet.index); analyzeOutlet(outlet.index); }}
                  style={{
                    marginTop: '15px',
                    padding: '10px 15px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    cursor: 'pointer'
                  }}
                >
                  URGENT AI ANALYSIS
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status and Update Info */}
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
            LAST UPDATED: {lastUpdate.toUpperCase()} • AI INSIGHTS: {aiInsights ? 'ACTIVE' : 'GENERATING...'} • GOOGLE SHEETS FILE: 1XmKondedSs_c6PZflanfB8OFUsGxVoqi5pUPvscT8cs
          </p>
        </div>
      )}

      {/* Minimized Modal Indicator */}
      {selectedOutlet !== null && minimized && (
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
            {data.outlets[selectedOutlet].toUpperCase()} AI ANALYSIS
          </span>
        </div>
      )}
    </div>
  );
};

export default SwiggyDashboard;