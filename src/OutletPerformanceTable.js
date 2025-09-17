import React, { useState, useEffect } from 'react';
import './OutletPerformanceTable.css';

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