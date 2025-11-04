import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ScatterChart, Scatter, ComposedChart
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
  const [minOrderThreshold, setMinOrderThreshold] = useState(10); // Default threshold

  // Fetch product data using fetch API - NOW USING PRODUCT ANALYSIS DATA
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Use product analysis endpoint with ProductDetails sheet
      const response = await fetch(`${API_URL}/api/product-matching-sheets`);
      const result = await response.json();

      if (result.success) {
        // The backend now returns data in the correct format
        setData({
          products: result.data,
          summary: result.metadata
        });
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
          MATCHING PRODUCTS ACROSS SHEETS (100% MATCHES)...
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

  // Filter data based on selected platform and minimum order threshold
  const filteredProducts = data.products
    .filter(product => {
      // Apply platform filter
      if (selectedPlatform !== 'All' && product.platform !== selectedPlatform) {
        return false;
      }
      // Apply minimum order threshold
      if ((product.totalOrders || 0) < minOrderThreshold) {
        return false;
      }
      return true;
    });

  // Prepare chart data - HIGH RATED ANALYSIS (with percentages) - DESCENDING ORDER
  const highRatedData = filteredProducts
    .map(product => {
      const totalOrders = product.totalOrders || 0;
      const highRated = product.highRated || 0;
      const highRatedPercentage = totalOrders > 0 ? (highRated / totalOrders) * 100 : 0;

      return {
        name: product.name.length > 15 ? product.name.substring(0, 15) + '...' : product.name,
        fullName: product.name,
        highRated: highRated,
        totalOrders: totalOrders,
        highRatedPercentage: highRatedPercentage
      };
    })
    .filter(product => product.highRated > 0) // Only show products with high ratings
    .sort((a, b) => b.highRatedPercentage - a.highRatedPercentage) // Sort by high rated percentage (descending)
    .slice(0, 20); // Top 20 products

  const complaintAnalysisData = filteredProducts.map(product => {
    const totalOrders = product.totalOrders || 0;
    const lowRated = product.lowRated || 0;
    const lowRatedPercentage = (product.lowRatedPercentage != null && !isNaN(product.lowRatedPercentage)) ? product.lowRatedPercentage : 0;

    return {
      name: product.name.length > 15 ? product.name.substring(0, 15) + '...' : product.name,
      fullName: product.name,
      lowRated: lowRated,
      lowRatedPercentage: lowRatedPercentage,
      totalOrders: totalOrders
    };
  }).filter(product => product.lowRated > 0)
    .sort((a, b) => (b.lowRatedPercentage || 0) - (a.lowRatedPercentage || 0)).slice(0, 20); // Top 20 products

  const platformDistribution = [
    { name: 'Zomato Orders (Rated)', value: data.summary?.totalZomatoOrders || 0, color: '#dc2626' },
    { name: 'Swiggy Orders (Rated)', value: data.summary?.totalSwiggyOrders || 0, color: '#f97316' }
  ];

  const performanceScatterData = filteredProducts.map(product => ({
    name: product.name,
    orders: product.totalOrders || 0,
    rating: product.avgRating || 0,
    lowRated: product.lowRated || 0,
    lowRatedPercentage: (product.lowRatedPercentage != null && !isNaN(product.lowRatedPercentage)) ? product.lowRatedPercentage : 0
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
            SHEET-BASED MATCHING • {filteredProducts.length} DISPLAYED (MIN {minOrderThreshold} ORDERS) • {data.summary?.totalProducts || 0} TOTAL PRODUCTS
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{
              color: '#94a3b8',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              fontSize: '0.85rem',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              MIN ORDERS:
            </label>
            <input
              type="number"
              value={minOrderThreshold}
              onChange={(e) => setMinOrderThreshold(Number(e.target.value))}
              min="0"
              style={{
                padding: '12px 18px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '12px',
                fontSize: '0.9rem',
                color: '#f8fafc',
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                width: '100px',
                backdropFilter: 'blur(10px)'
              }}
            />
          </div>
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
            PRODUCT MATCHING STATISTICS
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
                {data.summary.matchedProducts || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '5px' }}>
                MATCHED PRODUCTS
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
                {data.summary.unmatchedProducts || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '5px' }}>
                UNMATCHED PRODUCTS
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
                {data.summary.totalProducts || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '5px' }}>
                TOTAL PRODUCTS
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
                {data.summary.totalOrders || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '5px' }}>
                TOTAL ORDERS
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
                      Rating: {product.avgRating?.toFixed(1) || 'N/A'} | Low Rated: {product.lowRated || 0} | Low Rated %: {((product.lowRatedPercentage != null && !isNaN(product.lowRatedPercentage)) ? product.lowRatedPercentage : 0).toFixed(2)}%
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
            title: 'MATCHED PRODUCTS',
            value: data.summary?.matchedProducts || 0,
            color: '#8b5cf6',
            subtitle: 'Successfully matched items'
          },
          {
            title: 'TOTAL ORDERS',
            value: data.summary?.totalOrders || 0,
            color: '#3b82f6',
            subtitle: 'From ProductDetails sheet'
          },
          {
            title: 'HIGH RATED',
            value: data.products?.reduce((sum, p) => sum + (p.highRated || 0), 0) || 0,
            color: '#22c55e',
            subtitle: 'Across all platforms'
          },
          {
            title: 'LOW RATED',
            value: data.products?.reduce((sum, p) => sum + (p.lowRated || 0), 0) || 0,
            color: '#ef4444',
            subtitle: 'Across all platforms'
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
        {/* High Rated Chart - COMBINED BAR & LINE - DESCENDING ORDER */}
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
              TOP 20 PRODUCTS - ORDERS & HIGH RATED % (DESCENDING)
            </h3>
          </div>
          <div style={{ padding: '25px' }}>
            <ResponsiveContainer width="100%" height={500}>
              <ComposedChart data={highRatedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  label={{ value: 'Orders', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  label={{ value: 'High Rated %', angle: 90, position: 'insideRight', fill: '#94a3b8' }}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '10px',
                    color: '#f8fafc'
                  }}
                  labelFormatter={(label, payload) => {
                    const item = highRatedData.find(d => d.name === label);
                    return item ? item.fullName : label;
                  }}
                  formatter={(value, name, props) => {
                    if (name === 'totalOrders') return [value, 'Total Orders'];
                    if (name === 'highRated') return [value, 'High Rated Count'];
                    if (name === 'highRatedPercentage') return [`${value.toFixed(2)}%`, 'High Rated %'];
                    return [value, name];
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="totalOrders" fill="#3b82f6" name="Total Orders" />
                <Line yAxisId="right" type="monotone" dataKey="highRatedPercentage" stroke="#22c55e" strokeWidth={3} name="High Rated %" dot={{ fill: '#22c55e', r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Low Rated Analysis Chart - COMBINED BAR & LINE */}
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
              TOP 20 PRODUCTS - ORDERS & LOW RATED %
            </h3>
          </div>
          <div style={{ padding: '25px' }}>
            <ResponsiveContainer width="100%" height={500}>
              <ComposedChart data={complaintAnalysisData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  label={{ value: 'Orders', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  label={{ value: 'Low Rated %', angle: 90, position: 'insideRight', fill: '#94a3b8' }}
                  domain={[0, 'auto']}
                />
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
                    if (name === 'totalOrders') return [value, 'Total Orders'];
                    if (name === 'lowRated') return [value, 'Low Rated Count'];
                    if (name === 'lowRatedPercentage') return [`${value.toFixed(2)}%`, 'Low Rated %'];
                    return [value, name];
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="totalOrders" fill="#3b82f6" name="Total Orders" />
                <Line yAxisId="right" type="monotone" dataKey="lowRatedPercentage" stroke="#ef4444" strokeWidth={3} name="Low Rated %" dot={{ fill: '#ef4444', r: 5 }} />
              </ComposedChart>
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
            MATCHED PRODUCTS (100% PERFECT MATCHES ONLY)
          </h3>
        </div>
        <div style={{ padding: '25px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                  {[
                    'PRODUCT NAME',
                    'ORDER COUNT',
                    'ZOMATO RATING',
                    'SWIGGY RATING',
                    'AVG RATING',
                    'HIGH RATED',
                    'HIGH RATED %',
                    'LOW RATED',
                    'LOW RATED %'
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
                  .sort((a, b) => (b.totalOrders || 0) - (a.totalOrders || 0))
                  .map((product, i) => {
                    const orderCount = product.totalOrders || 0;
                    const zomatoMatch = product.zomatoMatch || '-';
                    const swiggyMatch = product.swiggyMatch || '-';
                    const hasBothMatches = zomatoMatch === '✓' && swiggyMatch === '✓';

                    return (
                      <tr
                        key={i}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                          transition: 'background 0.2s ease',
                          background: hasBothMatches ? 'rgba(34, 197, 94, 0.1)' : 'transparent'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = hasBothMatches ? 'rgba(34, 197, 94, 0.1)' : 'transparent';
                        }}
                      >
                        <td style={{
                          padding: '18px',
                          fontWeight: '600',
                          color: '#f8fafc',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          maxWidth: '250px'
                        }}>
                          {product.name}
                          {hasBothMatches && <span style={{ color: '#22c55e', fontSize: '0.7rem', marginLeft: '5px' }}>✓ BOTH</span>}
                        </td>
                        <td style={{
                          padding: '18px',
                          color: '#3b82f6',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          fontWeight: '700',
                          fontSize: '1.1rem'
                        }}>
                          {orderCount}
                        </td>
                        <td style={{
                          padding: '18px',
                          color: (product.zomatoRating || 0) > 0 ? '#22c55e' : '#94a3b8',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          fontWeight: '700'
                        }}>
                          {(product.zomatoRating || 0) > 0 ? `${product.zomatoRating.toFixed(1)}★` : '-'}
                        </td>
                        <td style={{
                          padding: '18px',
                          color: (product.swiggyRating || 0) > 0 ? '#22c55e' : '#94a3b8',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          fontWeight: '700'
                        }}>
                          {(product.swiggyRating || 0) > 0 ? `${product.swiggyRating.toFixed(1)}★` : '-'}
                        </td>
                        <td style={{
                          padding: '18px',
                          color: (product.avgRating || 0) > 0 ? '#3b82f6' : '#94a3b8',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          fontWeight: '700',
                          fontSize: '1.1rem'
                        }}>
                          {(product.avgRating || 0) > 0 ? `${product.avgRating.toFixed(1)}★` : '-'}
                        </td>
                        <td style={{
                          padding: '18px',
                          color: '#22c55e',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          fontWeight: '700'
                        }}>
                          {product.highRated || 0}
                        </td>
                        <td style={{
                          padding: '18px',
                          color: '#22c55e',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          fontWeight: '700'
                        }}>
                          {(product.highRatedPercentage || 0).toFixed(2)}%
                        </td>
                        <td style={{
                          padding: '18px',
                          color: '#ef4444',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          fontWeight: '700'
                        }}>
                          {product.lowRated || 0}
                        </td>
                        <td style={{
                          padding: '18px',
                          color: '#ef4444',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          fontWeight: '700'
                        }}>
                          {(product.lowRatedPercentage || 0).toFixed(2)}%
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