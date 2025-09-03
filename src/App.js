import React, { useState } from 'react';
import Dashboard from './Dashboard';
import logo from './ggg.png';

// Try to import ChecklistDashboard, fall back to placeholder if not found
let ChecklistDashboard;
try {
  ChecklistDashboard = require('./ChecklistDashboard').default;
} catch (error) {
  ChecklistDashboard = () => (
    <div style={{
      background: 'var(--surface-dark)',
      border: '1px solid var(--border-light)',
      padding: '50px',
      borderRadius: '20px',
      textAlign: 'center',
      margin: '20px',
      backdropFilter: 'blur(15px)',
      boxShadow: 'var(--shadow-dark)'
    }}>
      <h1 style={{
        color: 'var(--text-primary)',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
        textTransform: 'uppercase',
        letterSpacing: '2px',
        marginBottom: '20px'
      }}>
        CHECKLIST DASHBOARD
      </h1>
      <p style={{
        color: 'var(--text-secondary)',
        fontSize: '1.1rem',
        marginBottom: '15px',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
      }}>
        CHECKLISTDASHBOARD COMPONENT NOT FOUND
      </p>
      <p style={{
        color: 'var(--text-muted)',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
        fontSize: '0.9rem'
      }}>
        PLEASE CREATE: <code style={{
          background: 'var(--surface-light)',
          padding: '4px 8px',
          borderRadius: '6px',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-light)'
        }}>ChecklistDashboard.js</code>
      </p>
    </div>
  );
}

// Try to import HighRatedDashboard, fall back to placeholder if not found
let HighRatedDashboard;
try {
  HighRatedDashboard = require('./HighRatedDashboard').default;
} catch (error) {
  HighRatedDashboard = () => (
    <div style={{
      background: 'var(--surface-dark)',
      border: '1px solid var(--border-light)',
      padding: '50px',
      borderRadius: '20px',
      textAlign: 'center',
      margin: '20px',
      backdropFilter: 'blur(15px)',
      boxShadow: 'var(--shadow-dark)'
    }}>
      <h1 style={{
        color: 'var(--text-primary)',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
        textTransform: 'uppercase',
        letterSpacing: '2px',
        marginBottom: '20px'
      }}>
        OUTLET DASHBOARD
      </h1>
      <p style={{
        color: 'var(--text-secondary)',
        fontSize: '1.1rem',
        marginBottom: '15px',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
      }}>
        HIGHRATEDDASHBOARD COMPONENT NOT FOUND
      </p>
      <p style={{
        color: 'var(--text-muted)',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
        fontSize: '0.9rem'
      }}>
        PLEASE CREATE: <code style={{
          background: 'var(--surface-light)',
          padding: '4px 8px',
          borderRadius: '6px',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-light)'
        }}>HighRatedDashboard.js</code>
      </p>
    </div>
  );
}

// Try to import EmployeeDashboard, fall back to placeholder if not found
let EmployeeDashboard;
try {
  EmployeeDashboard = require('./EmployeeDashboard').default;
} catch (error) {
  EmployeeDashboard = () => (
    <div style={{
      background: 'var(--surface-dark)',
      border: '1px solid var(--border-light)',
      padding: '50px',
      borderRadius: '20px',
      textAlign: 'center',
      margin: '20px',
      backdropFilter: 'blur(15px)',
      boxShadow: 'var(--shadow-dark)'
    }}>
      <h1 style={{
        color: 'var(--text-primary)',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
        textTransform: 'uppercase',
        letterSpacing: '2px',
        marginBottom: '20px'
      }}>
        EMPLOYEE DASHBOARD
      </h1>
      <p style={{
        color: 'var(--text-secondary)',
        fontSize: '1.1rem',
        marginBottom: '15px',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
      }}>
        EMPLOYEEDASHBOARD COMPONENT NOT FOUND
      </p>
      <p style={{
        color: 'var(--text-muted)',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
        fontSize: '0.9rem'
      }}>
        PLEASE CREATE: <code style={{
          background: 'var(--surface-light)',
          padding: '4px 8px',
          borderRadius: '6px',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-light)'
        }}>EmployeeDashboard.js</code>
      </p>
    </div>
  );
}

