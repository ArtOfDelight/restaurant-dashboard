import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine
} from 'recharts';

const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

const Dashboard = () => {
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

  // Fetch data with AI analysis
  const fetchData = async (period) => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/dashboard-data`, {
        params: { period }
      });
      
      const dashboardData = response.data.data;
      setData(dashboardData);
      setLastUpdate(new Date().toLocaleString());
      setError(null);
      
      // Automatically generate AI insights for new data
      generateAIInsights(dashboardData, period);
      
    } catch (err) {
      setError('Failed to load data. Make sure backend is running.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Enhanced AI insights generation focusing on bottom 3 and flagged outlets
  const generateAIInsights = async (dashboardData, period) => {
    try {
      setLoadingAI(true);
      const response = await axios.post(`${API_URL}/api/generate-insights`, {
        data: dashboardData,
        period: period,
        analysisType: 'bottom_three_focus'
      });
      
      if (response.data.success) {
        const flaggedOutlets = identifyFlaggedOutlets(dashboardData);
        const bottomThree = getBottomThreeOutlets(dashboardData);
        
        setAiInsights({
          ...response.data.insights,
          flaggedOutlets: flaggedOutlets,
          bottomThreeOutlets: bottomThree
        });
      }
    } catch (err) {
      console.error('AI insights generation failed:', err);
    } finally {
      setLoadingAI(false);
    }
  };

  // Identify outlets that need flagging based on criteria
  const identifyFlaggedOutlets = (data) => {
    const flagged = [];
    data.outlets.forEach((outlet, i) => {
      const issues = [];
      if (data.onlinePercent[i] < 98) issues.push('Online < 98%');
      if (data.foodAccuracy[i] < 85) issues.push('Food Accuracy < 85%');
      
      if (issues.length > 0) {
        flagged.push({
          outlet: outlet,
          index: i,
          issues: issues,
          m2o: data.m2o[i],
          onlinePercent: data.onlinePercent[i],
          foodAccuracy: data.foodAccuracy[i]
        });
      }
    });
    return flagged;
  };

  // Get bottom 3 outlets based on M2O performance
  const getBottomThreeOutlets = (data) => {
    const outletPerformance = data.outlets.map((outlet, i) => ({
      outlet: outlet,
      index: i,
      m2o: data.m2o[i],
      m2oTrend: data.m2oTrend[i],
      onlinePercent: data.onlinePercent[i],
      foodAccuracy: data.foodAccuracy[i]
    }));
    
    return outletPerformance
      .sort((a, b) => a.m2o - b.m2o)
      .slice(0, 3);
  };

  // Get top 3 outlets based on M2O performance
  const getTopThreeOutlets = (data) => {
    const outletPerformance = data.outlets.map((outlet, i) => ({
      outlet: outlet,
      index: i,
      m2o: data.m2o[i],
      m2oTrend: data.m2oTrend[i],
      onlinePercent: data.onlinePercent[i],
      foodAccuracy: data.foodAccuracy[i]
    }));
    
    return outletPerformance
      .sort((a, b) => b.m2o - a.m2o)
      .slice(0, 3);
  };

  // Generate specific outlet analysis
  const analyzeOutlet = async (outletIndex) => {
    if (!data || outletIndex === null) return;
    
    try {
      setLoadingAI(true);
      const outletData = {
        name: data.outlets[outletIndex],
        m2o: data.m2o[outletIndex],
        m2oTrend: data.m2oTrend[outletIndex],
        marketShare: data.marketShare[outletIndex],
        onlinePercent: data.onlinePercent[outletIndex],
        foodAccuracy: data.foodAccuracy[outletIndex],
        delayedOrders: data.delayedOrders[outletIndex],
        newUsers: data.newUsers[outletIndex],
        repeatUsers: data.repeatUsers[outletIndex],
        lapsedUsers: data.lapsedUsers[outletIndex]
      };
      
      const response = await axios.post(`${API_URL}/api/analyze-outlet`, {
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
      }
    } catch (err) {
      console.error('Outlet analysis failed:', err);
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
    setSelectedOutlet(null); // Reset outlet selection when period changes
    setMinimized(false);
    setShowAIPanel(false);
    fetchData(period);
  };

  // Handle outlet change from dropdown
  const handleOutletChange = (event) => {
    const index = data.outlets.indexOf(event.target.value);
    setSelectedOutlet(index);
    setMinimized(false);
    if (index !== null) {
      analyzeOutlet(index);
    }
  };

  // Handle outlet click from charts
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
          LOADING DASHBOARD WITH AI INSIGHTS...
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

  // Enhanced data preparations
  const m2oChartData = selectedOutlet !== null
    ? [{
        outlet: data.outlets[selectedOutlet],
        m2o: data.m2o[selectedOutlet],
        trend: data.m2oTrend[selectedOutlet]
      }]
    : data.outlets.map((outlet, i) => ({
        outlet,
        m2o: data.m2o[i],
        trend: data.m2oTrend[i]
      }));

  // Calculate estimated actual numbers (using a base of 1000 orders per outlet for estimation)
  const estimatedBaseOrders = 1000;
  
  const customerData = selectedOutlet !== null
    ? [
        { 
          name: 'New Users', 
          value: parseFloat((data.newUsers[selectedOutlet] || 0).toFixed(1)),
          actual: Math.round((data.newUsers[selectedOutlet] || 0) * estimatedBaseOrders / 100),
          trend: 0
        },
        { 
          name: 'Repeat Users', 
          value: parseFloat((data.repeatUsers[selectedOutlet] || 0).toFixed(1)),
          actual: Math.round((data.repeatUsers[selectedOutlet] || 0) * estimatedBaseOrders / 100),
          trend: 0
        },
        { 
          name: 'Lapsed Users', 
          value: parseFloat((data.lapsedUsers[selectedOutlet] || 0).toFixed(1)),
          actual: Math.round((data.lapsedUsers[selectedOutlet] || 0) * estimatedBaseOrders / 100),
          trend: 0
        }
      ]
    : [
        { 
          name: 'New Users', 
          value: parseFloat((data.newUsers.reduce((a, b) => a + b, 0) / (data.newUsers.length || 1)).toFixed(1)),
          actual: Math.round((data.newUsers.reduce((a, b) => a + b, 0) / (data.newUsers.length || 1)) * estimatedBaseOrders / 100),
          trend: 0
        },
        { 
          name: 'Repeat Users', 
          value: parseFloat((data.repeatUsers.reduce((a, b) => a + b, 0) / (data.repeatUsers.length || 1)).toFixed(1)),
          actual: Math.round((data.repeatUsers.reduce((a, b) => a + b, 0) / (data.repeatUsers.length || 1)) * estimatedBaseOrders / 100),
          trend: 0
        },
        { 
          name: 'Lapsed Users', 
          value: parseFloat((data.lapsedUsers.reduce((a, b) => a + b, 0) / (data.lapsedUsers.length || 1)).toFixed(1)),
          actual: Math.round((data.lapsedUsers.reduce((a, b) => a + b, 0) / (data.lapsedUsers.length || 1)) * estimatedBaseOrders / 100),
          trend: 0
        }
      ];

  const performanceData = selectedOutlet !== null
    ? [{
        outlet: data.outlets[selectedOutlet],
        online: data.onlinePercent[selectedOutlet],
        accuracy: data.foodAccuracy[selectedOutlet],
        delayed: data.delayedOrders[selectedOutlet]
      }]
    : data.outlets.map((outlet, i) => ({
        outlet,
        online: data.onlinePercent[i],
        accuracy: data.foodAccuracy[i],
        delayed: data.delayedOrders[i]
      }));

  const marketShareData = selectedOutlet !== null
    ? [{
        outlet: data.outlets[selectedOutlet],
        marketShare: data.marketShare[selectedOutlet]
      }]
    : data.outlets.map((outlet, i) => ({
        outlet,
        marketShare: data.marketShare[i]
      }));

  const COLORS = ['#ffffff', '#cccccc', '#888888'];

  const getPerformanceCategory = (m2o, trend, accuracy) => {
    if (m2o > 14 && trend > 0 && accuracy > 95) return 'EXCELLENT';
    if (m2o > 12 && accuracy > 90) return 'GOOD';
    if (m2o > 10) return 'AVERAGE';
    return 'NEEDS WORK';
  };

  const topThreeOutlets = data ? getTopThreeOutlets(data) : [];
  const bottomThreeOutlets = data ? getBottomThreeOutlets(data) : [];

  return (
    <div className="checklist-dashboard">
      {/* Header */}
      <div className="checklist-header">
        <div>
          <h1 style={{
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
          }}>
            ZOMATO DB
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
            <option value="28 Day">28 DAY DATA</option>
            <option value="7 Day">7 DAY DATA</option>
            <option value="1 Day">1 DAY DATA</option>
          </select>
          <select
            value={selectedOutlet !== null ? data.outlets[selectedOutlet] : ''}
            onChange={handleOutletChange}
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
            <option value="">ALL OUTLETS</option>
            {data.outlets.map((outlet, index) => (
              <option key={index} value={outlet}>
                {outlet.toUpperCase()}
              </option>
            ))}
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

      {/* AI Insights Panel with Bottom 3 and Flagged Outlets Focus */}
      {showAIPanel && aiInsights && (
        <div className="submission-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ 
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                color: '#10b981'
              }}>
                AI-POWERED INSIGHTS {aiInsights.focusOutlet ? `FOR ${aiInsights.focusOutlet.toUpperCase()}` : '(BOTTOM 3 & FLAGGED OUTLETS ANALYSIS)'}
              </h3>
            </div>
          </div>
          <div className="responses-section">
            {/* Bottom 3 Outlets Analysis */}
            {aiInsights.bottomThreeOutlets && (
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
                  BOTTOM 3 OUTLETS (M2O BASIS)
                </h4>
                {aiInsights.bottomThreeOutlets.map((outlet, index) => (
                  <div key={index} style={{
                    padding: '12px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '8px',
                    marginBottom: '10px'
                  }}>
                    <p style={{
                      margin: 0,
                      color: 'var(--text-primary)',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      fontSize: '0.9rem',
                      fontWeight: '600'
                    }}>
                      {index + 1}. {outlet.outlet.toUpperCase()}: {outlet.m2o.toFixed(2)}% M2O
                    </p>
                    <p style={{
                      margin: '5px 0 0 0',
                      color: 'var(--text-secondary)',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      fontSize: '0.8rem'
                    }}>
                      Food Accuracy: {outlet.foodAccuracy.toFixed(2)}% | Online: {outlet.onlinePercent.toFixed(2)}%
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Flagged Outlets Analysis */}
            {aiInsights.flaggedOutlets && aiInsights.flaggedOutlets.length > 0 && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.05)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                borderRadius: '15px',
                padding: '25px',
                marginBottom: '20px'
              }}>
                <h4 style={{
                  margin: '0 0 15px 0',
                  color: '#f59e0b',
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                  fontSize: '1rem',
                  textTransform: 'uppercase',
                  letterSpacing: '1px'
                }}>
                  FLAGGED OUTLETS (CRITICAL THRESHOLDS)
                </h4>
                {aiInsights.flaggedOutlets.map((outlet, index) => (
                  <div key={index} style={{
                    padding: '12px',
                    background: 'rgba(245, 158, 11, 0.1)',
                    borderRadius: '8px',
                    marginBottom: '10px'
                  }}>
                    <p style={{
                      margin: 0,
                      color: 'var(--text-primary)',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      fontSize: '0.9rem',
                      fontWeight: '600'
                    }}>
                      {outlet.outlet.toUpperCase()}: {outlet.issues.join(', ')}
                    </p>
                    <p style={{
                      margin: '5px 0 0 0',
                      color: 'var(--text-secondary)',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      fontSize: '0.8rem'
                    }}>
                      M2O: {outlet.m2o.toFixed(2)}% | Food Accuracy: {outlet.foodAccuracy.toFixed(2)}% | Online: {outlet.onlinePercent.toFixed(2)}%
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div style={{
              background: 'rgba(16, 185, 129, 0.05)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
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
                KEY FINDINGS
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
              padding: '25px'
            }}>
              <h4 style={{
                margin: '0 0 15px 0',
                color: 'var(--text-primary)',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                fontSize: '1rem',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                AI RECOMMENDATIONS
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
            
            {aiInsights.outletAnalysis && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.05)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                borderRadius: '15px',
                padding: '25px',
                marginTop: '20px'
              }}>
                <h4 style={{
                  margin: '0 0 15px 0',
                  color: 'var(--text-primary)',
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

      {/* Enhanced Performance Stats with Market Share Trend */}
      <div className="checklist-stats">
        {[
          { 
            title: 'AVERAGE M2O', 
            value: selectedOutlet !== null ? `${(data.m2o[selectedOutlet] || 0).toFixed(2)}%` : `${data.summary.avgM2O}%`, 
            trend: selectedOutlet !== null ? data.m2oTrend[selectedOutlet] : data.summary.avgM2OTrend,
            target: 15,
            performance: selectedOutlet !== null ? data.m2o[selectedOutlet] : parseFloat(data.summary.avgM2O)
          },
          { 
            title: 'MARKET SHARE', 
            value: selectedOutlet !== null ? `${(data.marketShare[selectedOutlet] || 0).toFixed(2)}%` : `${data.summary.avgMarketShare}%`,
            trend: selectedOutlet !== null ? (data.m2oTrend[selectedOutlet] || 0) * 0.1 : 0,
            performance: selectedOutlet !== null ? data.marketShare[selectedOutlet] : parseFloat(data.summary.avgMarketShare)
          },
          { 
            title: 'ONLINE RATE', 
            value: selectedOutlet !== null ? `${(data.onlinePercent[selectedOutlet] || 0).toFixed(2)}%` : `${data.summary.avgOnlinePercent}%`,
            performance: selectedOutlet !== null ? data.onlinePercent[selectedOutlet] : parseFloat(data.summary.avgOnlinePercent)
          },
          { 
            title: 'FOOD ACCURACY', 
            value: selectedOutlet !== null ? `${(data.foodAccuracy[selectedOutlet] || 0).toFixed(2)}%` : `${data.summary.avgFoodAccuracy}%`,
            target: 95,
            performance: selectedOutlet !== null ? data.foodAccuracy[selectedOutlet] : parseFloat(data.summary.avgFoodAccuracy)
          }
        ].map((metric, i) => (
          <div key={i} className="stat-card" style={{
            border: metric.target && metric.performance < metric.target ? '2px solid #ef4444' : '1px solid var(--border-light)'
          }}>
            <div className="stat-number" style={{
              color: metric.target && metric.performance < metric.target ? '#ef4444' : 'var(--text-primary)'
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
                TARGET: {metric.target}%
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Top 3 and Bottom 3 Outlets Display */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '25px', marginBottom: '30px' }}>
        {/* Bottom 3 Outlets */}
        <div className="submission-card" style={{ borderLeft: '4px solid #ef4444' }}>
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ 
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                color: '#ef4444'
              }}>
                BOTTOM 3 OUTLETS - NEEDS ATTENTION
              </h3>
            </div>
          </div>
          <div className="responses-section">
            {bottomThreeOutlets.map((outlet, index) => (
              <div key={index} style={{
                padding: '15px',
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '10px',
                marginBottom: '15px',
                cursor: 'pointer'
              }}
              onClick={() => { setSelectedOutlet(outlet.index); setMinimized(false); analyzeOutlet(outlet.index); }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px'
                }}>
                  <h4 style={{
                    margin: 0,
                    color: 'var(--text-primary)',
                    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                    fontSize: '1rem'
                  }}>
                    {index + 1}. {outlet.outlet.toUpperCase()}
                  </h4>
                  <span style={{
                    background: 'rgba(239, 68, 68, 0.2)',
                    color: '#ef4444',
                    padding: '4px 8px',
                    borderRadius: '12px',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                  }}>
                    {outlet.m2o.toFixed(2)}% M2O
                  </span>
                </div>
                <div style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                }}>
                  Food Accuracy: {outlet.foodAccuracy.toFixed(2)}% | Online: {outlet.onlinePercent.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top 3 Outlets */}
        <div className="submission-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ 
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                color: '#10b981'
              }}>
                TOP 3 OUTLETS - BEST PERFORMERS
              </h3>
            </div>
          </div>
          <div className="responses-section">
            {topThreeOutlets.map((outlet, index) => (
              <div key={index} style={{
                padding: '15px',
                background: 'rgba(16, 185, 129, 0.05)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                borderRadius: '10px',
                marginBottom: '15px',
                cursor: 'pointer'
              }}
              onClick={() => { setSelectedOutlet(outlet.index); setMinimized(false); analyzeOutlet(outlet.index); }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px'
                }}>
                  <h4 style={{
                    margin: 0,
                    color: 'var(--text-primary)',
                    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                    fontSize: '1rem'
                  }}>
                    {index + 1}. {outlet.outlet.toUpperCase()}
                  </h4>
                  <span style={{
                    background: 'rgba(16, 185, 129, 0.2)',
                    color: '#10b981',
                    padding: '4px 8px',
                    borderRadius: '12px',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                  }}>
                    {outlet.m2o.toFixed(2)}% M2O
                  </span>
                </div>
                <div style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                }}>
                  Food Accuracy: {outlet.foodAccuracy.toFixed(2)}% | Online: {outlet.onlinePercent.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>
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
                  data.m2o[selectedOutlet], 
                  data.m2oTrend[selectedOutlet], 
                  data.foodAccuracy[selectedOutlet]
                ) === 'EXCELLENT' ? 'rgba(16, 185, 129, 0.2)' :
                getPerformanceCategory(
                  data.m2o[selectedOutlet], 
                  data.m2oTrend[selectedOutlet], 
                  data.foodAccuracy[selectedOutlet]
                ) === 'GOOD' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(239, 68, 68, 0.2)'
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
                    data.m2o[selectedOutlet], 
                    data.m2oTrend[selectedOutlet], 
                    data.foodAccuracy[selectedOutlet]
                  )}
                </p>
              </div>

              <div style={{
                display: 'grid',
                gap: '12px',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                fontSize: '0.9rem'
              }}>
                <p><strong style={{ color: 'var(--text-primary)' }}>M2O:</strong> <span style={{ color: 'var(--text-secondary)' }}>{(data.m2o[selectedOutlet] || 0).toFixed(2)}%</span></p>
                <p><strong style={{ color: 'var(--text-primary)' }}>M2O TREND:</strong> <span style={{ color: (data.m2oTrend[selectedOutlet] || 0) > 0 ? '#10b981' : '#ef4444' }}>
                  {(data.m2oTrend[selectedOutlet] || 0) > 0 ? '↑' : '↓'} {Math.abs(data.m2oTrend[selectedOutlet] || 0).toFixed(2)}%
                </span></p>
                <p><strong style={{ color: 'var(--text-primary)' }}>MARKET SHARE:</strong> <span style={{ color: 'var(--text-secondary)' }}>{(data.marketShare[selectedOutlet] || 0).toFixed(2)}%</span></p>
                <p><strong style={{ color: 'var(--text-primary)' }}>ONLINE %:</strong> <span style={{ color: 'var(--text-secondary)' }}>{(data.onlinePercent[selectedOutlet] || 0).toFixed(2)}%</span></p>
                <p><strong style={{ color: 'var(--text-primary)' }}>FOOD ACCURACY:</strong> <span style={{ color: 'var(--text-secondary)' }}>{(data.foodAccuracy[selectedOutlet] || 0).toFixed(2)}%</span></p>
                <p><strong style={{ color: 'var(--text-primary)' }}>DELAYED ORDERS:</strong> <span style={{ color: 'var(--text-secondary)' }}>{(data.delayedOrders[selectedOutlet] || 0).toFixed(2)}%</span></p>
                <p><strong style={{ color: 'var(--text-primary)' }}>NEW USERS:</strong> <span style={{ color: 'var(--text-secondary)' }}>{(data.newUsers[selectedOutlet] || 0).toFixed(2)}%</span></p>
                <p><strong style={{ color: 'var(--text-primary)' }}>REPEAT USERS:</strong> <span style={{ color: 'var(--text-secondary)' }}>{(data.repeatUsers[selectedOutlet] || 0).toFixed(2)}%</span></p>
                <p><strong style={{ color: 'var(--text-primary)' }}>LAPSED USERS:</strong> <span style={{ color: 'var(--text-secondary)' }}>{(data.lapsedUsers[selectedOutlet] || 0).toFixed(2)}%</span></p>
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

      {/* Enhanced Charts Grid (Radar Chart Removed) */}
      <div className="submissions-list">
        {/* M2O Performance with Target Line and Labels */}
        <div className="submission-card">
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                M2O PERFORMANCE VS TARGET {selectedOutlet !== null ? `FOR ${data.outlets[selectedOutlet].toUpperCase()}` : 'BY OUTLET'}
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
                  fill="#3b82f6" 
                  radius={[4, 4, 0, 0]}
                  label={{ position: 'top', fill: 'var(--text-primary)', fontSize: 11, fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}
                />
                <ReferenceLine y={15} stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" label={{ value: "Target: 15%", position: "topRight" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Customer Segmentation with Actual Numbers and Trends */}
        <div className="submission-card">
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                CUSTOMER SEGMENTATION WITH TRENDS {selectedOutlet !== null ? `FOR ${data.outlets[selectedOutlet].toUpperCase()}` : '(AVERAGE)'}
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
                  label={({ name, value, actual, trend }) => 
                    `${name}: ${actual} (${value}%) ${trend > 0 ? '↑' : trend < 0 ? '↓' : ''}`
                  }
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
                  formatter={(value, name, props) => [`${props.payload.actual} (${value}%)`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Market Share Bar Chart */}
        <div className="submission-card">
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                MARKET SHARE BY OUTLET {selectedOutlet !== null ? `FOR ${data.outlets[selectedOutlet].toUpperCase()}` : ''}
              </h3>
            </div>
          </div>
          <div className="responses-section">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={marketShareData} onClick={selectedOutlet === null ? handleOutletClick : null}>
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
                  dataKey="marketShare" 
                  fill="#10b981" 
                  radius={[4, 4, 0, 0]}
                  label={{ position: 'top', fill: 'var(--text-primary)', fontSize: 11, fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Multi-Metric Performance Chart */}
        <div className="submission-card">
          <div className="submission-header">
            <div className="submission-info">
              <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                MULTI-METRIC PERFORMANCE {selectedOutlet !== null ? `FOR ${data.outlets[selectedOutlet].toUpperCase()}` : 'BY OUTLET'}
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
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Enhanced Performance Table with Market Share Trend and Delayed Orders */}
      <div className="submission-card">
        <div className="submission-header">
          <div className="submission-info">
            <h3 style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
              AI-ENHANCED OUTLET PERFORMANCE ANALYSIS ({selectedPeriod.toUpperCase()})
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
                    'MARKET SHARE %',
                    'MARKET SHARE TREND',
                    'ONLINE %',
                    'FOOD ACCURACY %',
                    'DELAYED ORDERS %',
                    'CUSTOMER MIX',
                    'AI CATEGORY',
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
                  const category = getPerformanceCategory(data.m2o[i], data.m2oTrend[i], data.foodAccuracy[i]);
                  const isUnderperforming = category === 'NEEDS WORK';
                  const marketShareTrend = (data.m2oTrend[i] || 0) * 0.1;
                  
                  return (
                    <tr 
                      key={i} 
                      style={{ 
                        borderBottom: '1px solid var(--border-light)',
                        cursor: 'pointer',
                        transition: 'var(--transition)',
                        background: selectedOutlet === i ? 'var(--surface-light)' : isUnderperforming ? 'rgba(239, 68, 68, 0.1)' : 'transparent'
                      }}
                      onClick={() => { setSelectedOutlet(i); setMinimized(false); analyzeOutlet(i); }}
                    >
                      <td style={{ 
                        padding: '18px', 
                        fontWeight: '600', 
                        color: isUnderperforming ? '#ef4444' : 'var(--text-primary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" 
                      }}>
                        {outlet.toUpperCase()}
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: data.m2o[i] > 14 ? '#10b981' : data.m2o[i] > 12 ? 'var(--text-secondary)' : '#ef4444',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                        fontWeight: '600'
                      }}>
                        {(data.m2o[i] || 0).toFixed(2)}%
                      </td>
                      <td style={{ padding: '18px' }}>
                        <span style={{
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          color: (data.m2oTrend[i] || 0) > 0 ? '#10b981' : '#ef4444',
                          fontWeight: '600'
                        }}>
                          {(data.m2oTrend[i] || 0) > 0 ? '↑' : '↓'} {Math.abs(data.m2oTrend[i] || 0).toFixed(2)}%
                        </span>
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        {(data.marketShare[i] || 0).toFixed(2)}%
                      </td>
                      <td style={{ padding: '18px' }}>
                        <span style={{
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          color: marketShareTrend > 0 ? '#10b981' : '#ef4444',
                          fontWeight: '600'
                        }}>
                          {marketShareTrend > 0 ? '↑' : '↓'} {Math.abs(marketShareTrend).toFixed(2)}%
                        </span>
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                      }}>
                        {(data.onlinePercent[i] || 0).toFixed(2)}%
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: data.foodAccuracy[i] > 95 ? '#10b981' : data.foodAccuracy[i] > 90 ? 'var(--text-secondary)' : '#ef4444',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                        fontWeight: '600'
                      }}>
                        {(data.foodAccuracy[i] || 0).toFixed(2)}%
                      </td>
                      <td style={{ 
                        padding: '18px',
                        color: data.delayedOrders[i] > 5 ? '#ef4444' : 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                        fontWeight: '600'
                      }}>
                        {(data.delayedOrders[i] || 0).toFixed(2)}%
                      </td>
                      <td style={{ padding: '18px' }}>
                        <div style={{ fontSize: '0.8rem', fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                          <div>N: {(data.newUsers[i] || 0).toFixed(1)}%</div>
                          <div>R: {(data.repeatUsers[i] || 0).toFixed(1)}%</div>
                        </div>
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
                          background: category === 'EXCELLENT' ? 'rgba(16, 185, 129, 0.2)' :
                                     category === 'GOOD' ? 'rgba(59, 130, 246, 0.2)' :
                                     category === 'AVERAGE' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: category === 'EXCELLENT' ? '#10b981' :
                                category === 'GOOD' ? '#3b82f6' :
                                category === 'AVERAGE' ? '#f59e0b' : '#ef4444'
                        }}>
                          {category}
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
                            background: 'rgba(16, 185, 129, 0.1)',
                            color: '#10b981',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            cursor: 'pointer'
                          }}
                        >
                          AI ANALYZE
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
            LAST UPDATED: {lastUpdate.toUpperCase()} • AI INSIGHTS: {aiInsights ? 'ACTIVE' : 'GENERATING...'}
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

export default Dashboard;