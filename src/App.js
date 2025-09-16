import React, { useState, useEffect, Suspense, lazy } from 'react';
import logo from './ggg.png';

// Import Dashboard and TelegramBroadcast directly
import Dashboard from './Dashboard';
import TelegramBroadcast from './TelegramBroadcast';

// Lazy load other components for better performance
const ChecklistDashboard = lazy(() => 
  import('./ChecklistDashboard').catch(() => ({ 
    default: () => <MissingComponent componentName="CHECKLIST DASHBOARD" fileName="ChecklistDashboard" />
  }))
);

const TicketDashboard = lazy(() => 
  import('./TicketDashboard').catch(() => ({ 
    default: () => <MissingComponent componentName="TICKET DASHBOARD" fileName="TicketDashboard" />
  }))
);

const HighRatedDashboard = lazy(() => 
  import('./HighRatedDashboard').catch(() => ({ 
    default: () => <MissingComponent componentName="OUTLET DASHBOARD" fileName="HighRatedDashboard" />
  }))
);

const EmployeeDashboard = lazy(() => 
  import('./EmployeeDashboard').catch(() => ({ 
    default: () => <MissingComponent componentName="EMPLOYEE DASHBOARD" fileName="EmployeeDashboard" />
  }))
);

const SwiggyDashboard = lazy(() => 
  import('./SwiggyDashboard').catch(() => ({ 
    default: () => <MissingComponent componentName="SWIGGY DASHBOARD" fileName="SwiggyDashboard" />
  }))
);

const ProductAnalysisDashboard = lazy(() => 
  import('./ProductAnalysisDashboard').catch(() => ({ 
    default: () => <MissingComponent componentName="PRODUCT DASHBOARD" fileName="ProductAnalysisDashboard" />
  }))
);

const StockDashboard = lazy(() => 
  import('./StockDashboard').catch(() => ({ 
    default: () => <MissingComponent componentName="STOCK DASHBOARD" fileName="StockDashboard" />
  }))
);