// Try to import SwiggyDashboard, fall back to placeholder if not found
let SwiggyDashboard;
try {
  SwiggyDashboard = require('./SwiggyDashboard').default;
} catch (error) {
  SwiggyDashboard = () => (
    <div style={{
      background: 'var(--surface-dark)',
      border: '1px solid var(--border-light)',
      padding: '50px',
      borderRadius: '20px',
      textAlign: 'center',
      margin: '20px',
      backdropFilter: 'blur(15px)',
      boxShadow: 'var(--shadow-dark)'
    }}>
      <h1 style={{
        color: 'var(--text-primary)',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
        textTransform: 'uppercase',
        letterSpacing: '2px',
        marginBottom: '20px'
      }}>
        SWIGGY DASHBOARD
      </h1>
      <p style={{
        color: 'var(--text-secondary)',
        fontSize: '1.1rem',
        marginBottom: '15px',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace"
      }}>
        SWIGGYDASHBOARD COMPONENT NOT FOUND
      </p>
      <p style={{
        color: 'var(--text-muted)',
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
        fontSize: '0.9rem'
      }}>
        PLEASE CREATE: <code style={{
          background: 'var(--surface-light)',
          padding: '4px 8px',
          borderRadius: '6px',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-light)'
        }}>SwiggyDashboard.js</code>
      </p>
    </div>
  );
}

function App() {
  const [currentView, setCurrentView] = useState('dashboard');

  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'swiggy':
        return <SwiggyDashboard />;
      case 'outlet':
        return <HighRatedDashboard />;
      case 'employee':
        return <EmployeeDashboard />;
      case 'checklist':
        return <ChecklistDashboard />;
      default:
        return <Dashboard />;
    }
  };

  const createNavButton = (viewName, label, isActive) => {
    const buttonStyle = {
      background: isActive ? 'var(--border-light)' : 'var(--surface-light)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-light)',
      padding: '8px 16px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '0.85rem',
      transition: 'var(--transition)',
      transform: isActive ? 'translateY(-3px)' : 'translateY(0)',
      boxShadow: isActive ? 'var(--shadow-glow)' : 'none',
      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
      textTransform: 'uppercase',
      letterSpacing: '1px',
      backdropFilter: 'blur(10px)',
      position: 'relative',
      overflow: 'hidden'
    };

    const handleMouseEnter = (e) => {
      if (!isActive) {
        e.target.style.background = 'var(--border-light)';
        e.target.style.transform = 'translateY(-2px)';
        e.target.style.boxShadow = 'var(--shadow-glow)';
      }
    };

    const handleMouseLeave = (e) => {
      if (!isActive) {
        e.target.style.background = 'var(--surface-light)';
        e.target.style.transform = 'translateY(0)';
        e.target.style.boxShadow = 'none';
      }
    };

    return (
      <button
        key={viewName}
        onClick={() => setCurrentView(viewName)}
        style={buttonStyle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #000000 100%)',
      padding: '0',
      margin: '0',
      color: 'var(--text-primary)'
    }}>
      {/* Navigation Header */}
      <nav style={{
        background: 'var(--surface-dark)',
        border: 'none',
        padding: '10px 20px',
        display: 'flex',
        gap: '15px',
        justifyContent: 'space-between',
        alignItems: 'center',
        backdropFilter: 'blur(15px)',
        boxShadow: 'var(--shadow-dark)',
        marginBottom: '25px',
        position: 'sticky',
        top: '0px',
        zIndex: '100',
        backgroundImage: 'linear-gradient(var(--surface-dark), var(--surface-dark)), var(--primary-gradient)',
        backgroundOrigin: 'padding-box',
        backgroundClip: 'padding-box, border-box'
      }}>
        {/* Logo */}
        <img
          src={logo}
          alt="Logo"
          style={{
            height: '40px',
            width: 'auto',
            backdropFilter: 'blur(10px)'
          }}
        />
        
        {/* Navigation Buttons */}
        <div style={{ 
          display: 'flex', 
          gap: '15px', 
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          {createNavButton('dashboard', 'ZOMATO DB', currentView === 'dashboard')}
          {createNavButton('swiggy', 'SWIGGY DB', currentView === 'swiggy')}
          {createNavButton('outlet', 'OUTLET DB', currentView === 'outlet')}
          {createNavButton('employee', 'EMPLOYEE DB', currentView === 'employee')}
          {createNavButton('checklist', 'CHECKLISTS', currentView === 'checklist')}
        </div>
      </nav>

      {/* Content Area */}
      <div style={{ 
        padding: '0 20px',
        paddingBottom: '40px'
      }}>
        {renderCurrentView()}
      </div>
    </div>
  );
}

export default App;