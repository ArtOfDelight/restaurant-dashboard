import React, { useState, useEffect } from 'react';
import { Building2, Calculator, TrendingUp } from 'lucide-react';

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

  return (
    <div className="w-full p-6 bg-white">
      <div className="flex items-center gap-2 mb-6">
        <Building2 className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-800">Outlet Performance Tracker</h1>
      </div>

      <div className="overflow-x-auto shadow-lg rounded-lg">
        <table className="min-w-full bg-white border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                Start Date
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                End Date
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                Outlet Code
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                Outlet Name
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b bg-blue-50">
                Total Orders
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b bg-blue-50">
                Total Low Rated
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b bg-blue-50">
                Total IGCC
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b bg-yellow-50">
                Total Errors
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b bg-yellow-50">
                Error Rate
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b bg-blue-50">
                High Rated Orders
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b bg-yellow-50">
                High Rated %
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b bg-yellow-50">
                High Rated % - Error Rate %
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b bg-green-50">
                Incentive
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b bg-green-50">
                Low Error Deduction
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b bg-green-50">
                7 Days Incentives
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b bg-green-50">
                Per Day Incentives
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {outlets.map((outlet, index) => {
              const calc = calculations[outlet.code] || {};
              return (
                <tr key={outlet.code} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 border-r">01/09/2025</td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 border-r">07/09/2025</td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-r">{outlet.code}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 border-r">{outlet.name}</td>
                  <td className="px-3 py-2 whitespace-nowrap border-r">
                    <input
                      type="number"
                      value={data[outlet.code].totalOrders}
                      onChange={(e) => handleInputChange(outlet.code, 'totalOrders', e.target.value)}
                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap border-r">
                    <input
                      type="number"
                      value={data[outlet.code].totalLowRated}
                      onChange={(e) => handleInputChange(outlet.code, 'totalLowRated', e.target.value)}
                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap border-r">
                    <input
                      type="number"
                      value={data[outlet.code].totalIGCC}
                      onChange={(e) => handleInputChange(outlet.code, 'totalIGCC', e.target.value)}
                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 border-r bg-yellow-50">{calc.totalErrors || 0}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 border-r bg-yellow-50">{formatPercentage(calc.errorRate || 0)}</td>
                  <td className="px-3 py-2 whitespace-nowrap border-r">
                    <input
                      type="number"
                      value={data[outlet.code].highRatedOrders}
                      onChange={(e) => handleInputChange(outlet.code, 'highRatedOrders', e.target.value)}
                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 border-r bg-yellow-50">{formatPercentage(calc.highRatedPercentage || 0)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 border-r bg-yellow-50">{formatPercentage(calc.highRatedMinusErrorRate || 0)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-green-600 border-r bg-green-50">{formatCurrency(calc.incentive || 0)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-red-600 border-r bg-green-50">{formatCurrency(calc.lowErrorDeduction || 0)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-blue-600 border-r bg-green-50 font-medium">{formatCurrency(calc.sevenDaysIncentives || 0)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-blue-600 bg-green-50 font-medium">{formatCurrency(calc.perDayIncentives || 0)}</td>
                </tr>
              );
            })}
            
            {/* Totals Row */}
            <tr className="bg-blue-100 font-bold border-t-2 border-blue-300">
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 border-r">01/09/2025</td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 border-r">07/09/2025</td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 border-r">TOTAL</td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 border-r">All Outlets</td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 border-r">{getTotalForField('totalOrders')}</td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 border-r">{getTotalForField('totalLowRated')}</td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 border-r">{getTotalForField('totalIGCC')}</td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 border-r">{calculations.TOTAL?.totalErrors || 0}</td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 border-r">{formatPercentage(calculations.TOTAL?.errorRate || 0)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 border-r">{getTotalForField('highRatedOrders')}</td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 border-r">{formatPercentage(calculations.TOTAL?.highRatedPercentage || 0)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 border-r">{formatPercentage(calculations.TOTAL?.highRatedMinusErrorRate || 0)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-green-600 border-r">{formatCurrency(calculations.TOTAL?.incentive || 0)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-red-600 border-r">{formatCurrency(calculations.TOTAL?.lowErrorDeduction || 0)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-blue-600 border-r">{formatCurrency(calculations.TOTAL?.sevenDaysIncentives || 0)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-blue-600">{formatCurrency(calculations.TOTAL?.perDayIncentives || 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-blue-700">Total Summary</h3>
          </div>
          <p className="text-sm text-blue-600 mt-1">
            Overall Error Rate: {formatPercentage(calculations.TOTAL?.errorRate || 0)}
          </p>
        </div>
        
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            <h3 className="font-semibold text-green-700">Total Incentives</h3>
          </div>
          <p className="text-sm text-green-600 mt-1">
            7 Days: {formatCurrency(calculations.TOTAL?.sevenDaysIncentives || 0)}
          </p>
        </div>
        
        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-purple-600" />
            <h3 className="font-semibold text-purple-700">Daily Average</h3>
          </div>
          <p className="text-sm text-purple-600 mt-1">
            Per Day: {formatCurrency(calculations.TOTAL?.perDayIncentives || 0)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default OutletPerformanceTable;