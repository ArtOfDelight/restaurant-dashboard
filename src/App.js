import React, { useState, useEffect, Suspense, lazy, createContext, useContext } from 'react';
import { GoogleOAuthProvider, GoogleLogin, googleLogout } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import logo from './ggg.png';

// Import Dashboard directly since it's the main component
import Dashboard from './Dashboard';

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

// Replace with your actual Google OAuth Client ID
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID";

// Authorized email domains (you can modify this list)
const AUTHORIZED_DOMAINS = ['gmail.com', 'zaanrestaurants.com']; // Add your organization domain
const AUTHORIZED_EMAILS = [
  'farjatincry@gmail.com', // Add specific authorized emails
  'ajay@zaanrestaurants.com',
  'ayaaz@zaanrestaurants.com'
];

// Authentication Context
const AuthContext = createContext();

// Custom hook to use auth context
const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Authentication Provider
const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        if (isEmailAuthorized(userData.email)) {
          setUser(userData);
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('user');
        }
      } catch (error) {
        localStorage.removeItem('user');
      }
    }
    setIsLoading(false);
  }, []);

  const isEmailAuthorized = (email) => {
    // Check if email is in authorized list
    if (AUTHORIZED_EMAILS.includes(email)) return true;
    
    // Check if email domain is authorized
    const domain = email.split('@')[1];
    return AUTHORIZED_DOMAINS.includes(domain);
  };

  const handleLoginSuccess = (credentialResponse) => {
    try {
      const decoded = jwtDecode(credentialResponse.credential);
      
      if (!isEmailAuthorized(decoded.email)) {
        alert('Access denied. Your email is not authorized to access this system.');
        return;
      }

      const userData = {
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
        sub: decoded.sub
      };

      setUser(userData);
      setIsAuthenticated(true);
      localStorage.setItem('user', JSON.stringify(userData));
    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed. Please try again.');
    }
  };

  const handleLoginFailure = () => {
    console.error('Login Failed');
    alert('Login failed. Please try again.');
  };

  const logout = () => {
    googleLogout();
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoading,
      handleLoginSuccess,
      handleLoginFailure,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// Login Component with Futuristic Design
const LoginScreen = () => {
  const { handleLoginSuccess, handleLoginFailure } = useAuth();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #000000 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Animated background elements */}
      <div style={{
        position: 'absolute',
        top: '10%',
        left: '10%',
        width: '200px',
        height: '200px',
        background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'float 6s ease-in-out infinite'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '10%',
        right: '10%',
        width: '150px',
        height: '150px',
        background: 'radial-gradient(circle, rgba(255,255,255,0.02) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'float 8s ease-in-out infinite reverse'
      }} />

      <div style={{
        background: 'var(--surface-dark, #1a1a1a)',
        border: '1px solid var(--border-light, #444444)',
        borderRadius: '20px',
        padding: '50px 40px',
        backdropFilter: 'blur(15px)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        width: '100%',
        maxWidth: '450px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Top gradient line */}
        <div style={{
          position: 'absolute',
          top: '0',
          left: '0',
          right: '0',
          height: '2px',
          background: 'linear-gradient(90deg, transparent, #ffffff, transparent)',
          opacity: 0.8
        }} />

        {/* Logo */}
        <div style={{ marginBottom: '30px' }}>
          <img
            src={logo}
            alt="Logo"
            style={{
              height: '60px',
              width: 'auto',
              filter: 'brightness(1.2)',
              marginBottom: '20px'
            }}
          />
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: '2rem',
          fontWeight: '700',
          background: 'linear-gradient(90deg, #ffffff, #aaaaaa)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent',
          margin: '0 0 10px 0',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
        }}>
          Dashboard Suite
        </h1>

        <p style={{
          color: 'var(--text-secondary, #cccccc)',
          margin: '0 0 40px 0',
          fontSize: '1rem',
          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
          letterSpacing: '1px'
        }}>
          Secure Access Required
        </p>

        {/* Security notice */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--border-light, #444444)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '30px',
          textAlign: 'left'
        }}>
          <h3 style={{
            color: 'var(--text-primary, #ffffff)',
            fontSize: '0.9rem',
            margin: '0 0 10px 0',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            Security Notice
          </h3>
          <p style={{
            color: 'var(--text-secondary, #cccccc)',
            fontSize: '0.85rem',
            margin: '0',
            lineHeight: '1.5',
            fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
          }}>
            This system requires authorized Gmail authentication. Only pre-approved email addresses can access the dashboard.
          </p>
        </div>

        {/* Google Login Button */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '20px'
        }}>
          <GoogleLogin
            onSuccess={handleLoginSuccess}
            onError={handleLoginFailure}
            theme="filled_black"
            shape="rectangular"
            size="large"
            text="signin_with"
            width="300px"
          />
        </div>

        {/* Footer text */}
        <p style={{
          color: 'var(--text-muted, #888888)',
          fontSize: '0.75rem',
          margin: '20px 0 0 0',
          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
          letterSpacing: '0.5px'
        }}>
          Powered by Google OAuth 2.0
        </p>
      </div>

      <style>
        {`
          @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(5deg); }
          }
        `}
      </style>
    </div>
  );
};

