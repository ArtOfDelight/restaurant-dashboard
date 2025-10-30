import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ScatterChart, Scatter
} from 'recharts';

const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

const ProductAnalysisDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPlatform, setSelectedPlatform] = useState('All');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showMatchingDetails, setShowMatchingDetails] = useState(false);

  // Fetch product data using fetch API
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_URL}/api/product-analysis-data`);
      const result = await response.json();
      
      if (result.success) {
        setData(result.data);
        if (result.aiEnabled) {
          generateAIInsights(result.data);
        }
      } else {
        throw new Error(result.error || 'Failed to fetch data');
      }
      
    } catch (err) {
      console.error('API Error:', err);
      setError(err.message || 'Failed to load data. Make sure backend is running.');
    } finally {
      setLoading(false);
    }
  };

  // Generate AI insights for product analysis
  const generateAIInsights = async (productData) => {
    try {
      setLoadingAI(true);
      
      const response = await fetch(`${API_URL}/api/product-generate-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: productData,
          analysisType: 'comprehensive'
        })
      });
      
      const result = await response.json();
      if (result.success) {
        setAiInsights(result.insights);
      }
    } catch (error) {
      console.error('AI insights generation failed:', error);
    } finally {
      setLoadingAI(false);
    }
  };

  // Analyze specific product
  const analyzeProduct = async (productName) => {
    if (!data || !productName) return;
    
    try {
      setLoadingAI(true);
      
      const response = await fetch(`${API_URL}/api/analyze-product`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productName: productName,
          data: data
        })
      });
      
      const result = await response.json();
      if (result.success) {
        setAiInsights({
          ...aiInsights,
          productAnalysis: result.analysis,
          focusProduct: productName
        });
        setShowAIPanel(true);
      }
    } catch (error) {
      console.error('Product analysis failed:', error);
    } finally {
      setLoadingAI(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10 * 60 * 1000); // Refresh every 10 minutes
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '50vh',
        gap: '20px'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid #f3f4f6',
          borderTop: '4px solid #3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ 
          color: '#374151', 
          fontSize: '1.2rem', 
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
        }}>
          LOADING PRODUCT ANALYSIS WITH RISTA API DATA...
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

  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '50vh',
        gap: '20px',
        padding: '20px',
        textAlign: 'center'
      }}>
        <h3 style={{
          color: '#dc2626',
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
          onClick={fetchData}
          style={{
            padding: '12px 24px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}
        >
          RETRY CONNECTION
        </button>
      </div>
    );
  }

  if (!data) return null;

  // Filter data based on selected platform
  const filteredProducts = selectedPlatform === 'All' 
    ? data.products 
    : data.products.filter(product => product.platform === selectedPlatform);

  // Prepare chart data - NOW USING RISTA TOTAL ORDERS
  const orderVolumeData = filteredProducts.map(product => ({
    name: product.name.length > 15 ? product.name.substring(0, 15) + '...' : product.name,
    fullName: product.name,
    zomatoOrders: product.zomatoOrders || 0,
    swiggyOrders: product.swiggyOrders || 0,
    ristaTotal: product.totalOrdersFromRista || 0,
    sheetTotal: (product.zomatoOrders || 0) + (product.swiggyOrders || 0)
  })).sort((a, b) => b.ristaTotal - a.ristaTotal).slice(0, 10);

  const complaintAnalysisData = filteredProducts.map(product => ({
    name: product.name.length > 15 ? product.name.substring(0, 15) + '...' : product.name,
    fullName: product.name,
    totalComplaints: product.totalComplaints || product.igccComplaints || 0,
    complaintRate: product.complaintRate || 0,
    totalOrders: product.totalOrdersFromRista || 0
  })).filter(product => product.totalComplaints > 0)
    .sort((a, b) => b.complaintRate - a.complaintRate).slice(0, 10);

  const platformDistribution = [
    { name: 'Zomato Orders (Rated)', value: data.summary?.totalZomatoOrders || 0, color: '#dc2626' },
    { name: 'Swiggy Orders (Rated)', value: data.summary?.totalSwiggyOrders || 0, color: '#f97316' }
  ];

  const performanceScatterData = filteredProducts.map(product => ({
    name: product.name,
    orders: product.totalOrdersFromRista || 0,
    rating: product.avgRating || 0,
    complaints: product.totalComplaints || product.igccComplaints || 0,
    complaintRate: product.complaintRate || 0
  })).filter(product => product.orders > 0);

  const COLORS = ['#dc2626', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];

  // Get match type badge color
  const getMatchTypeBadge = (matchType, matchScore) => {
    if (matchType === 'exact') {
      return { text: 'EXACT', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.2)' };
    } else if (matchType === 'fuzzy') {
      const scorePercent = (matchScore * 100).toFixed(0);
      return { text: `FUZZY ${scorePercent}%`, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)' };
    } else {
      return { text: 'NO MATCH', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)' };
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
      color: '#f8fafc',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>
      {/* Header */}
      <div style={{
        padding: '30px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <div>
          <h1 style={{
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            fontSize: '2rem',
            margin: 0,
            background: 'linear-gradient(45deg, #8b5cf6, #3b82f6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textTransform: 'uppercase',
            letterSpacing: '2px'
          }}>
            PRODUCT ANALYSIS
          </h1>
          <p style={{ 
            color: '#94a3b8', 
            marginTop: '10px',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            fontSize: '0.9rem',
            letterSpacing: '1px',
            margin: '10px 0 0 0'
          }}>
            AI-POWERED • RISTA API INTEGRATION • {data.summary?.totalProducts || 0} PRODUCTS • {data.summary?.totalOrdersFromRista || 0} TOTAL ORDERS
          </p>
        </div>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            style={{
              padding: '12px 18px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              color: '#f8fafc',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              textTransform: 'uppercase',
              letterSpacing: '1px',
              backdropFilter: 'blur(10px)'
            }}
          >
            <option value="All" style={{ background: '#1e293b', color: '#f8fafc' }}>ALL PLATFORMS</option>
            <option value="Zomato" style={{ background: '#1e293b', color: '#f8fafc' }}>ZOMATO ONLY</option>
            <option value="Swiggy" style={{ background: '#1e293b', color: '#f8fafc' }}>SWIGGY ONLY</option>
          </select>
          <button
            onClick={() => setShowMatchingDetails(!showMatchingDetails)}
            style={{
              padding: '12px 18px',
              background: showMatchingDetails ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)',
              border: `1px solid ${showMatchingDetails ? 'rgba(245, 158, 11, 0.5)' : 'rgba(59, 130, 246, 0.5)'}`,
              borderRadius: '12px',
              color: '#f8fafc',
              cursor: 'pointer',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              textTransform: 'uppercase',
              letterSpacing: '1px',
              transition: 'all 0.2s ease'
            }}
          >
            MATCH DETAILS
          </button>
          <button
            onClick={() => setShowAIPanel(!showAIPanel)}
            style={{
              padding: '12px 18px',
              background: showAIPanel ? 'rgba(139, 92, 246, 0.2)' : 'rgba(59, 130, 246, 0.2)',
              border: `1px solid ${showAIPanel ? 'rgba(139, 92, 246, 0.5)' : 'rgba(59, 130, 246, 0.5)'}`,
              borderRadius: '12px',
              color: '#f8fafc',
              cursor: 'pointer',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              textTransform: 'uppercase',
              letterSpacing: '1px',
              transition: 'all 0.2s ease'
            }}
          >
            {loadingAI ? '⟲ ANALYZING...' : 'AI INSIGHTS'}
          </button>
          <button 
            onClick={fetchData}
            style={{
              padding: '12px 18px',
              background: 'rgba(34, 197, 94, 0.2)',
              border: '1px solid rgba(34, 197, 94, 0.5)',
              borderRadius: '12px',
              color: '#f8fafc',
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

      {/* Matching Details Panel */}
      {showMatchingDetails && data.summary && (
        <div style={{
          margin: '30px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderLeft: '4px solid #f59e0b',
          borderRadius: '15px',
          backdropFilter: 'blur(10px)',
          padding: '25px'
        }}>
          <h3 style={{ 
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            color: '#f59e0b',
            margin: '0 0 20px 0',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            RISTA API MATCHING STATISTICS
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '15px'
          }}>
            <div style={{
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '10px',
              padding: '15px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2rem', color: '#22c55e', fontWeight: '700' }}>
                {data.summary.exactMatches || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '5px' }}>
                EXACT MATCHES
              </div>
            </div>
            <div style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '10px',
              padding: '15px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2rem', color: '#f59e0b', fontWeight: '700' }}>
                {data.summary.fuzzyMatches || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '5px' }}>
                FUZZY MATCHES
              </div>
            </div>
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '10px',
              padding: '15px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2rem', color: '#ef4444', fontWeight: '700' }}>
                {data.summary.noMatches || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '5px' }}>
                NO MATCHES
              </div>
            </div>
            <div style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '10px',
              padding: '15px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2rem', color: '#3b82f6', fontWeight: '700' }}>
                {data.summary.totalOrdersFromRista || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '5px' }}>
                TOTAL ORDERS (RISTA)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Insights Panel */}
      {showAIPanel && aiInsights && (
        <div style={{
          margin: '30px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          borderLeft: '4px solid #8b5cf6',
          borderRadius: '15px',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{
            padding: '25px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <h3 style={{ 
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              color: '#8b5cf6',
              margin: 0,
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              AI PRODUCT INSIGHTS {aiInsights.focusProduct ? `FOR ${aiInsights.focusProduct.toUpperCase()}` : '(COMPREHENSIVE ANALYSIS)'}
            </h3>
          </div>
          <div style={{ padding: '25px' }}>
            {/* Top Performers */}
            {aiInsights.topPerformers && (
              <div style={{
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '15px',
                padding: '25px',
                marginBottom: '20px'
              }}>
                <h4 style={{
                  margin: '0 0 15px 0',
                  color: '#22c55e',
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                  fontSize: '1rem',
                  textTransform: 'uppercase',
                  letterSpacing: '1px'
                }}>
                  TOP PERFORMING PRODUCTS
                </h4>
                {aiInsights.topPerformers.map((product, index) => (
                  <div key={index} style={{
                    padding: '12px',
                    background: 'rgba(34, 197, 94, 0.1)',
                    borderRadius: '8px',
                    marginBottom: '10px',
                    cursor: 'pointer'
                  }}
                  onClick={() => analyzeProduct(product.name)}
                  >
                    <p style={{
                      margin: 0,
                      color: '#f8fafc',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      fontSize: '0.9rem',
                      fontWeight: '600'
                    }}>
                      {index + 1}. {product.name.toUpperCase()}: {product.totalOrdersFromRista || product.totalOrders} ORDERS
                    </p>
                    <p style={{
                      margin: '5px 0 0 0',
                      color: '#94a3b8',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      fontSize: '0.8rem'
                    }}>
                      Rating: {product.avgRating?.toFixed(1) || 'N/A'} | Complaints: {product.totalComplaints || 0} | Rate: {product.complaintRate?.toFixed(2) || 0}%
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Key Insights */}
            <div style={{
              background: 'rgba(139, 92, 246, 0.1)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              borderRadius: '15px',
              padding: '25px',
              marginBottom: '20px'
            }}>
              <h4 style={{
                margin: '0 0 15px 0',
                color: '#f8fafc',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                fontSize: '1rem',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                KEY INSIGHTS
              </h4>
              {aiInsights.keyFindings && (
                <ul style={{
                  margin: 0,
                  paddingLeft: '20px',
                  color: '#94a3b8',
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
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '15px',
              padding: '25px'
            }}>
              <h4 style={{
                margin: '0 0 15px 0',
                color: '#f8fafc',
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
                  color: '#94a3b8',
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

            {aiInsights.productAnalysis && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '15px',
                padding: '25px',
                marginTop: '20px'
              }}>
                <h4 style={{
                  margin: '0 0 15px 0',
                  color: '#f8fafc',
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                  fontSize: '1rem',
                  textTransform: 'uppercase',
                  letterSpacing: '1px'
                }}>
                  PRODUCT-SPECIFIC ANALYSIS
                </h4>
                <p style={{
                  margin: 0,
                  color: '#94a3b8',
                  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                  fontSize: '0.9rem',
                  lineHeight: 1.6
                }}>
                  {aiInsights.productAnalysis}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary Stats - UPDATED WITH RISTA DATA */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '25px',
        padding: '30px',
        paddingTop: (showAIPanel || showMatchingDetails) ? '0' : '30px'
      }}>
        {[
          { 
            title: 'TOTAL PRODUCTS', 
            value: data.summary?.totalProducts || 0,
            color: '#8b5cf6',
            subtitle: 'Unique items tracked'
          },
          { 
            title: 'TOTAL ORDERS (RISTA)', 
            value: data.summary?.totalOrdersFromRista || 0,
            color: '#3b82f6',
            subtitle: 'All orders from inventory'
          },
          { 
            title: 'TOTAL COMPLAINTS', 
            value: data.summary?.totalIgccComplaints || 0,
            color: '#ef4444',
            subtitle: 'Across all platforms'
          },
          { 
            title: 'AVG COMPLAINT RATE', 
            value: `${data.summary?.avgComplaintRate?.toFixed(2) || 0}%`,
            color: '#f59e0b',
            subtitle: 'Based on Rista orders'
          }
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
              fontSize: '2rem', 
              fontWeight: '700', 
              color: metric.color,
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
            }}>
              {metric.value}
            </div>
            <div style={{
              fontSize: '0.9rem',
              color: '#94a3b8',
              marginTop: '8px',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              {metric.title}
            </div>
            <div style={{
              fontSize: '0.75rem',
              color: '#64748b',
              marginTop: '5px',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
            }}>
              {metric.subtitle}
            </div>
          </div>
        ))}
      </div>

      {/* Charts Grid - UPDATED */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
        gap: '25px',
        padding: '30px',
        paddingTop: '0'
      }}>
        {/* Order Volume Chart - USING RISTA DATA */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '15px',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{
            padding: '25px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <h3 style={{ 
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              margin: 0,
              color: '#f8fafc',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              TOP 10 PRODUCTS BY TOTAL ORDERS (RISTA API)
            </h3>
          </div>
          <div style={{ padding: '25px' }}>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={orderVolumeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  height={80} 
                  tick={{ fontSize: 11, fill: '#94a3b8' }} 
                />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '10px',
                    color: '#f8fafc'
                  }}
                  labelFormatter={(label, payload) => {
                    const item = orderVolumeData.find(d => d.name === label);
                    return item ? item.fullName : label;
                  }}
                  formatter={(value, name, props) => {
                    if (name === 'ristaTotal') return [value, 'Total Orders (Rista)'];
                    if (name === 'zomatoOrders') return [value, 'Zomato Orders (Rated)'];
                    if (name === 'swiggyOrders') return [value, 'Swiggy Orders (Rated)'];
                    return [value, name];
                  }}
                />
                <Legend />
                <Bar dataKey="ristaTotal" fill="#3b82f6" name="Total Orders (Rista)" />
                <Bar dataKey="zomatoOrders" fill="#dc2626" name="Zomato (Rated)" />
                <Bar dataKey="swiggyOrders" fill="#f97316" name="Swiggy (Rated)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Complaint Analysis Chart */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '15px',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{
            padding: '25px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <h3 style={{ 
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              margin: 0,
              color: '#f8fafc',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              TOP 10 PRODUCTS BY COMPLAINT RATE
            </h3>
          </div>
          <div style={{ padding: '25px' }}>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={complaintAnalysisData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  height={80} 
                  tick={{ fontSize: 11, fill: '#94a3b8' }} 
                />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} label={{ value: 'Complaint Rate %', angle: -90, position: 'insideLeft', fill: '#94a3b8' }} />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '10px',
                    color: '#f8fafc'
                  }}
                  labelFormatter={(label, payload) => {
                    const item = complaintAnalysisData.find(d => d.name === label);
                    return item ? item.fullName : label;
                  }}
                  formatter={(value, name, props) => {
                    if (name === 'complaintRate') return [`${value.toFixed(2)}%`, 'Complaint Rate'];
                    if (name === 'totalOrders') return [value, 'Total Orders'];
                    return [value, name];
                  }}
                />
                <Legend />
                <Bar dataKey="complaintRate" fill="#ef4444" name="Complaint Rate %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Product Table - UPDATED WITH RISTA DATA */}
      <div style={{
        margin: '30px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '15px',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{
          padding: '25px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <h3 style={{ 
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            margin: 0,
            color: '#f8fafc',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            DETAILED PRODUCT ANALYSIS (RISTA INTEGRATED)
          </h3>
        </div>
        <div style={{ padding: '25px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                  {[
                    'PRODUCT NAME',
                    'TOTAL ORDERS (RISTA)',
                    'RATED ORDERS',
                    'COMPLAINTS',
                    'COMPLAINT RATE %',
                    'AVG RATING',
                    'MATCH STATUS',
                    'ACTIONS'
                  ].map((header) => (
                    <th key={header} style={{ 
                      padding: '18px', 
                      textAlign: 'left', 
                      color: '#f8fafc', 
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      fontSize: '0.9rem',
                      letterSpacing: '1px',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap'
                    }}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProducts
                  .sort((a, b) => (b.totalOrdersFromRista || 0) - (a.totalOrdersFromRista || 0))
                  .slice(0, 30)
                  .map((product, i) => {
                    const totalRistaOrders = product.totalOrdersFromRista || 0;
                    const totalRatedOrders = (product.zomatoOrders || 0) + (product.swiggyOrders || 0);
                    const totalComplaints = product.totalComplaints || product.igccComplaints || 0;
                    const complaintRate = product.complaintRate || 0;
                    const isHighComplaintRate = complaintRate > 5;
                    const matchBadge = getMatchTypeBadge(product.matchType, product.matchScore);
                    
                    return (
                      <tr 
                        key={i} 
                        style={{ 
                          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                          cursor: 'pointer',
                          transition: 'background 0.2s ease',
                          background: isHighComplaintRate ? 'rgba(239, 68, 68, 0.1)' : 'transparent'
                        }}
                        onClick={() => analyzeProduct(product.name)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isHighComplaintRate ? 'rgba(239, 68, 68, 0.1)' : 'transparent';
                        }}
                      >
                        <td style={{ 
                          padding: '18px', 
                          fontWeight: '600', 
                          color: isHighComplaintRate ? '#ef4444' : '#f8fafc',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          maxWidth: '200px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {product.name}
                          {isHighComplaintRate && <span style={{ color: '#ef4444', fontSize: '0.7rem', marginLeft: '5px' }}>⚠ HIGH</span>}
                        </td>
                        <td style={{ 
                          padding: '18px',
                          color: '#3b82f6',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          fontWeight: '700',
                          fontSize: '1.1rem'
                        }}>
                          {totalRistaOrders}
                        </td>
                        <td style={{ 
                          padding: '18px',
                          color: '#94a3b8',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                        }}>
                          {totalRatedOrders}
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            Z:{product.zomatoOrders || 0} S:{product.swiggyOrders || 0}
                          </div>
                        </td>
                        <td style={{ 
                          padding: '18px',
                          color: totalComplaints > 0 ? '#ef4444' : '#94a3b8',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          fontWeight: '600'
                        }}>
                          {totalComplaints}
                        </td>
                        <td style={{ 
                          padding: '18px',
                          color: complaintRate > 5 ? '#ef4444' : complaintRate > 2 ? '#f59e0b' : '#22c55e',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          fontWeight: '700',
                          fontSize: '1.1rem'
                        }}>
                          {complaintRate.toFixed(2)}%
                        </td>
                        <td style={{ 
                          padding: '18px',
                          color: (product.avgRating || 0) > 4 ? '#22c55e' : (product.avgRating || 0) > 3.5 ? '#f59e0b' : '#ef4444',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          fontWeight: '600'
                        }}>
                          {product.avgRating?.toFixed(1) || 'N/A'}
                        </td>
                        <td style={{ padding: '18px' }}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '0.7rem',
                            fontWeight: '600',
                            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                            background: matchBadge.bg,
                            color: matchBadge.color,
                            border: `1px solid ${matchBadge.color}40`
                          }}>
                            {matchBadge.text}
                          </span>
                        </td>
                        <td style={{ padding: '18px' }}>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              analyzeProduct(product.name);
                            }}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '8px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                              background: isHighComplaintRate ? 'rgba(239, 68, 68, 0.2)' : 'rgba(139, 92, 246, 0.2)',
                              color: isHighComplaintRate ? '#ef4444' : '#8b5cf6',
                              border: `1px solid ${isHighComplaintRate ? 'rgba(239, 68, 68, 0.5)' : 'rgba(139, 92, 246, 0.5)'}`,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {isHighComplaintRate ? 'URGENT' : 'ANALYZE'}
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
    </div>
  );
};

export default ProductAnalysisDashboard;