// Loading component
const LoadingComponent = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    background: 'var(--surface-dark)',
    borderRadius: '20px',
    margin: '20px',
    backdropFilter: 'blur(15px)',
    boxShadow: 'var(--shadow-dark)'
  }}>
    <div style={{
      width: '50px',
      height: '50px',
      border: '3px solid var(--border-light)',
      borderTop: '3px solid var(--text-primary)',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }} />
    <p style={{
      marginTop: '20px',
      color: 'var(--text-primary)',
      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
      fontSize: '1.1rem',
      letterSpacing: '2px',
      textTransform: 'uppercase'
    }}>
      LOADING DASHBOARD...
    </p>
    <style>
      {`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}
    </style>
  </div>
);

// Fallback component for missing dashboards
const MissingComponent = ({ componentName, fileName }) => (
  <div style={{
    background: 'var(--surface-dark)',
    border: '2px solid var(--border-light)',
    padding: '60px 40px',
    borderRadius: '20px',
    textAlign: 'center',
    margin: '20px',
    backdropFilter: 'blur(15px)',
    boxShadow: 'var(--shadow-dark)',
    position: 'relative',
    overflow: 'hidden'
  }}>
    {/* Animated background pattern */}
    <div style={{
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      background: 'linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.02) 50%, transparent 70%)',
      animation: 'shimmer 3s infinite'
    }} />
    
    <h1 style={{
      color: 'var(--text-primary)',
      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
      textTransform: 'uppercase',
      letterSpacing: '3px',
      marginBottom: '25px',
      fontSize: '1.8rem',
      position: 'relative',
      zIndex: '1'
    }}>
      {componentName}
    </h1>
    
    <div style={{
      background: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      borderRadius: '15px',
      padding: '25px',
      marginBottom: '25px',
      position: 'relative',
      zIndex: '1'
    }}>
      <p style={{
        color: '#ef4444',
        fontSize: '1.2rem',
        marginBottom: '15px',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
        fontWeight: '600'
      }}>
        COMPONENT NOT FOUND
      </p>
      <p style={{
        color: 'var(--text-secondary)',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
        fontSize: '0.95rem',
        lineHeight: '1.6'
      }}>
        The {fileName} component is missing from your project.
      </p>
    </div>
    
    <div style={{
      background: 'var(--surface-light)',
      border: '1px solid var(--border-light)',
      borderRadius: '12px',
      padding: '20px',
      position: 'relative',
      zIndex: '1'
    }}>
      <p style={{
        color: 'var(--text-muted)',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
        fontSize: '0.9rem',
        marginBottom: '15px'
      }}>
        TO RESOLVE THIS ISSUE:
      </p>
      <code style={{
        background: 'var(--surface-dark)',
        color: 'var(--text-primary)',
        padding: '10px 15px',
        borderRadius: '8px',
        border: '1px solid var(--border-light)',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
        fontSize: '0.85rem',
        display: 'block',
        textAlign: 'left'
      }}>
        Create: ./{fileName}.js
      </code>
    </div>
    
    <style>
      {`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}
    </style>
  </div>
);

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Dashboard Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          background: 'var(--surface-dark)',
          border: '2px solid #ef4444',
          borderRadius: '20px',
          padding: '40px',
          margin: '20px',
          textAlign: 'center',
          backdropFilter: 'blur(15px)',
          boxShadow: 'var(--shadow-dark)'
        }}>
          <h2 style={{
            color: '#ef4444',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            fontSize: '1.5rem',
            marginBottom: '20px',
            textTransform: 'uppercase',
            letterSpacing: '2px'
          }}>
            SYSTEM ERROR
          </h2>
          <p style={{
            color: 'var(--text-secondary)',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            marginBottom: '20px'
          }}>
            Something went wrong while loading this dashboard.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid #ef4444',
              color: '#ef4444',
              padding: '12px 24px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              textTransform: 'uppercase',
              letterSpacing: '1px',
              fontWeight: '600'
            }}
          >
            RELOAD APPLICATION
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Main App Component
function App() {
  const [currentView, setCurrentView] = useState('checklist');
  const [isNavigating, setIsNavigating] = useState(false);

  // Navigation configuration - Updated to include stock dashboard (9 items)
  const navigationItems = [
    { key: 'dashboard', label: 'ZOMATO DB', icon: '🍕' },
    { key: 'swiggy', label: 'SWIGGY DB', icon: '🛵' },
    { key: 'product', label: 'PRODUCT DB', icon: '📊' },
    { key: 'stock', label: 'STOCK DB', icon: '📦' },
    { key: 'outlet', label: 'OUTLET DB', icon: '🏪' },
    { key: 'employee', label: 'EMPLOYEE DB', icon: '👥' },
    { key: 'checklist', label: 'CHECKLISTS', icon: '✅' },
    { key: 'tickets', label: 'TICKETS', icon: '🎫' },
    { key: 'broadcast', label: 'BROADCAST', icon: '📢' }
  ];

  // Handle view changes with smooth transitions
  const handleViewChange = (newView) => {
    if (newView === currentView) return;
    
    setIsNavigating(true);
    setTimeout(() => {
      setCurrentView(newView);
      setIsNavigating(false);
    }, 150);
  };

  // Render current view with error boundary
  const renderCurrentView = () => {
    const viewComponents = {
      dashboard: <Dashboard />,
      swiggy: <SwiggyDashboard />,
      product: <ProductAnalysisDashboard />,
      stock: <StockDashboard />,
      outlet: <HighRatedDashboard />,
      employee: <EmployeeDashboard />,
      checklist: <ChecklistDashboard />,
      tickets: <TicketDashboard />,
      broadcast: <TelegramBroadcast />
    };

    const CurrentComponent = viewComponents[currentView] || <ChecklistDashboard />;

    return (
      <ErrorBoundary key={currentView}>
        <Suspense fallback={<LoadingComponent />}>
          <div style={{
            opacity: isNavigating ? 0.7 : 1,
            transform: isNavigating ? 'translateY(10px)' : 'translateY(0)',
            transition: 'all 0.15s ease-out'
          }}>
            {CurrentComponent}
          </div>
        </Suspense>
      </ErrorBoundary>
    );
  };

  // Create navigation button with enhanced styling - Updated for 9 items
  const createNavButton = (item, isActive) => {
    const { key, label, icon } = item;
    
    const buttonStyle = {
      background: isActive 
        ? 'linear-gradient(135deg, var(--border-light) 0%, var(--surface-light) 100%)' 
        : 'var(--surface-light)',
      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
      border: isActive ? '2px solid var(--border-light)' : '1px solid var(--border-light)',
      padding: '6px 10px', // Further reduced padding for 9 items
      borderRadius: '6px', // Smaller radius
      cursor: 'pointer',
      fontWeight: isActive ? '700' : '600',
      fontSize: '0.7rem', // Further reduced font size for 9 items
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      transform: isActive ? 'translateY(-2px) scale(1.01)' : 'translateY(0) scale(1)',
      boxShadow: isActive 
        ? 'var(--shadow-glow), 0 6px 20px rgba(0, 0, 0, 0.3)' 
        : '0 2px 8px rgba(0, 0, 0, 0.1)',
      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
      textTransform: 'uppercase',
      letterSpacing: '0.3px', // Further reduced letter spacing
      backdropFilter: 'blur(15px)',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      gap: '4px', // Further reduced gap
      minWidth: '80px', // Further reduced min width for 9 items
      justifyContent: 'center',
      whiteSpace: 'nowrap'
    };

    const handleMouseEnter = (e) => {
      if (!isActive) {
        e.target.style.background = 'linear-gradient(135deg, var(--border-light) 0%, var(--surface-light) 100%)';
        e.target.style.transform = 'translateY(-1px) scale(1.005)';
        e.target.style.boxShadow = 'var(--shadow-glow), 0 4px 15px rgba(0, 0, 0, 0.2)';
        e.target.style.color = 'var(--text-primary)';
      }
    };

    const handleMouseLeave = (e) => {
      if (!isActive) {
        e.target.style.background = 'var(--surface-light)';
        e.target.style.transform = 'translateY(0) scale(1)';
        e.target.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
        e.target.style.color = 'var(--text-secondary)';
      }
    };

    return (
      <button
        key={key}
        onClick={() => handleViewChange(key)}
        style={buttonStyle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        disabled={isNavigating}
      >
        <span style={{ fontSize: '0.8rem' }}>{icon}</span>
        <span>{label}</span>
        {isActive && (
          <div style={{
            position: 'absolute',
            bottom: '0',
            left: '0',
            right: '0',
            height: '2px',
            background: 'linear-gradient(90deg, transparent, var(--text-primary), transparent)',
            animation: 'pulse 2s infinite'
          }} />
        )}
      </button>
    );
  };

  // Keyboard navigation - Updated to include stock dashboard (9 items)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey) {
        const keyMap = {
          '1': 'dashboard',
          '2': 'swiggy', 
          '3': 'product',
          '4': 'stock',
          '5': 'outlet',
          '6': 'employee',
          '7': 'checklist',
          '8': 'tickets',
          '9': 'broadcast'
        };
        
        if (keyMap[e.key]) {
          e.preventDefault();
          handleViewChange(keyMap[e.key]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #000000 100%)',
      padding: '0',
      margin: '0',
      color: 'var(--text-primary)',
      position: 'relative'
    }}>
      {/* Global Styles */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
          }
          
          /* Scrollbar styling */
          ::-webkit-scrollbar {
            width: 8px;
          }
          
          ::-webkit-scrollbar-track {
            background: var(--surface-dark);
          }
          
          ::-webkit-scrollbar-thumb {
            background: var(--border-light);
            borderRadius: 4px;
          }
          
          ::-webkit-scrollbar-thumb:hover {
            background: var(--text-secondary);
          }
        `}
      </style>

      {/* Navigation Header - Updated for 9 items */}
      <nav style={{
        background: 'var(--surface-dark)',
        border: 'none',
        padding: '10px 15px', // Further reduced padding for 9 items
        display: 'flex',
        gap: '10px', // Reduced gap for 9 items
        justifyContent: 'space-between',
        alignItems: 'center',
        backdropFilter: 'blur(20px)',
        boxShadow: 'var(--shadow-dark), 0 1px 0 rgba(255, 255, 255, 0.05)',
        marginBottom: '15px', // Reduced margin
        position: 'sticky',
        top: '0px',
        zIndex: '1000',
        backgroundImage: 'linear-gradient(var(--surface-dark), var(--surface-dark)), var(--primary-gradient)',
        backgroundOrigin: 'padding-box',
        backgroundClip: 'padding-box, border-box'
      }}>
        {/* Logo Section */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px' // Further reduced gap
        }}>
          <img
            src={logo}
            alt="Logo"
            style={{
              height: '30px', // Further reduced height for 9 items
              width: 'auto',
              backdropFilter: 'blur(10px)',
              transition: 'transform 0.3s ease'
            }}
            onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
          />
        </div>
        
        {/* Navigation Buttons - Updated layout for 9 items */}
        <div style={{ 
          display: 'flex', 
          gap: '6px', // Further reduced gap for 9 items
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '1'
        }}>
          {navigationItems.map(item => 
            createNavButton(item, currentView === item.key)
          )}
        </div>

        {/* Keyboard Shortcuts Indicator - Updated for 9 shortcuts */}
        <div style={{
          fontSize: '0.6rem', // Further reduced font size
          color: 'var(--text-muted)',
          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
          textAlign: 'right',
          lineHeight: '1.2',
          minWidth: '55px' // Reduced minimum width
        }}>
          <div>ALT + 1-9</div>
          <div>SHORTCUTS</div>
        </div>
      </nav>

      {/* Status Bar */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.5)',
        padding: '6px 20px',
        fontSize: '0.7rem',
        color: 'var(--text-muted)',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border-light)',
        marginBottom: '15px'
      }}>
        <div>
          ACTIVE: {navigationItems.find(item => item.key === currentView)?.label || 'UNKNOWN'}
        </div>
        <div>
          STATUS: {isNavigating ? 'SWITCHING...' : 'READY'}
        </div>
        <div>
          SESSION: {new Date().toLocaleTimeString()}
        </div>
      </div>

      {/* Content Area */}
      <main style={{ 
        padding: '0 20px',
        paddingBottom: '50px',
        minHeight: 'calc(100vh - 200px)'
      }}>
        {renderCurrentView()}
      </main>

      {/* Footer - Updated for 9 dashboards */}
      <footer style={{
        background: 'var(--surface-dark)',
        borderTop: '1px solid var(--border-light)',
        padding: '15px 20px',
        textAlign: 'center',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
      }}>
        <div>
          DASHBOARD SUITE v2.3 • POWERED BY REACT & GOOGLE SHEETS API • 9 INTEGRATED DASHBOARDS
        </div>
        <div style={{ marginTop: '5px', fontSize: '0.65rem' }}>
          USE ALT + 1-9 FOR QUICK NAVIGATION • STOCK MANAGEMENT • AI-POWERED INSIGHTS
        </div>
      </footer>
    </div>
  );
}

export default App;