// User Profile Component in Header
const UserProfile = () => {
  const { user, logout } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        style={{
          background: 'var(--surface-light)',
          border: '1px solid var(--border-light)',
          borderRadius: '25px',
          padding: '8px 15px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          color: 'var(--text-primary)',
          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
          fontSize: '0.8rem'
        }}
      >
        <img
          src={user.picture}
          alt={user.name}
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            border: '1px solid var(--border-light)'
          }}
        />
        <span>{user.name}</span>
        <span style={{ fontSize: '0.7rem' }}>▼</span>
      </button>

      {showDropdown && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: '0',
          background: 'var(--surface-dark)',
          border: '1px solid var(--border-light)',
          borderRadius: '12px',
          padding: '10px',
          marginTop: '5px',
          minWidth: '200px',
          backdropFilter: 'blur(15px)',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
          zIndex: 1000
        }}>
          <div style={{
            padding: '10px',
            borderBottom: '1px solid var(--border-light)',
            marginBottom: '10px'
          }}>
            <div style={{
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
              fontWeight: '600',
              marginBottom: '5px'
            }}>
              {user.name}
            </div>
            <div style={{
              color: 'var(--text-secondary)',
              fontSize: '0.8rem'
            }}>
              {user.email}
            </div>
          </div>
          <button
            onClick={() => {
              setShowDropdown(false);
              logout();
            }}
            style={{
              width: '100%',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              padding: '10px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
};

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

// Protected Dashboard Component
const ProtectedDashboard = () => {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState('checklist');
  const [isNavigating, setIsNavigating] = useState(false);

  // Navigation configuration
  const navigationItems = [
    { key: 'dashboard', label: 'ZOMATO DB', icon: '🍕' },
    { key: 'swiggy', label: 'SWIGGY DB', icon: '🛵' },
    { key: 'outlet', label: 'OUTLET DB', icon: '🏪' },
    { key: 'employee', label: 'EMPLOYEE DB', icon: '👥' },
    { key: 'checklist', label: 'CHECKLISTS', icon: '✅' },
    { key: 'tickets', label: 'TICKETS', icon: '🎫' }
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
      outlet: <HighRatedDashboard />,
      employee: <EmployeeDashboard />,
      checklist: <ChecklistDashboard />,
      tickets: <TicketDashboard />
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

  // Create navigation button with enhanced styling
  const createNavButton = (item, isActive) => {
    const { key, label, icon } = item;
    
    const buttonStyle = {
      background: isActive 
        ? 'linear-gradient(135deg, var(--border-light) 0%, var(--surface-light) 100%)' 
        : 'var(--surface-light)',
      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
      border: isActive ? '2px solid var(--border-light)' : '1px solid var(--border-light)',
      padding: '10px 18px',
      borderRadius: '10px',
      cursor: 'pointer',
      fontWeight: isActive ? '700' : '600',
      fontSize: '0.85rem',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      transform: isActive ? 'translateY(-3px) scale(1.02)' : 'translateY(0) scale(1)',
      boxShadow: isActive 
        ? 'var(--shadow-glow), 0 8px 25px rgba(0, 0, 0, 0.3)' 
        : '0 2px 10px rgba(0, 0, 0, 0.1)',
      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
      textTransform: 'uppercase',
      letterSpacing: '1px',
      backdropFilter: 'blur(15px)',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      minWidth: '120px',
      justifyContent: 'center'
    };

    return (
      <button
        key={key}
        onClick={() => handleViewChange(key)}
        style={buttonStyle}
        disabled={isNavigating}
      >
        <span style={{ fontSize: '1rem' }}>{icon}</span>
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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey) {
        const keyMap = {
          '1': 'dashboard',
          '2': 'swiggy', 
          '3': 'outlet',
          '4': 'employee',
          '5': 'checklist',
          '6': 'tickets'
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
          
          ::-webkit-scrollbar {
            width: 8px;
          }
          
          ::-webkit-scrollbar-track {
            background: var(--surface-dark);
          }
          
          ::-webkit-scrollbar-thumb {
            background: var(--border-light);
            border-radius: 4px;
          }
          
          ::-webkit-scrollbar-thumb:hover {
            background: var(--text-secondary);
          }
        `}
      </style>

      {/* Navigation Header */}
      <nav style={{
        background: 'var(--surface-dark)',
        border: 'none',
        padding: '15px 25px',
        display: 'flex',
        gap: '20px',
        justifyContent: 'space-between',
        alignItems: 'center',
        backdropFilter: 'blur(20px)',
        boxShadow: 'var(--shadow-dark), 0 1px 0 rgba(255, 255, 255, 0.05)',
        marginBottom: '25px',
        position: 'sticky',
        top: '0px',
        zIndex: '1000'
      }}>
        {/* Logo Section */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '15px' 
        }}>
          <img
            src={logo}
            alt="Logo"
            style={{
              height: '45px',
              width: 'auto',
              backdropFilter: 'blur(10px)',
              transition: 'transform 0.3s ease'
            }}
          />
        </div>
        
        {/* Navigation Buttons */}
        <div style={{ 
          display: 'flex', 
          gap: '12px', 
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          {navigationItems.map(item => 
            createNavButton(item, currentView === item.key)
          )}
        </div>

        {/* User Profile */}
        <UserProfile />
      </nav>

      {/* Status Bar */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.5)',
        padding: '8px 25px',
        fontSize: '0.75rem',
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
          USER: {user.name.toUpperCase()}
        </div>
        <div>
          STATUS: {isNavigating ? 'SWITCHING...' : 'READY'}
        </div>
      </div>

      {/* Content Area */}
      <main style={{ 
        padding: '0 25px',
        paddingBottom: '50px',
        minHeight: 'calc(100vh - 200px)'
      }}>
        {renderCurrentView()}
      </main>

      {/* Footer */}
      <footer style={{
        background: 'var(--surface-dark)',
        borderTop: '1px solid var(--border-light)',
        padding: '20px 25px',
        textAlign: 'center',
        fontSize: '0.8rem',
        color: 'var(--text-muted)',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
      }}>
        <div>
          DASHBOARD SUITE v2.1 • SECURED WITH GOOGLE OAUTH
        </div>
        <div style={{ marginTop: '5px', fontSize: '0.7rem' }}>
          USE ALT + 1-6 FOR QUICK NAVIGATION BETWEEN DASHBOARDS
        </div>
      </footer>
    </div>
  );
};

// Main App Component
function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

// App Content Component
const AppContent = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingComponent />;
  }

  return isAuthenticated ? <ProtectedDashboard /> : <LoginScreen />;
};

export default App;