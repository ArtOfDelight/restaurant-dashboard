import React, { useState, useEffect } from 'react';
import axios from 'axios';
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

  // Fetch data with real API calls
  const fetchData = async (period) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await axios.get(`${API_URL}/api/swiggy-dashboard-data`, {
        params: { period }
      });
      
      if (response.data.success) {
        const apiData = response.data.data;
        
        const dashboardData = {
          outlets: apiData.outlets,
          currentData: {
            m2o: apiData.m2o,
            m2oTrend: apiData.m2oTrend,
            newCustomers: apiData.newCustomers,
            newCustomerTrend: apiData.newCustomerTrend,
            repeatCustomers: apiData.repeatCustomers,
            repeatCustomerTrend: apiData.repeatCustomerTrend,
            dormantCustomers: apiData.dormantCustomerTrend,
            dormantCustomerTrend: apiData.dormantCustomers,
            totalCustomers: apiData.totalCustomers,
            totalCustomerTrend: apiData.totalCustomerTrend,
            kitchenPrepTime: apiData.kitchenPrepTime,
            foodAccuracy: apiData.foodAccuracy,
            delayedOrders: apiData.delayedOrders,
            adOrders: apiData.adOrders,
            adOrdersTrend: apiData.adOrdersTrend,
            adSpend: apiData.adSpend,
            adM2o: apiData.adM2o,
            adM2oTrend: apiData.adM2oTrend,
            organicM2o: apiData.organicM2o,
            organicM2oTrend: apiData.organicM2oTrend,
            onlinePercent: apiData.onlinePercent
          },
          summary: apiData.summary
        };
        
        setData(dashboardData);
        setLastUpdate(new Date().toLocaleString());
        
        if (response.data.aiEnabled) {
          generateAIInsights(dashboardData, period);
        }
        
      } else {
        throw new Error(response.data.error || 'Failed to fetch data');
      }
      
    } catch (err) {
      console.error('API Error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load data. Make sure backend is running.');
      
    } finally {
      setLoading(false);
    }
  };

  // Enhanced AI insights generation focusing on bottom 3 and flagged outlets
  const generateAIInsights = async (dashboardData, period) => {
    try {
      setLoadingAI(true);
      
      try {
        const response = await axios.post(`${API_URL}/api/swiggy-generate-insights`, {
          data: dashboardData,
          period: period,
          analysisType: 'comprehensive'
        });
        
        if (response.data.success) {
          const flaggedOutlets = identifyFlaggedOutlets(dashboardData);
          const bottomThree = getBottomThreeOutlets(dashboardData);
          
          setAiInsights({
            ...response.data.insights,
            flaggedOutlets: flaggedOutlets,
            bottomThreeOutlets: bottomThree
          });
          return;
        }
      } catch (apiError) {
        console.log('AI API not available, using fallback analysis');
      }
      
      const currentData = dashboardData.currentData;
      const flaggedOutlets = identifyFlaggedOutlets(dashboardData);
      const bottomThree = getBottomThreeOutlets(dashboardData);
      
      const insights = {
        keyFindings: [
          `Bottom 3 performers: ${bottomThree.map(o => o.outlet).join(', ')} require immediate intervention`,
          `${flaggedOutlets.length} outlets flagged for critical threshold violations`,
          `Average food accuracy: ${dashboardData.summary.avgFoodAccuracy}% - target should be 85%+`,
          `${bottomThree.filter(o => o.onlinePercent < 98).length} outlets in bottom 3 also have online presence issues`
        ],
        recommendations: [
          'Immediate intervention needed for bottom 3 M2O performers',
          'Focus on food accuracy improvements for outlets below 85%',
          'Optimize kitchen workflows for outlets with prep time > 4 minutes',
          'Enhanced online presence strategy for flagged outlets'
        ],
        bottomThreeOutlets: bottomThree,
        flaggedOutlets: flaggedOutlets,
        confidence: 0.75,
        generatedAt: new Date().toISOString(),
        source: 'fallback-analysis'
      };
      
      setAiInsights(insights);
      
    } catch (err) {
      console.error('AI insights generation failed:', err);
    } finally {
      setLoadingAI(false);
    }
  };

  // Identify outlets that need flagging based on criteria
  const identifyFlaggedOutlets = (data) => {
    const flagged = [];
    const currentData = data.currentData;
    data.outlets.forEach((outlet, i) => {
      const issues = [];
      if (currentData.onlinePercent[i] < 98) issues.push('Online < 98%');
      if (currentData.foodAccuracy[i] < 85) issues.push('Food Accuracy < 85%');
      if (currentData.kitchenPrepTime[i] > 4) issues.push('Kitchen Prep > 4min');
      
      if (issues.length > 0) {
        flagged.push({
          outlet: outlet,
          index: i,
          issues: issues,
          m2o: currentData.m2o[i],
          onlinePercent: currentData.onlinePercent[i],
          foodAccuracy: currentData.foodAccuracy[i],
          kitchenPrepTime: currentData.kitchenPrepTime[i]
        });
      }
    });
    return flagged;
  };

  // Get bottom 3 outlets based on M2O performance
  const getBottomThreeOutlets = (data) => {
    const currentData = data.currentData;
    const outletPerformance = data.outlets.map((outlet, i) => ({
      outlet: outlet,
      index: i,
      m2o: currentData.m2o[i],
      m2oTrend: currentData.m2oTrend[i],
      onlinePercent: currentData.onlinePercent[i],
      foodAccuracy: currentData.foodAccuracy[i],
      kitchenPrepTime: currentData.kitchenPrepTime[i]
    }));
    
    return outletPerformance
      .sort((a, b) => a.m2o - b.m2o)
      .slice(0, 3);
  };

  // Get top 3 outlets based on M2O performance
  const getTopThreeOutlets = (data) => {
    const currentData = data.currentData;
    const outletPerformance = data.outlets.map((outlet, i) => ({
      outlet: outlet,
      index: i,
      m2o: currentData.m2o[i],
      m2oTrend: currentData.m2oTrend[i],
      onlinePercent: currentData.onlinePercent[i],
      foodAccuracy: currentData.foodAccuracy[i],
      kitchenPrepTime: currentData.kitchenPrepTime[i]
    }));
    
    return outletPerformance
      .sort((a, b) => b.m2o - a.m2o)
      .slice(0, 3);
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
      
      try {
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
          return;
        }
      } catch (apiError) {
        console.log('Outlet analysis API not available, using fallback');
      }
      
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

  const handlePeriodChange = (period) => {
    setSelectedPeriod(period);
    setSelectedOutlet(null);
    setMinimized(false);
    setShowAIPanel(false);
    fetchData(period);
  };

  const clearOutletSelection = () => {
    setSelectedOutlet(null);
    setMinimized(false);
    setShowAIPanel(false);
  };

  const minimizeModal = () => {
    setMinimized(true);
  };

  const restoreModal = () => {
    setMinimized(false);
  };

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

  // Customer segmentation data - Calculate absolute numbers from percentages and totals
  const customerData = selectedOutlet !== null
    ? [
        { 
          name: 'New Customers', 
          value: Math.round((currentData.newCustomers[selectedOutlet] / 100) * (currentData.totalCustomers[selectedOutlet] || 0)),
          percentage: parseFloat((currentData.newCustomers[selectedOutlet] || 0).toFixed(1))
        },
        { 
          name: 'Repeat Customers', 
          value: Math.round((currentData.repeatCustomers[selectedOutlet] / 100) * (currentData.totalCustomers[selectedOutlet] || 0)),
          percentage: parseFloat((currentData.repeatCustomers[selectedOutlet] || 0).toFixed(1))
        },
        { 
          name: 'Dormant Customers', 
          value: Math.round((currentData.dormantCustomers[selectedOutlet] / 100) * (currentData.totalCustomers[selectedOutlet] || 0)),
          percentage: parseFloat((currentData.dormantCustomers[selectedOutlet] || 0).toFixed(1))
        }
      ]
    : (() => {
        // Calculate total absolute numbers across all outlets
        let totalNewCustomers = 0;
        let totalRepeatCustomers = 0;
        let totalDormantCustomers = 0;
        let grandTotalCustomers = 0;
        
        for (let i = 0; i < data.outlets.length; i++) {
          const outletTotal = currentData.totalCustomers[i] || 0;
          totalNewCustomers += (currentData.newCustomers[i] / 100) * outletTotal;
          totalRepeatCustomers += (currentData.repeatCustomers[i] / 100) * outletTotal;
          totalDormantCustomers += (currentData.dormantCustomers[i] / 100) * outletTotal;
          grandTotalCustomers += outletTotal;
        }
        
        return [
          { 
            name: 'New Customers', 
            value: Math.round(totalNewCustomers),
            percentage: grandTotalCustomers > 0 ? parseFloat((totalNewCustomers / grandTotalCustomers * 100).toFixed(1)) : 0
          },
          { 
            name: 'Repeat Customers', 
            value: Math.round(totalRepeatCustomers),
            percentage: grandTotalCustomers > 0 ? parseFloat((totalRepeatCustomers / grandTotalCustomers * 100).toFixed(1)) : 0
          },
          { 
            name: 'Dormant Customers', 
            value: Math.round(totalDormantCustomers),
            percentage: grandTotalCustomers > 0 ? parseFloat((totalDormantCustomers / grandTotalCustomers * 100).toFixed(1)) : 0
          }
        ];
      })();

  // Performance data with market share trend
  const performanceData = selectedOutlet !== null
    ? [{
        outlet: data.outlets[selectedOutlet],
        online: currentData.onlinePercent[selectedOutlet],
        accuracy: currentData.foodAccuracy[selectedOutlet],
        delayed: currentData.delayedOrders[selectedOutlet]
      }]
    : data.outlets.map((outlet, i) => ({
        outlet,
        online: currentData.onlinePercent[i],
        accuracy: currentData.foodAccuracy[i],
        delayed: currentData.delayedOrders[i]
      }));

  const COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1'];

  // AI-powered performance categorization
  const getPerformanceCategory = (m2o, accuracy, onlinePercent, dormant) => {
    if (m2o > 20 && dormant < 20 && accuracy > 95 && onlinePercent > 98) return 'EXCELLENT';
    if (m2o > 18 && dormant < 30 && accuracy > 90 && onlinePercent > 95) return 'GOOD';
    if (m2o > 15 && dormant < 40 && onlinePercent > 90) return 'AVERAGE';
    return 'NEEDS URGENT ATTENTION';
  };

  // Top and bottom performers
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
            SWIGGY DB
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
            value={selectedOutlet !== null ? selectedOutlet : ''}
            onChange={(e) => {
              const index = e.target.value === '' ? null : parseInt(e.target.value);
              setSelectedOutlet(index);
              setMinimized(false);
              if (index !== null) {
                analyzeOutlet(index);
              }
            }}
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
            {data?.outlets.map((outlet, index) => (
              <option key={index} value={index}>{outlet.toUpperCase()}</option>
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

      {/* AI Insights Panel - continues in next message due to length */}
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
                      Food Accuracy: {outlet.foodAccuracy.toFixed(2)}% | Online: {outlet.onlinePercent.toFixed(2)}% | Kitchen: {outlet.kitchenPrepTime.toFixed(1)}min
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
                      M2O: {outlet.m2o.toFixed(2)}% | Food Accuracy: {outlet.foodAccuracy.toFixed(2)}% | Online: {outlet.onlinePercent.toFixed(2)}% | Kitchen: {outlet.kitchenPrepTime.toFixed(1)}min
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

      {/* Top 3 and Bottom 3 Outlets Display - continues... */}
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
                  Food Accuracy: {outlet.foodAccuracy.toFixed(2)}% | Online: {outlet.onlinePercent.toFixed(2)}% | Kitchen: {outlet.kitchenPrepTime.toFixed(1)}min
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
                  Food Accuracy: {outlet.foodAccuracy.toFixed(2)}% | Online: {outlet.onlinePercent.toFixed(2)}% | Kitchen: {outlet.kitchenPrepTime.toFixed(1)}min
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
                  currentData.m2o[selectedOutlet], 
                  currentData.foodAccuracy[selectedOutlet],
                  currentData.onlinePercent[selectedOutlet],
                  currentData.dormantCustomers[selectedOutlet]
                ) === 'EXCELLENT' ? 'rgba(16, 185, 129, 0.2)' :
                getPerformanceCategory(
                  currentData.m2o[selectedOutlet], 
                  currentData.foodAccuracy[selectedOutlet],
                  currentData.onlinePercent[selectedOutlet],
                  currentData.dormantCustomers[selectedOutlet]
                ) === 'GOOD' ? 'rgba(59, 130, 246, 0.2)' : 
                getPerformanceCategory(
                  currentData.m2o[selectedOutlet], 
                  currentData.foodAccuracy[selectedOutlet],
                  currentData.onlinePercent[selectedOutlet],
                  currentData.dormantCustomers[selectedOutlet]
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
                    currentData.foodAccuracy[selectedOutlet],
                    currentData.onlinePercent[selectedOutlet],
                    currentData.dormantCustomers[selectedOutlet]
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
                M2O PERFORMANCE VS TARGET {selectedOutlet !== null ? `FOR ${data.outlets[selectedOutlet].toUpperCase()}` : 'BY OUTLET'}
              </h3>
            </div>
          </div>
          <div className="responses-section">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={m2oChartData}>
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
                CUSTOMER SEGMENTATION {selectedOutlet !== null ? `FOR ${data.outlets[selectedOutlet].toUpperCase()}` : '(TOTAL ACROSS ALL OUTLETS)'}
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
                  label={({ name, value, percentage }) => `${name}: ${value} (${percentage}%)`}
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
                  formatter={(value, name, props) => [
                    `${value} customers (${props.payload.percentage}%)`, 
                    name
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '20px',
              marginTop: '15px',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              fontSize: '0.9rem'
            }}>
              {customerData.map((segment, index) => (
                <div key={index} style={{ textAlign: 'center' }}>
                  <div style={{ 
                    width: '12px', 
                    height: '12px', 
                    backgroundColor: COLORS[index], 
                    margin: '0 auto 5px',
                    borderRadius: '2px'
                  }}></div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: '600' }}>
                    {segment.value}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    {segment.name} ({segment.percentage}%)
                  </div>
                </div>
              ))}
            </div>
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
              <LineChart data={performanceData}>
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
                    'ONLINE %',
                    'FOOD ACCURACY %',
                    'DELAYED ORDERS %',
                    'KITCHEN PREP TIME',
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
                  const category = getPerformanceCategory(
                    currentData.m2o[i], 
                    currentData.foodAccuracy[i],
                    currentData.onlinePercent[i],
                    currentData.dormantCustomers[i]
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
                        color: currentData.delayedOrders[i] > 5 ? '#ef4444' : 'var(--text-secondary)',
                        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                        fontWeight: '600'
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
                        <div style={{ fontSize: '0.8rem', fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" }}>
                          <div>N: {(currentData.newCustomers[i] || 0).toFixed(1)}%</div>
                          <div>R: {(currentData.repeatCustomers[i] || 0).toFixed(1)}%</div>
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
                          background: hasAlerts ? 'rgba(239, 68, 68, 0.2)' : 
                                     category === 'EXCELLENT' ? 'rgba(16, 185, 129, 0.2)' : 
                                     category === 'GOOD' ? 'rgba(59, 130, 246, 0.2)' :
                                     category === 'AVERAGE' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: hasAlerts ? '#ef4444' :
                                category === 'EXCELLENT' ? '#10b981' :
                                category === 'GOOD' ? '#3b82f6' :
                                category === 'AVERAGE' ? '#f59e0b' : '#ef4444'
                        }}>
                          {hasAlerts ? 'CRITICAL' : category === 'NEEDS URGENT ATTENTION' ? 'URGENT' : category}
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

export default SwiggyDashboard;