import React, { useState, useEffect } from 'react';

// CSS styles embedded directly in the component
const styles = `
/* Custom Properties matching HighRatedDashboard */
:root {
  --outlet-primary: #ffffff;
  --outlet-secondary: #cccccc;
  --outlet-muted: #888888;
  --outlet-accent: #666666;
  --surface-dark: rgba(30, 30, 30, 0.95);
  --surface-light: rgba(255, 255, 255, 0.1);
  --border-light: rgba(255, 255, 255, 0.2);
  --text-primary: #ffffff;
  --text-secondary: #cccccc;
  --text-muted: #888888;
  --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --accent-gradient: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  --shadow-dark: 0 8px 32px rgba(0, 0, 0, 0.3);
  --shadow-glow: 0 0 30px rgba(255, 255, 255, 0.1);
  --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Main Container */
.outlet-performance-container {
  max-width: 1600px;
  margin: 0 auto;
  padding: 20px;
  background: transparent;
  color: var(--text-primary);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace;
}

/* Header */
.outlet-performance-header {
  background: var(--surface-dark);
  padding: 30px 35px;
  border-radius: 20px;
  border: 1px solid var(--border-light);
  backdrop-filter: blur(15px);
  box-shadow: var(--shadow-dark);
  margin-bottom: 30px;
  position: relative;
  overflow: hidden;
}

.outlet-performance-header::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--primary-gradient);
  opacity: 0.8;
}

.outlet-performance-header h1 {
  font-size: 2.2rem;
  font-weight: 700;
  margin: 0;
  background: var(--primary-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-transform: uppercase;
  letter-spacing: 2px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace;
}

/* Table Container */
.outlet-table-container {
  background: var(--surface-dark);
  border-radius: 20px;
  border: 1px solid var(--border-light);
  backdrop-filter: blur(15px);
  box-shadow: var(--shadow-dark);
  overflow: hidden;
  margin-bottom: 30px;
  position: relative;
}

.outlet-table-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--accent-gradient);
  opacity: 0.6;
}

/* Table Wrapper - NO HEIGHT RESTRICTION FOR FULL LENGTH */
.outlet-table-wrapper {
  overflow-x: auto;
  /* Removed max-height to show full table length */
  scrollbar-width: thin;
  scrollbar-color: var(--border-light) transparent;
}

.outlet-table-wrapper::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.outlet-table-wrapper::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.outlet-table-wrapper::-webkit-scrollbar-thumb {
  background: var(--border-light);
  border-radius: 4px;
  transition: var(--transition);
}

.outlet-table-wrapper::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* Table */
.outlet-performance-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace;
  font-size: 0.9rem;
  background: transparent;
}

/* Table Headers */
.outlet-performance-table thead {
  position: sticky;
  top: 0;
  z-index: 10;
}

.outlet-performance-table thead tr {
  background: var(--primary-gradient);
}

.outlet-performance-table th {
  padding: 18px 14px;
  text-align: left;
  font-weight: 600;
  color: #ffffff;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: 0.8rem;
  border-right: 1px solid rgba(255, 255, 255, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  position: relative;
  white-space: nowrap;
  min-width: 120px;
}

.outlet-performance-table th:last-child {
  border-right: none;
}

/* Header Background Colors */
.outlet-performance-table th.input-header {
  background: rgba(59, 130, 246, 0.3);
}

.outlet-performance-table th.calculated-header {
  background: rgba(245, 158, 11, 0.3);
}

.outlet-performance-table th.incentive-header {
  background: rgba(16, 185, 129, 0.3);
}

/* Table Body */
.outlet-performance-table tbody tr {
  transition: var(--transition);
  border-bottom: 1px solid var(--border-light);
}

.outlet-performance-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.05);
  transform: scale(1.002);
}

.outlet-performance-table tbody tr:nth-child(even) {
  background: rgba(255, 255, 255, 0.02);
}

.outlet-performance-table tbody tr:nth-child(even):hover {
  background: rgba(255, 255, 255, 0.07);
}

/* Table Cells */
.outlet-performance-table td {
  padding: 16px 14px;
  border-right: 1px solid var(--border-light);
  color: var(--text-secondary);
  font-weight: 400;
  vertical-align: middle;
  white-space: nowrap;
}

.outlet-performance-table td:last-child {
  border-right: none;
}

/* Cell Background Colors */
.outlet-performance-table td.input-cell {
  background: rgba(59, 130, 246, 0.05);
}

.outlet-performance-table td.calculated-cell {
  background: rgba(245, 158, 11, 0.05);
  font-weight: 500;
  color: var(--text-primary);
}

.outlet-performance-table td.incentive-cell {
  background: rgba(16, 185, 129, 0.05);
  font-weight: 500;
}

/* Input Fields */
.outlet-performance-input {
  width: 100%;
  max-width: 90px;
  padding: 10px 12px;
  background: var(--surface-light);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace;
  transition: var(--transition);
  text-align: center;
  backdrop-filter: blur(10px);
}

.outlet-performance-input:focus {
  outline: none;
  border-color: rgba(102, 126, 234, 0.6);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
  background: rgba(255, 255, 255, 0.15);
  transform: scale(1.02);
}

.outlet-performance-input::placeholder {
  color: var(--text-muted);
  opacity: 0.7;
}

/* Outlet Code and Name Cells */
.outlet-code-cell {
  font-weight: 700;
  color: var(--text-primary);
  background: rgba(102, 126, 234, 0.1);
  text-transform: uppercase;
}

.outlet-name-cell {
  font-weight: 600;
  color: var(--text-primary);
}

/* Date Cells */
.date-cell {
  color: var(--text-muted);
  font-size: 0.85rem;
}

/* Currency Cells */
.currency-positive {
  color: #10b981;
  font-weight: 600;
}

.currency-negative {
  color: #ef4444;
  font-weight: 600;
}

.currency-neutral {
  color: var(--text-primary);
  font-weight: 500;
}

/* Totals Row */
.outlet-performance-table .totals-row {
  background: var(--primary-gradient);
  font-weight: 700;
  color: #ffffff;
  border-top: 2px solid var(--border-light);
}

.outlet-performance-table .totals-row td {
  color: #ffffff;
  font-weight: 700;
  border-color: rgba(255, 255, 255, 0.3);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* Summary Cards */
.outlet-summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 25px;
  margin-top: 30px;
}

.outlet-summary-card {
  background: var(--surface-dark);
  border: 1px solid var(--border-light);
  border-radius: 20px;
  padding: 25px;
  backdrop-filter: blur(15px);
  box-shadow: var(--shadow-dark);
  transition: var(--transition);
  position: relative;
  overflow: hidden;
}

.outlet-summary-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  opacity: 0.8;
}

.outlet-summary-card.blue::before {
  background: linear-gradient(90deg, #3b82f6, #1e40af);
}

.outlet-summary-card.green::before {
  background: linear-gradient(90deg, #10b981, #059669);
}

.outlet-summary-card.purple::before {
  background: linear-gradient(90deg, #8b5cf6, #7c3aed);
}

.outlet-summary-card:hover {
  transform: translateY(-5px);
  box-shadow: var(--shadow-glow);
}

.outlet-summary-card h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 15px;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.outlet-summary-card p {
  font-size: 0.95rem;
  color: var(--text-secondary);
  margin: 0;
  font-weight: 500;
}

/* Responsive Design */
@media (max-width: 1200px) {
  .outlet-performance-table {
    font-size: 0.85rem;
  }
  
  .outlet-performance-table th,
  .outlet-performance-table td {
    padding: 14px 10px;
  }
  
  .outlet-performance-input {
    max-width: 80px;
    padding: 8px 10px;
  }
}

@media (max-width: 768px) {
  .outlet-performance-container {
    padding: 15px;
  }
  
  .outlet-performance-header h1 {
    font-size: 1.8rem;
  }
  
  .outlet-performance-table {
    font-size: 0.8rem;
  }
  
  .outlet-performance-table th,
  .outlet-performance-table td {
    padding: 12px 8px;
  }
  
  .outlet-performance-input {
    max-width: 70px;
    padding: 6px 8px;
    font-size: 0.8rem;
  }
  
  .outlet-summary-cards {
    grid-template-columns: 1fr;
  }
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = styles;
  if (!document.head.querySelector('style[data-outlet-performance]')) {
    styleElement.setAttribute('data-outlet-performance', 'true');
    document.head.appendChild(styleElement);
  }
}

const OutletPerformanceTable = () => {
  const [outlets] = useState([
    { code: 'BLN', name: 'Bellandur' },
    { code: 'HSR', name: 'HSR Layout' },
    { code: 'RR', name: 'Residency Road' },
    { code: 'WF', name: 'Whitefield' },
    { code: 'IND', name: 'Indiranagar' },
    { code: 'KOR', name: 'Koramangala' },
    { code: 'RAJ', name: 'Rajajinagar' },
    { code: 'ARK', name: 'Arekere' },
    { code: 'KLN', name: 'Kalyan Nagar' },
    { code: 'SKN', name: 'Sahakar Nagar' },
    { code: 'JAY', name: 'Jayanagar' }
  ]);

  const [data, setData] = useState(() => {
    const initialData = {};
    outlets.forEach(outlet => {
      initialData[outlet.code] = {
        totalOrders: '',
        totalLowRated: '',
        totalIGCC: '',
        highRatedOrders: ''
      };
    });
    return initialData;
  });

  const [calculations, setCalculations] = useState({});

  const handleInputChange = (outletCode, field, value) => {
    setData(prev => ({
      ...prev,
      [outletCode]: {
        ...prev[outletCode],
        [field]: value
      }
    }));
  };

  useEffect(() => {
    const newCalculations = {};
    let totalStats = {
      totalOrders: 0,
      totalErrors: 0,
      totalIncentive: 0,
      totalLowErrorDeduction: 0,
      totalSevenDaysIncentives: 0,
      totalPerDayIncentives: 0
    };

    outlets.forEach(outlet => {
      const outletData = data[outlet.code];
      const totalOrders = parseFloat(outletData.totalOrders) || 0;
      const totalLowRated = parseFloat(outletData.totalLowRated) || 0;
      const totalIGCC = parseFloat(outletData.totalIGCC) || 0;
      const highRatedOrders = parseFloat(outletData.highRatedOrders) || 0;

      // Calculate Total Errors
      const totalErrors = totalLowRated + totalIGCC;

      // Calculate Error Rate (as percentage)
      const errorRate = totalOrders > 0 ? (totalErrors / totalOrders) * 100 : 0;

      // Calculate High Rated Percentage
      const highRatedPercentage = totalOrders > 0 ? (highRatedOrders / totalOrders) * 100 : 0;

      // Calculate High Rated % - Error Rate %
      const highRatedMinusErrorRate = highRatedPercentage - errorRate;

      // Calculate Incentive Bonus
      let incentiveBonus = 0;
      let incentiveAmount = 0;
      let lowErrorDeduction = 0;

      if (errorRate > 2.00) {
        // If error rate is more than 2%, no incentives and no deductions
        incentiveBonus = 0;
        incentiveAmount = 0;
        lowErrorDeduction = 0;
      } else {
        // Normal incentive calculation for error rate <= 2%
        if (errorRate < 0.50) {
          incentiveBonus = 50;
        } else if (errorRate < 1.00) {
          incentiveBonus = 40;
        } else if (errorRate < 1.50) {
          incentiveBonus = 30;
        } else if (errorRate < 2.00) {
          incentiveBonus = 20;
        }

        incentiveAmount = incentiveBonus * highRatedOrders;
        
        // Calculate Low Error Deduction (only if error rate <= 2%)
        lowErrorDeduction = -1 * (totalErrors * 30);
      }

      // Calculate 7 Days Incentives
      const sevenDaysIncentives = incentiveAmount + lowErrorDeduction;

      // Calculate Per Day Incentives
      const perDayIncentives = sevenDaysIncentives / 7;

      newCalculations[outlet.code] = {
        totalErrors,
        errorRate,
        highRatedPercentage,
        highRatedMinusErrorRate,
        incentive: incentiveAmount,
        lowErrorDeduction,
        sevenDaysIncentives,
        perDayIncentives
      };

      // Add to totals
      totalStats.totalOrders += totalOrders;
      totalStats.totalErrors += totalErrors;
      totalStats.totalIncentive += incentiveAmount;
      totalStats.totalLowErrorDeduction += lowErrorDeduction;
      totalStats.totalSevenDaysIncentives += sevenDaysIncentives;
      totalStats.totalPerDayIncentives += perDayIncentives;
    });

    // Calculate overall stats
    const overallErrorRate = totalStats.totalOrders > 0 ? (totalStats.totalErrors / totalStats.totalOrders) * 100 : 0;
    const overallHighRatedPercentage = totalStats.totalOrders > 0 ? 
      (outlets.reduce((sum, outlet) => sum + (parseFloat(data[outlet.code].highRatedOrders) || 0), 0) / totalStats.totalOrders) * 100 : 0;

    newCalculations.TOTAL = {
      totalErrors: totalStats.totalErrors,
      errorRate: overallErrorRate,
      highRatedPercentage: overallHighRatedPercentage,
      highRatedMinusErrorRate: overallHighRatedPercentage - overallErrorRate,
      incentive: totalStats.totalIncentive,
      lowErrorDeduction: totalStats.totalLowErrorDeduction,
      sevenDaysIncentives: totalStats.totalSevenDaysIncentives,
      perDayIncentives: totalStats.totalPerDayIncentives
    };

    setCalculations(newCalculations);
  }, [data, outlets]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatPercentage = (value) => {
    return `${value.toFixed(2)}%`;
  };

  const getTotalForField = (field) => {
    return outlets.reduce((sum, outlet) => {
      return sum + (parseFloat(data[outlet.code][field]) || 0);
    }, 0);
  };

  const getCurrencyClass = (amount) => {
    if (amount > 0) return 'currency-positive';
    if (amount < 0) return 'currency-negative';
    return 'currency-neutral';
  };

  return (
    <div className="outlet-performance-container">
      <div className="outlet-performance-header">
        <h1>Outlet Performance Tracker</h1>
      </div>

      <div className="outlet-table-container">
        <div className="outlet-table-wrapper">
          <table className="outlet-performance-table">
            <thead>
              <tr>
                <th className="date-header">Start Date</th>
                <th className="date-header">End Date</th>
                <th className="outlet-header">Outlet Code</th>
                <th className="outlet-header">Outlet Name</th>
                <th className="input-header">Total Orders</th>
                <th className="input-header">Total Low Rated</th>
                <th className="input-header">Total IGCC</th>
                <th className="calculated-header">Total Errors</th>
                <th className="calculated-header">Error Rate</th>
                <th className="input-header">High Rated Orders</th>
                <th className="calculated-header">High Rated %</th>
                <th className="calculated-header">High Rated % - Error Rate %</th>
                <th className="incentive-header">Incentive</th>
                <th className="incentive-header">Low Error Deduction</th>
                <th className="incentive-header">7 Days Incentives</th>
                <th className="incentive-header">Per Day Incentives</th>
              </tr>
            </thead>
            <tbody>
              {outlets.map((outlet, index) => {
                const calc = calculations[outlet.code] || {};
                return (
                  <tr key={outlet.code}>
                    <td className="date-cell">01/09/2025</td>
                    <td className="date-cell">07/09/2025</td>
                    <td className="outlet-code-cell">{outlet.code}</td>
                    <td className="outlet-name-cell">{outlet.name}</td>
                    <td className="input-cell">
                      <input
                        type="number"
                        value={data[outlet.code].totalOrders}
                        onChange={(e) => handleInputChange(outlet.code, 'totalOrders', e.target.value)}
                        className="outlet-performance-input"
                        placeholder="0"
                      />
                    </td>
                    <td className="input-cell">
                      <input
                        type="number"
                        value={data[outlet.code].totalLowRated}
                        onChange={(e) => handleInputChange(outlet.code, 'totalLowRated', e.target.value)}
                        className="outlet-performance-input"
                        placeholder="0"
                      />
                    </td>
                    <td className="input-cell">
                      <input
                        type="number"
                        value={data[outlet.code].totalIGCC}
                        onChange={(e) => handleInputChange(outlet.code, 'totalIGCC', e.target.value)}
                        className="outlet-performance-input"
                        placeholder="0"
                      />
                    </td>
                    <td className="calculated-cell">{calc.totalErrors || 0}</td>
                    <td className="calculated-cell">{formatPercentage(calc.errorRate || 0)}</td>
                    <td className="input-cell">
                      <input
                        type="number"
                        value={data[outlet.code].highRatedOrders}
                        onChange={(e) => handleInputChange(outlet.code, 'highRatedOrders', e.target.value)}
                        className="outlet-performance-input"
                        placeholder="0"
                      />
                    </td>
                    <td className="calculated-cell">{formatPercentage(calc.highRatedPercentage || 0)}</td>
                    <td className="calculated-cell">{formatPercentage(calc.highRatedMinusErrorRate || 0)}</td>
                    <td className={`incentive-cell ${getCurrencyClass(calc.incentive || 0)}`}>
                      {formatCurrency(calc.incentive || 0)}
                    </td>
                    <td className={`incentive-cell ${getCurrencyClass(calc.lowErrorDeduction || 0)}`}>
                      {formatCurrency(calc.lowErrorDeduction || 0)}
                    </td>
                    <td className={`incentive-cell ${getCurrencyClass(calc.sevenDaysIncentives || 0)}`}>
                      {formatCurrency(calc.sevenDaysIncentives || 0)}
                    </td>
                    <td className={`incentive-cell ${getCurrencyClass(calc.perDayIncentives || 0)}`}>
                      {formatCurrency(calc.perDayIncentives || 0)}
                    </td>
                  </tr>
                );
              })}
              
              {/* Totals Row */}
              <tr className="totals-row">
                <td className="date-cell">01/09/2025</td>
                <td className="date-cell">07/09/2025</td>
                <td>TOTAL</td>
                <td>All Outlets</td>
                <td>{getTotalForField('totalOrders')}</td>
                <td>{getTotalForField('totalLowRated')}</td>
                <td>{getTotalForField('totalIGCC')}</td>
                <td>{calculations.TOTAL?.totalErrors || 0}</td>
                <td>{formatPercentage(calculations.TOTAL?.errorRate || 0)}</td>
                <td>{getTotalForField('highRatedOrders')}</td>
                <td>{formatPercentage(calculations.TOTAL?.highRatedPercentage || 0)}</td>
                <td>{formatPercentage(calculations.TOTAL?.highRatedMinusErrorRate || 0)}</td>
                <td className={getCurrencyClass(calculations.TOTAL?.incentive || 0)}>
                  {formatCurrency(calculations.TOTAL?.incentive || 0)}
                </td>
                <td className={getCurrencyClass(calculations.TOTAL?.lowErrorDeduction || 0)}>
                  {formatCurrency(calculations.TOTAL?.lowErrorDeduction || 0)}
                </td>
                <td className={getCurrencyClass(calculations.TOTAL?.sevenDaysIncentives || 0)}>
                  {formatCurrency(calculations.TOTAL?.sevenDaysIncentives || 0)}
                </td>
                <td className={getCurrencyClass(calculations.TOTAL?.perDayIncentives || 0)}>
                  {formatCurrency(calculations.TOTAL?.perDayIncentives || 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="outlet-summary-cards">
        <div className="outlet-summary-card blue">
          <h3>Total Summary</h3>
          <p>Overall Error Rate: {formatPercentage(calculations.TOTAL?.errorRate || 0)}</p>
        </div>
        
        <div className="outlet-summary-card green">
          <h3>Total Incentives</h3>
          <p>7 Days: {formatCurrency(calculations.TOTAL?.sevenDaysIncentives || 0)}</p>
        </div>
        
        <div className="outlet-summary-card purple">
          <h3>Daily Average</h3>
          <p>Per Day: {formatCurrency(calculations.TOTAL?.perDayIncentives || 0)}</p>
        </div>
      </div>
    </div>
  );
};

export default OutletPerformanceTable;