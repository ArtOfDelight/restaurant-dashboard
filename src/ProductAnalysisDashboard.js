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
          LOADING PRODUCT ANALYSIS WITH AI INSIGHTS...
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

  // Prepare chart data
  const volumeData = filteredProducts.map(product => ({
    name: product.name.length > 15 ? product.name.substring(0, 15) + '...' : product.name,
    fullName: product.name,
    zomatoRated: product.zomatoRatedCount || 0,
    swiggyRated: product.swiggyRatedCount || 0,
    zomatoTotal: product.zomatoTotalQuantity || 0,
    swiggyTotal: product.swiggyTotalQuantity || 0,
    totalUnits: (product.zomatoTotalQuantity || 0) + (product.swiggyTotalQuantity || 0)
  })).sort((a, b) => b.totalUnits - a.totalUnits).slice(0, 10);

  const complaintAnalysisData = filteredProducts.map(product => ({
    name: product.name.length > 15 ? product.name.substring(0, 15) + '...' : product.name,
    fullName: product.name,
    zomatoComplaints: product.zomatoComplaints || 0,
    swiggyComplaints: product.swiggyComplaints || 0,
    totalComplaints: (product.zomatoComplaints || 0) + (product.swiggyComplaints || 0),
    complaintRate: ((product.zomatoComplaints || 0) + (product.swiggyComplaints || 0)) / 
                   Math.max((product.zomatoTotalQuantity || 0) + (product.swiggyTotalQuantity || 0), 1) * 100 || 0
  })).filter(product => product.totalComplaints > 0)
    .sort((a, b) => b.complaintRate - a.complaintRate).slice(0, 10);

  const platformDistribution = [
    { name: 'Zomato Total Units', value: data.summary?.totalZomatoUnits || 0, color: '#dc2626' },
    { name: 'Swiggy Total Units', value: data.summary?.totalSwiggyUnits || 0, color: '#f97316' }
  ];

  const performanceScatterData = filteredProducts.map(product => ({
    name: product.name,
    units: (product.zomatoTotalQuantity || 0) + (product.swiggyTotalQuantity || 0),
    rating: product.avgRating || 0,
    complaints: (product.zomatoComplaints || 0) + (product.swiggyComplaints || 0)
  })).filter(product => product.units > 0);

  const COLORS = ['#dc2626', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];

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
            AI-POWERED PRODUCT INSIGHTS • ORDER & QUANTITY HISTORY • {data.summary?.dateRange || 'Sep 5-11, 2025'} • {data.summary?.totalProducts || 0} PRODUCTS
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
                      {index + 1}. {product.name.toUpperCase()}: {product.totalUnits} UNITS
                    </p>
                    <p style={{
                      margin: '5px 0 0 0',
                      color: '#94a3b8',
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      fontSize: '0.8rem'
                    }}>
                      Rated Orders: {(product.zomatoRatedCount || 0) + (product.swiggyRatedCount || 0)} | Rating: {product.avgRating?.toFixed(1) || 'N/A'} | Complaints: {product.totalComplaints || 0}
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

      {/* Summary Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '25px',
        padding: '30px',
        paddingTop: showAIPanel ? '0' : '30px'
      }}>
        {[
          { 
            title: 'TOTAL PRODUCTS', 
            value: data.summary?.totalProducts || 0,
            color: '#8b5cf6'
          },
          { 
            title: 'TOTAL UNITS', 
            value: (data.summary?.totalZomatoUnits || 0) + (data.summary?.totalSwiggyUnits || 0),
            color: '#3b82f6'
          },
          { 
            title: 'RATED ORDERS', 
            value: (data.summary?.totalZomatoRatedCount || 0) + (data.summary?.totalSwiggyRatedCount || 0),
            color: '#22c55e'
          },
          { 
            title: 'TOTAL COMPLAINTS', 
            value: (data.summary?.totalZomatoComplaints || 0) + (data.summary?.totalSwiggyComplaints || 0),
            color: '#ef4444'
          },
          { 
            title: 'AVG COMPLAINT RATE', 
            value: `${data.summary?.avgComplaintRate?.toFixed(2) || 0}%`,
            color: '#f59e0b'
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
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
        gap: '25px',
        padding: '30px',
        paddingTop: '0'
      }}>
        {/* Total Units Chart */}
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
              TOP 10 PRODUCTS BY TOTAL UNITS
            </h3>
          </div>
          <div style={{ padding: '25px' }}>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={volumeData}>
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
                    const item = volumeData.find(d => d.name === label);
                    return item ? item.fullName : label;
                  }}
                  formatter={(value, name, props) => {
                    if (name === 'zomatoTotal') return [value, 'Zomato Units'];
                    if (name === 'swiggyTotal') return [value, 'Swiggy Units'];
                    return [value, name];
                  }}
                />
                <Legend />
                <Bar dataKey="zomatoTotal" fill="#dc2626" name="Zomato Units" />
                <Bar dataKey="swiggyTotal" fill="#f97316" name="Swiggy Units" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Rated Orders Chart */}
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
              TOP 10 PRODUCTS BY RATED ORDERS
            </h3>
          </div>
          <div style={{ padding: '25px' }}>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={volumeData}>
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
                    const item = volumeData.find(d => d.name === label);
                    return item ? item.fullName : label;
                  }}
                  formatter={(value, name, props) => {
                    if (name === 'zomatoRated') return [value, 'Zomato Rated Orders'];
                    if (name === 'swiggyRated') return [value, 'Swiggy Rated Orders'];
                    return [value, name];
                  }}
                />
                <Legend />
                <Bar dataKey="zomatoRated" fill="#b91c1c" name="Zomato Rated Orders" />
                <Bar dataKey="swiggyRated" fill="#c2410c" name="Swiggy Rated Orders" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Platform Distribution */}
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
              UNIT DISTRIBUTION BY PLATFORM
            </h3>
          </div>
          <div style={{ padding: '25px' }}>
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={platformDistribution}
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  {platformDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '10px',
                    color: '#f8fafc'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Complaint Rate Chart */}
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
                <YAxis 
                  tick={{ fontSize: 11, fill: '#94a3b8' }} 
                  label={{ 
                    value: 'Complaint Rate (%)', 
                    angle: -90, 
                    position: 'insideLeft', 
                    fill: '#94a3b8',
                    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                  }} 
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
                    if (name === 'complaintRate') return [`${value.toFixed(2)}%`, 'Complaint Rate'];
                    return [value, name];
                  }}
                />
                <Bar dataKey="complaintRate" fill="#ef4444" name="Complaint Rate" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Product Table */}
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
            DETAILED PRODUCT ANALYSIS
          </h3>
        </div>
        <div style={{ padding: '25px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                  {[
                    'PRODUCT NAME',
                    'ZOMATO UNITS',
                    'SWIGGY UNITS',
                    'TOTAL UNITS',
                    'RATED ORDERS',
                    'COMPLAINT RATE %',
                    'AVG RATING',
                    'ACTIONS'
                  ].map((header) => (
                    <th key={header} style={{ 
                      padding: '18px', 
                      textAlign: 'left', 
                      color: '#f8fafc', 
                      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                      fontSize: '0.9rem',
                      letterSpacing: '1px',
                      textTransform: 'uppercase'
                    }}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProducts
                  .sort((a, b) => ((b.zomatoTotalQuantity || 0) + (b.swiggyTotalQuantity || 0)) - ((a.zomatoTotalQuantity || 0) + (a.swiggyTotalQuantity || 0)))
                  .slice(0, 20)
                  .map((product, i) => {
                    const totalUnits = (product.zomatoTotalQuantity || 0) + (product.swiggyTotalQuantity || 0);
                    const totalRated = (product.zomatoRatedCount || 0) + (product.swiggyRatedCount || 0);
                    const totalComplaints = (product.zomatoComplaints || 0) + (product.swiggyComplaints || 0);
                    const complaintRate = totalUnits > 0 ? (totalComplaints / totalUnits * 100) : 0;
                    const isHighComplaintRate = complaintRate > 5;
                    
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
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace" 
                        }}>
                          {product.name}
                          {isHighComplaintRate && <span style={{ color: '#ef4444', fontSize: '0.7rem', marginLeft: '5px' }}>⚠ HIGH COMPLAINTS</span>}
                        </td>
                        <td style={{ 
                          padding: '18px',
                          color: '#94a3b8',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                        }}>
                          {product.zomatoTotalQuantity || 0}
                        </td>
                        <td style={{ 
                          padding: '18px',
                          color: '#94a3b8',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
                        }}>
                          {product.swiggyTotalQuantity || 0}
                        </td>
                        <td style={{ 
                          padding: '18px',
                          color: '#f8fafc',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          fontWeight: '600'
                        }}>
                          {totalUnits}
                        </td>
                        <td style={{ 
                          padding: '18px',
                          color: '#f8fafc',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          fontWeight: '600'
                        }}>
                          {totalRated}
                        </td>
                        <td style={{ 
                          padding: '18px',
                          color: complaintRate > 5 ? '#ef4444' : complaintRate > 2 ? '#f59e0b' : '#22c55e',
                          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
                          fontWeight: '600'
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
                              cursor: 'pointer'
                            }}
                          >
                            {isHighComplaintRate ? 'URGENT ANALYSIS' : 'AI ANALYZE'}
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