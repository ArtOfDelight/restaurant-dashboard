import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './ChecklistDashboard.css';

const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

// ✨ NEW: Auto-detect standalone mode
const isStandaloneMode = () => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('view') === 'checklist';
};

// ✨ NEW: Use public endpoints in standalone mode
const getAPIEndpoint = (endpoint) => {
  const standalone = isStandaloneMode();
  if (standalone) {
    // Replace /api/ with /api/public- for standalone mode
    return endpoint.replace('/api/checklist-', '/api/public-checklist-');
  }
  return endpoint;
};

// Helper functions
const formatDateForDisplay = (dateStr) => {
  if (!dateStr) return '';
  
  try {
    if (dateStr.includes('-')) {
      return dateStr;
    }
    
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.getFullYear() + '-' + 
             String(date.getMonth() + 1).padStart(2, '0') + '-' + 
             String(date.getDate()).padStart(2, '0');
    }
    
    return dateStr;
  } catch (error) {
    return dateStr;
  }
};

// Transform functions for debug endpoint (unchanged)
const transformDebugSubmissions = (rawSubmissions) => {
  if (!rawSubmissions || rawSubmissions.length <= 1) return [];
  
  const dataRows = rawSubmissions.slice(1);
  
  return dataRows.map((row, index) => {
    const safeRow = Array.isArray(row) ? row : [];
    
    return {
      submissionId: safeRow[0] || `SUB-${index + 1}`,
      date: formatDateForDisplay(safeRow[0] || safeRow[1] || ''),
      timeSlot: safeRow[2] || 'Unknown',
      outlet: safeRow[3] || 'Unknown Outlet', 
      submittedBy: safeRow[4] || 'Unknown User',
      timestamp: safeRow[5] || '',
    };
  }).filter(submission => {
    const hasAnyData = submission.outlet !== 'Unknown Outlet' || 
                       submission.submittedBy !== 'Unknown User' || 
                       submission.date || 
                       submission.timeSlot !== 'Unknown';
    return hasAnyData;
  });
};

const transformDebugResponses = (rawResponses) => {
  if (!rawResponses || rawResponses.length <= 1) return [];
  
  const dataRows = rawResponses.slice(1);
  
  return dataRows.map((row, index) => {
    const safeRow = Array.isArray(row) ? row : [];
    
    return {
      submissionId: safeRow[0] || `AUTO-${index + 1}`,
      question: (safeRow[1] || '').toString().trim(),
      answer: (safeRow[2] || '').toString().trim(),
      image: safeRow[3] || '',
      imageCode: safeRow[4] || '',
    };
  }).filter(response => {
    const hasContent = response.question || response.answer || response.submissionId.startsWith('AUTO-') === false;
    return hasContent;
  });
};

// NEW: Checklist Report Generator Component
const ChecklistReportGenerator = ({ selectedDate }) => {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [activeReportTab, setActiveReportTab] = useState('completed');

  const generateReport = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_URL}/api/checklist-generate-report`,
        { params: { date: selectedDate } }
      );
      
      if (response.data.success) {
        setReportData(response.data.report);
        setShowModal(true);
        setActiveReportTab('completed'); // Reset to first tab
      }
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Failed to generate report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = async (format = 'csv') => {
    try {
      const response = await axios.get(
        `${API_URL}/api/checklist-download-report`,
        {
          params: { date: selectedDate, format },
          responseType: format === 'csv' ? 'blob' : 'json'
        }
      );

      if (format === 'csv') {
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `checklist-report-${selectedDate}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } else {
        const dataStr = JSON.stringify(response.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = window.URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `checklist-report-${selectedDate}.json`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error downloading report:', error);
      alert('Failed to download report. Please try again.');
    }
  };

  return (
    <>
      {/* Generate Report Button */}
      <button
        onClick={generateReport}
        disabled={loading}
        className="generate-report-btn"
        style={{
          padding: '12px 24px',
          backgroundColor: loading ? '#9ca3af' : '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          transition: 'all 0.2s'
        }}
      >
        {loading ? (
          <>
            <span className="loading-spinner" style={{
              width: '16px',
              height: '16px',
              border: '2px solid white',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></span>
            Generating...
          </>
        ) : (
          <>
            <span>📊</span>
            Generate Report
          </>
        )}
      </button>

      {/* Report Modal */}
      {showModal && reportData && (
        <div 
          className="report-modal-overlay"
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
        >
          <div 
            className="report-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              maxWidth: '1200px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(to right, #2563eb, #1d4ed8)',
              color: 'white',
              padding: '24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>
                  Checklist Completion Report
                </h2>
                <p style={{ fontSize: '14px', opacity: 0.9, marginTop: '4px' }}>
                  Date: {new Date(selectedDate).toLocaleDateString('en-IN', { 
                    day: '2-digit', month: 'short', year: 'numeric' 
                  })}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  color: 'white',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  cursor: 'pointer',
                  fontSize: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.3)'}
                onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {/* Summary Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
                marginBottom: '24px'
              }}>
                <div style={{
                  background: 'linear-gradient(to bottom right, #dcfce7, #bbf7d0)',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid #86efac'
                }}>
                  <div style={{ color: '#16a34a', fontSize: '12px', fontWeight: '500' }}>Completed</div>
                  <div style={{ color: '#15803d', fontSize: '32px', fontWeight: 'bold', marginTop: '4px' }}>
                    {reportData.summary.completedOutlets}
                  </div>
                  <div style={{ color: '#16a34a', fontSize: '11px', marginTop: '4px' }}>
                    {((reportData.summary.completedOutlets / reportData.summary.totalOutlets) * 100).toFixed(0)}% of total
                  </div>
                </div>

                <div style={{
                  background: 'linear-gradient(to bottom right, #fef9c3, #fef08a)',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid #fde047'
                }}>
                  <div style={{ color: '#ca8a04', fontSize: '12px', fontWeight: '500' }}>Partial</div>
                  <div style={{ color: '#a16207', fontSize: '32px', fontWeight: 'bold', marginTop: '4px' }}>
                    {reportData.summary.partialOutlets}
                  </div>
                  <div style={{ color: '#ca8a04', fontSize: '11px', marginTop: '4px' }}>Need attention</div>
                </div>

                <div style={{
                  background: 'linear-gradient(to bottom right, #fee2e2, #fecaca)',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid #fca5a5'
                }}>
                  <div style={{ color: '#dc2626', fontSize: '12px', fontWeight: '500' }}>Pending</div>
                  <div style={{ color: '#b91c1c', fontSize: '32px', fontWeight: 'bold', marginTop: '4px' }}>
                    {reportData.summary.pendingOutlets}
                  </div>
                  <div style={{ color: '#dc2626', fontSize: '11px', marginTop: '4px' }}>Not started</div>
                </div>

                <div style={{
                  background: 'linear-gradient(to bottom right, #dbeafe, #bfdbfe)',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid #93c5fd'
                }}>
                  <div style={{ color: '#2563eb', fontSize: '12px', fontWeight: '500' }}>Overall Rate</div>
                  <div style={{ color: '#1d4ed8', fontSize: '32px', fontWeight: 'bold', marginTop: '4px' }}>
                    {reportData.summary.overallCompletionRate}%
                  </div>
                  <div style={{ color: '#2563eb', fontSize: '11px', marginTop: '4px' }}>
                    {reportData.summary.totalEmployeesSubmitted} employees
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ borderBottom: '1px solid #e5e7eb', marginBottom: '16px' }}>
                <nav style={{ display: 'flex', gap: '16px' }}>
                  {['completed', 'partial', 'pending', 'employees'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveReportTab(tab)}
                      style={{
                        padding: '8px 16px',
                        fontSize: '14px',
                        fontWeight: '500',
                        border: 'none',
                        background: 'none',
                        borderBottom: `2px solid ${activeReportTab === tab ? '#2563eb' : 'transparent'}`,
                        color: activeReportTab === tab ? '#2563eb' : '#6b7280',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Tab Content */}
              <ReportTabContent
                activeTab={activeReportTab}
                completed={reportData.completed}
                partial={reportData.partial}
                pending={reportData.pending}
                employeeReport={reportData.employeeReport}
                employeesNotSubmitted={reportData.employeesNotSubmitted}
              />
            </div>

            {/* Modal Footer */}
            <div style={{
              backgroundColor: '#f9fafb',
              padding: '16px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid #e5e7eb'
            }}>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Generated: {new Date(reportData.summary.reportGeneratedAt).toLocaleString('en-IN')}
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => downloadReport('csv')}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#16a34a',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span>📥</span>
                  Download CSV
                </button>
                <button
                  onClick={() => downloadReport('json')}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span>💾</span>
                  Download JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Add this new component after ChecklistReportGenerator component

// NEW: Weekly Report Generator Component
const WeeklyReportGenerator = () => {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');

  const generateWeeklyReport = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/checklist-weekly-report`);
      
      if (response.data.success) {
        setReportData(response.data.report);
        setShowModal(true);
        setActiveTab('summary');
      }
    } catch (error) {
      console.error('Error generating weekly report:', error);
      alert('Failed to generate weekly report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const downloadWeeklyReport = async (format = 'csv') => {
    try {
      const response = await axios.get(
        `${API_URL}/api/checklist-download-weekly-report`,
        {
          params: { format },
          responseType: format === 'csv' ? 'blob' : 'json'
        }
      );

      if (format === 'csv') {
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        const filename = `weekly-report-${new Date().toISOString().split('T')[0]}.csv`;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } else {
        const dataStr = JSON.stringify(response.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = window.URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        const filename = `weekly-report-${new Date().toISOString().split('T')[0]}.json`;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error downloading weekly report:', error);
      alert('Failed to download report. Please try again.');
    }
  };

  return (
    <>
      {/* Weekly Report Button */}
      <button
        onClick={generateWeeklyReport}
        disabled={loading}
        style={{
          padding: '12px 24px',
          backgroundColor: loading ? '#9ca3af' : '#8b5cf6',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => !loading && (e.target.style.backgroundColor = '#7c3aed')}
        onMouseLeave={(e) => !loading && (e.target.style.backgroundColor = '#8b5cf6')}
      >
        {loading ? (
          <>
            <span className="loading-spinner" style={{
              width: '16px',
              height: '16px',
              border: '2px solid white',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></span>
            Generating...
          </>
        ) : (
          <>
            <span>📅</span>
            Weekly Report
          </>
        )}
      </button>

      {/* Weekly Report Modal */}
      {showModal && reportData && (
        <div 
          className="report-modal-overlay"
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
        >
          <div 
            className="report-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              maxWidth: '1400px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(to right, #8b5cf6, #7c3aed)',
              color: 'white',
              padding: '24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>
                  📅 Weekly Checklist Report
                </h2>
                <p style={{ fontSize: '14px', opacity: 0.9, marginTop: '4px' }}>
                  {reportData.summary.reportPeriod.startDate} to {reportData.summary.reportPeriod.endDate} 
                  ({reportData.summary.reportPeriod.totalDays} days)
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  color: 'white',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  cursor: 'pointer',
                  fontSize: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {/* Summary Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
                marginBottom: '24px'
              }}>
                <div style={{
                  background: 'linear-gradient(to bottom right, #ddd6fe, #c4b5fd)',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid #a78bfa'
                }}>
                  <div style={{ color: '#6d28d9', fontSize: '12px', fontWeight: '500' }}>Avg Weekly Completion</div>
                  <div style={{ color: '#5b21b6', fontSize: '32px', fontWeight: 'bold', marginTop: '4px' }}>
                    {reportData.summary.avgWeeklyCompletion}%
                  </div>
                  <div style={{ color: '#6d28d9', fontSize: '11px', marginTop: '4px' }}>
                    Across {reportData.summary.totalOutlets} outlets
                  </div>
                </div>

                <div style={{
                  background: 'linear-gradient(to bottom right, #dbeafe, #bfdbfe)',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid #93c5fd'
                }}>
                  <div style={{ color: '#2563eb', fontSize: '12px', fontWeight: '500' }}>Total Submissions</div>
                  <div style={{ color: '#1d4ed8', fontSize: '32px', fontWeight: 'bold', marginTop: '4px' }}>
                    {reportData.summary.totalSubmissions}
                  </div>
                  <div style={{ color: '#2563eb', fontSize: '11px', marginTop: '4px' }}>
                    By {reportData.summary.totalEmployees} employees
                  </div>
                </div>

                <div style={{
                  background: 'linear-gradient(to bottom right, #dcfce7, #bbf7d0)',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid #86efac'
                }}>
                  <div style={{ color: '#16a34a', fontSize: '12px', fontWeight: '500' }}>Top Performer</div>
                  <div style={{ color: '#15803d', fontSize: '18px', fontWeight: 'bold', marginTop: '4px' }}>
                    {reportData.summary.topPerformers[0]?.outletCode || 'N/A'}
                  </div>
                  <div style={{ color: '#16a34a', fontSize: '11px', marginTop: '4px' }}>
                    {reportData.summary.topPerformers[0]?.rate || '0'}% completion
                  </div>
                </div>

                <div style={{
                  background: 'linear-gradient(to bottom right, #fef9c3, #fef08a)',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid #fde047'
                }}>
                  <div style={{ color: '#ca8a04', fontSize: '12px', fontWeight: '500' }}>Most Active</div>
                  <div style={{ color: '#a16207', fontSize: '14px', fontWeight: 'bold', marginTop: '4px' }}>
                    {reportData.summary.mostActiveEmployee?.name || 'N/A'}
                  </div>
                  <div style={{ color: '#ca8a04', fontSize: '11px', marginTop: '4px' }}>
                    {reportData.summary.mostActiveEmployee?.totalSubmissions || 0} submissions
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ borderBottom: '1px solid #e5e7eb', marginBottom: '16px' }}>
                <nav style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {['summary', 'daily', 'outlets', 'employees'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        padding: '8px 16px',
                        fontSize: '14px',
                        fontWeight: '500',
                        border: 'none',
                        background: 'none',
                        borderBottom: `2px solid ${activeTab === tab ? '#8b5cf6' : 'transparent'}`,
                        color: activeTab === tab ? '#8b5cf6' : '#6b7280',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Tab Content */}
              <WeeklyReportTabContent
                activeTab={activeTab}
                reportData={reportData}
              />
            </div>

            {/* Modal Footer */}
            <div style={{
              backgroundColor: '#f9fafb',
              padding: '16px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid #e5e7eb'
            }}>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Generated: {new Date().toLocaleString('en-IN')}
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => downloadWeeklyReport('csv')}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#16a34a',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span>📥</span>
                  Download CSV
                </button>
                <button
                  onClick={() => downloadWeeklyReport('json')}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span>💾</span>
                  Download JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// NEW: Weekly Report Tab Content Component
const WeeklyReportTabContent = ({ activeTab, reportData }) => {
  if (activeTab === 'summary') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Top Performers */}
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', marginBottom: '12px' }}>
            🏆 Top Performers
          </h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            {reportData.summary.topPerformers.map((outlet, idx) => (
              <div key={idx} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                backgroundColor: '#dcfce7',
                border: '1px solid #86efac',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ 
                    fontSize: '24px', 
                    fontWeight: 'bold',
                    color: idx === 0 ? '#fbbf24' : idx === 1 ? '#9ca3af' : '#cd7f32'
                  }}>
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                  </span>
                  <div>
                    <div style={{ fontWeight: '600', color: '#1f2937' }}>{outlet.outletCode}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{outlet.outletName}</div>
                  </div>
                </div>
                <div style={{
                  padding: '4px 12px',
                  backgroundColor: '#16a34a',
                  color: 'white',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: '600'
                }}>
                  {outlet.rate}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Performers */}
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', marginBottom: '12px' }}>
            ⚠️ Needs Improvement
          </h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            {reportData.summary.bottomPerformers.map((outlet, idx) => (
              <div key={idx} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                backgroundColor: '#fee2e2',
                border: '1px solid #fca5a5',
                borderRadius: '8px'
              }}>
                <div>
                  <div style={{ fontWeight: '600', color: '#1f2937' }}>{outlet.outletCode}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>{outlet.outletName}</div>
                </div>
                <div style={{
                  padding: '4px 12px',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: '600'
                }}>
                  {outlet.rate}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'daily') {
    return (
      <div>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', marginBottom: '12px' }}>
          📈 Daily Average Completion
        </h3>
        <div style={{ display: 'grid', gap: '8px' }}>
          {reportData.summary.dailyAverages.map((day, idx) => (
            <div key={idx} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              backgroundColor: '#f3f4f6',
              borderRadius: '8px',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ fontWeight: '600', color: '#1f2937', minWidth: '100px' }}>
                  {new Date(day.date).toLocaleDateString('en-IN', { 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </div>
                <div style={{ 
                  fontSize: '12px', 
                  color: '#6b7280',
                  padding: '2px 8px',
                  backgroundColor: '#fff',
                  borderRadius: '4px'
                }}>
                  {day.dayName}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '200px',
                  height: '8px',
                  backgroundColor: '#e5e7eb',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${day.avgCompletion}%`,
                    height: '100%',
                    backgroundColor: parseFloat(day.avgCompletion) >= 80 ? '#16a34a' : 
                                     parseFloat(day.avgCompletion) >= 50 ? '#f59e0b' : '#dc2626',
                    transition: 'width 0.3s'
                  }}></div>
                </div>
                <div style={{ 
                  fontWeight: '600', 
                  color: '#1f2937',
                  minWidth: '50px',
                  textAlign: 'right'
                }}>
                  {day.avgCompletion}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activeTab === 'outlets') {
    return (
      <div>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', marginBottom: '12px' }}>
          🏪 Outlet Weekly Performance
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            fontSize: '14px'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6' }}>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>Outlet</th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>Type</th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>Completion</th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>Slots</th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>Consistency</th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>Best Day</th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>Worst Day</th>
              </tr>
            </thead>
            <tbody>
              {reportData.outletDetails
                .sort((a, b) => parseFloat(b.weeklyCompletionRate) - parseFloat(a.weeklyCompletionRate))
                .map((outlet, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: '600', color: '#1f2937' }}>{outlet.outletCode}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{outlet.outletName}</div>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <span style={{
                      padding: '2px 8px',
                      backgroundColor: outlet.outletType === 'Cloud Kitchen' ? '#dbeafe' : '#fef3c7',
                      color: outlet.outletType === 'Cloud Kitchen' ? '#1e40af' : '#92400e',
                      borderRadius: '4px',
                      fontSize: '11px'
                    }}>
                      {outlet.outletType}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 8px',
                      backgroundColor: parseFloat(outlet.weeklyCompletionRate) >= 80 ? '#dcfce7' : 
                                       parseFloat(outlet.weeklyCompletionRate) >= 50 ? '#fef9c3' : '#fee2e2',
                      color: parseFloat(outlet.weeklyCompletionRate) >= 80 ? '#15803d' : 
                             parseFloat(outlet.weeklyCompletionRate) >= 50 ? '#a16207' : '#b91c1c',
                      borderRadius: '4px',
                      fontWeight: '600'
                    }}>
                      {outlet.weeklyCompletionRate}%
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#6b7280' }}>
                    {outlet.completedSlots}/{outlet.totalSlots}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <span style={{ fontWeight: '500', color: '#6b7280' }}>
                      {outlet.consistencyScore}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: '12px' }}>
                    <div>{new Date(outlet.bestDay?.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</div>
                    <div style={{ color: '#16a34a', fontWeight: '600' }}>{outlet.bestDay?.rate}%</div>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: '12px' }}>
                    <div>{new Date(outlet.worstDay?.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</div>
                    <div style={{ color: '#dc2626', fontWeight: '600' }}>{outlet.worstDay?.rate}%</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeTab === 'employees') {
    return (
      <div>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', marginBottom: '12px' }}>
          👥 Employee Performance ({reportData.employeeReport.length} employees)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          {reportData.employeeReport.map((emp, idx) => (
            <div key={idx} style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '16px',
              backgroundColor: idx < 3 ? '#dbeafe' : '#f9fafb'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontWeight: '600', color: '#1f2937', fontSize: '16px' }}>
                    {idx < 3 && <span style={{ marginRight: '4px' }}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                    </span>}
                    {emp.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                    Avg: {emp.avgDailySubmissions} submissions/day
                  </div>
                </div>
                <div style={{
                  padding: '4px 12px',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: '600'
                }}>
                  {emp.totalSubmissions}
                </div>
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                <div style={{ fontWeight: '500', marginBottom: '4px' }}>Outlets covered:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {emp.outletsCovered.map((outlet, oidx) => (
                    <span 
                      key={oidx}
                      style={{
                        padding: '2px 6px',
                        backgroundColor: 'white',
                        border: '1px solid #d1d5db',
                        borderRadius: '3px',
                        fontSize: '11px'
                      }}
                    >
                      {outlet}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

// NEW: Report Tab Content Component
const ReportTabContent = ({ 
  activeTab, 
  completed, 
  partial, 
  pending, 
  employeeReport, 
  employeesNotSubmitted 
}) => {
  if (activeTab === 'completed') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {completed.map((outlet, index) => (
          <div key={index} style={{
            border: '1px solid #86efac',
            borderRadius: '8px',
            padding: '16px',
            backgroundColor: '#dcfce7'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
                  {outlet.outletName}
                </h3>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>
                  {outlet.outletCode} • {outlet.outletType}
                </span>
              </div>
              <span style={{
                padding: '4px 12px',
                backgroundColor: '#16a34a',
                color: 'white',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '500'
              }}>
                100% Complete
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {outlet.timeSlotStatus.map((slot, idx) => (
                <div key={idx} style={{
                  backgroundColor: 'white',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid #86efac'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '500', color: '#1f2937' }}>{slot.timeSlot}</span>
                    <span style={{ color: '#16a34a', fontSize: '18px' }}>✓</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    <div>By: {slot.submittedBy}</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>{slot.formattedTime}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {completed.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px', color: '#6b7280' }}>
            No outlets have completed all checklists yet.
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'partial') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {partial.map((outlet, index) => (
          <div key={index} style={{
            border: '1px solid #fde047',
            borderRadius: '8px',
            padding: '16px',
            backgroundColor: '#fef9c3'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
                  {outlet.outletName}
                </h3>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>
                  {outlet.outletCode} • {outlet.outletType}
                </span>
              </div>
              <span style={{
                padding: '4px 12px',
                backgroundColor: '#ca8a04',
                color: 'white',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '500'
              }}>
                {outlet.completionPercentage}% Complete
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {outlet.timeSlotStatus.map((slot, idx) => (
                <div 
                  key={idx} 
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    border: `1px solid ${slot.status === 'Completed' ? '#86efac' : '#d1d5db'}`,
                    backgroundColor: slot.status === 'Completed' ? '#dcfce7' : 'white'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '500', color: '#1f2937' }}>{slot.timeSlot}</span>
                    {slot.status === 'Completed' ? (
                      <span style={{ color: '#16a34a', fontSize: '18px' }}>✓</span>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: '18px' }}>✗</span>
                    )}
                  </div>
                  {slot.status === 'Completed' ? (
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      <div>By: {slot.submittedBy}</div>
                      <div style={{ fontSize: '11px', color: '#9ca3af' }}>{slot.formattedTime}</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: '500' }}>Not Submitted</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {partial.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px', color: '#6b7280' }}>
            No partially completed outlets.
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'pending') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {pending.map((outlet, index) => (
          <div key={index} style={{
            border: '1px solid #fca5a5',
            borderRadius: '8px',
            padding: '16px',
            backgroundColor: '#fee2e2'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
                  {outlet.outletName}
                </h3>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>
                  {outlet.outletCode} • {outlet.outletType}
                </span>
              </div>
              <span style={{
                padding: '4px 12px',
                backgroundColor: '#dc2626',
                color: 'white',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '500'
              }}>
                0% Complete
              </span>
            </div>
            <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #fca5a5' }}>
              <div style={{ fontSize: '14px', fontWeight: '500', color: '#1f2937', marginBottom: '8px' }}>
                Missing Submissions:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {outlet.missingSlots.map((slot, idx) => (
                  <span 
                    key={idx}
                    style={{
                      padding: '4px 12px',
                      backgroundColor: '#fee2e2',
                      color: '#b91c1c',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}
                  >
                    {slot}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
        {pending.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px', color: '#6b7280' }}>
            No pending outlets - all have at least started!
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'employees') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Employees Who Submitted */}
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', marginBottom: '12px' }}>
            Employees Who Submitted ({employeeReport.length})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
            {employeeReport.map((emp, index) => (
              <div key={index} style={{
                border: '1px solid #93c5fd',
                borderRadius: '8px',
                padding: '16px',
                backgroundColor: '#dbeafe'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ fontWeight: '600', color: '#1f2937' }}>{emp.name}</div>
                  <span style={{
                    padding: '2px 8px',
                    backgroundColor: '#2563eb',
                    color: 'white',
                    borderRadius: '10px',
                    fontSize: '11px'
                  }}>
                    {emp.totalSubmissions} submissions
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  <div style={{ fontWeight: '500', marginBottom: '4px' }}>Outlets covered:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {[...new Set(emp.submissions.map(s => s.outlet))].map((outlet, idx) => (
                      <span 
                        key={idx}
                        style={{
                          padding: '2px 6px',
                          backgroundColor: 'white',
                          border: '1px solid #93c5fd',
                          borderRadius: '3px',
                          fontSize: '10px'
                        }}
                      >
                        {outlet}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Employees Who Haven't Submitted */}
        {employeesNotSubmitted.length > 0 && (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#dc2626', marginBottom: '12px' }}>
              Employees Who Haven't Submitted ({employeesNotSubmitted.length})
            </h3>
            <div style={{
              border: '1px solid #fca5a5',
              borderRadius: '8px',
              padding: '16px',
              backgroundColor: '#fee2e2'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                {employeesNotSubmitted.map((emp, index) => (
                  <div 
                    key={index}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'white',
                      border: '1px solid #fca5a5',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#1f2937'
                    }}
                  >
                    {emp}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};

// Checklist Completion Tracker Component (unchanged from your original)
const ChecklistCompletionTracker = ({ REACT_APP_API_BASE_URL }) => {
  const [completionData, setCompletionData] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterOutletType, setFilterOutletType] = useState('All');

  // Define standard time slot order
  const TIME_SLOT_ORDER = ['Morning', 'Mid Day', 'Closing'];
  
  // WHITELIST: Only these outlet codes are allowed
  const ALLOWED_OUTLET_CODES = ['RR', 'KOR', 'JAY', 'SKN', 'RAJ', 'KLN', 'BLN', 'WF', 'HSR', 'ARK', 'IND', 'CK'];

  const loadCompletionData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const baseUrl = API_URL;

      // Fetch completion status
      const completionResponse = await fetch(
        `${baseUrl}/api/checklist-completion-status?date=${selectedDate}`
      );
      const completionResult = await completionResponse.json();

      if (!completionResult.success) {
        throw new Error(completionResult.error || 'Failed to fetch completion data');
      }

      // Fetch summary
      const summaryResponse = await fetch(
        `${baseUrl}/api/checklist-completion-summary?date=${selectedDate}`
      );
      const summaryResult = await summaryResponse.json();

      if (!summaryResult.success) {
        throw new Error(summaryResult.error || 'Failed to fetch summary data');
      }

      // Sort completion data time slots according to standard order
      const sortedCompletionData = completionResult.data.map(outlet => ({
        ...outlet,
        timeSlotStatus: sortTimeSlotsByOrder(outlet.timeSlotStatus, TIME_SLOT_ORDER)
      }));

      // FILTER OUTLETS: Only include whitelisted outlet codes
      const filteredCompletionData = sortedCompletionData.filter(outlet => {
        // Must have outlet code
        if (!outlet.outletCode || !outlet.outletCode.trim()) {
          console.log(`Excluding outlet without code: ${outlet.outletName}`);
          return false;
        }
        
        // Must be in whitelist
        const outletCode = outlet.outletCode.trim().toUpperCase();
        if (!ALLOWED_OUTLET_CODES.includes(outletCode)) {
          console.log(`Excluding outlet not in whitelist: ${outletCode}`);
          return false;
        }
        
        console.log(`✅ Including whitelisted outlet: ${outletCode}`);
        return true;
      });

      // Sort by status first, then by whitelist order
      filteredCompletionData.sort((a, b) => {
        const statusOrder = { 'Pending': 2, 'Partial': 1, 'Completed': 0 };
        const statusA = statusOrder[a.overallStatus] || 3;
        const statusB = statusOrder[b.overallStatus] || 3;

        if (statusA !== statusB) {
          return statusA - statusB;
        }

        const indexA = ALLOWED_OUTLET_CODES.indexOf(a.outletCode.toUpperCase());
        const indexB = ALLOWED_OUTLET_CODES.indexOf(b.outletCode.toUpperCase());
        return indexA - indexB;
      });

      setCompletionData(filteredCompletionData);

      // Update summary to reflect filtered count
      const updatedSummary = {
        ...summaryResult.summary,
        totalOutlets: filteredCompletionData.length,
        completedOutlets: filteredCompletionData.filter(o => o.overallStatus === 'Completed').length,
        partialOutlets: filteredCompletionData.filter(o => o.overallStatus === 'Partial').length,
        pendingOutlets: filteredCompletionData.filter(o => o.overallStatus === 'Pending').length,
        overallCompletionRate: filteredCompletionData.length > 0 ? 
          ((filteredCompletionData.filter(o => o.overallStatus === 'Completed').length / filteredCompletionData.length) * 100).toFixed(1) : '0.0'
      };

      setSummaryData(updatedSummary);

      console.log(`✅ Loaded completion data for ${filteredCompletionData.length} whitelisted outlets (filtered from ${completionResult.data.length})`);
      console.log(`Whitelisted outlets found: ${filteredCompletionData.map(o => o.outletCode).join(', ')}`);

    } catch (err) {
      setError(`Failed to load completion data: ${err.message}`);
      console.error('Error loading completion data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // Helper function to sort time slots by standard order
  const sortTimeSlotsByOrder = (timeSlots, order) => {
    return timeSlots.sort((a, b) => {
      const indexA = order.indexOf(a.timeSlot);
      const indexB = order.indexOf(b.timeSlot);
      
      // If slot not found in order, put it at the end
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      
      return indexA - indexB;
    });
  };

  useEffect(() => {
    loadCompletionData();
  }, [loadCompletionData]);

  const getFilteredData = () => {
    return completionData.filter(outlet => {
      const statusMatch = filterStatus === 'All' || outlet.overallStatus === filterStatus;
      const typeMatch = filterOutletType === 'All' || outlet.outletType === filterOutletType;
      return statusMatch && typeMatch;
    });
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Completed': return '✅';
      case 'Partial': return '⚠️';
      case 'Pending': return '❌';
      default: return '❓';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed': return '#10b981';
      case 'Partial': return '#f59e0b';
      case 'Pending': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const formatLastSubmission = (timestamp) => {
    if (!timestamp) return 'No submissions';
    try {
      return new Date(timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return 'Invalid time';
    }
  };

  // Helper function to display outlet name (ONLY show outlet codes)
  const getOutletDisplayName = (outlet) => {
    if (outlet.outletCode && outlet.outletCode.trim()) {
      return outlet.outletCode.trim().toUpperCase();
    }
    return 'No Code'; // Fallback for outlets without codes
  };

  // Helper function to get completion status text for each time slot
  const getTimeSlotCompletionText = (timeSlotStatus) => {
    const completedSlots = [];
    const pendingSlots = [];
    
    // Sort by our standard order
    const sortedSlots = sortTimeSlotsByOrder(timeSlotStatus, TIME_SLOT_ORDER);
    
    sortedSlots.forEach(slot => {
      if (slot.status === 'Completed') {
        completedSlots.push(slot.timeSlot);
      } else {
        pendingSlots.push(slot.timeSlot);
      }
    });
    
    if (completedSlots.length === 0) {
      return 'None Completed';
    } else if (pendingSlots.length === 0) {
      return 'All Completed';
    } else {
      return `${completedSlots.join(', ')} ✓`;
    }
  };

  const filteredData = getFilteredData();
  const uniqueOutletTypes = [...new Set(completionData.map(o => o.outletType).filter(Boolean))];

  if (loading) {
    return (
      <div className="completion-tracker-loading">
        <div className="loading-spinner"></div>
        <p>Loading checklist completion status...</p>
      </div>
    );
  }

  return (
    <div className="checklist-completion-tracker">
      <div className="completion-header">
        <h2>📋 Checklist Completion Status</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Daily Report Button */}
          <ChecklistReportGenerator selectedDate={selectedDate} />
          
          {/* Weekly Report Button */}
          <WeeklyReportGenerator />
          
          {/* Refresh Button */}
          <button onClick={loadCompletionData} className="refresh-btn">
            🔄 Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="completion-error">
          <h3>❌ Error: {error}</h3>
          <p>Please check your server connection or contact support.</p>
          <button onClick={loadCompletionData} className="retry-btn">
            🔄 Retry
          </button>
        </div>
      )}

      {/* NEW: Total Scheduled Staff Summary Card */}
      {summaryData && summaryData.totalScheduledEmployees !== undefined && (
        <div className="roster-summary-card" style={{
          backgroundColor: '#f3f4f6',
          padding: '16px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '2px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <span style={{ fontSize: '24px' }}>👥</span>
            <div>
              <strong style={{ fontSize: '16px', color: '#374151' }}>Total Scheduled Staff Today</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#6b7280' }}>
                Employees assigned across all outlets and time slots
              </p>
            </div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#7c3aed', textAlign: 'center', marginTop: '8px' }}>
            {summaryData.totalScheduledEmployees}
          </div>
        </div>
      )}

      {/* Time Slot Summary Cards */}
      {completionData && (
        <div className="completion-summary">
          {TIME_SLOT_ORDER.map(timeSlot => {
            const completedCount = completionData.filter(outlet => 
              outlet.timeSlotStatus.some(ts => ts.timeSlot === timeSlot && ts.status === 'Completed')
            ).length;
            const totalCount = completionData.length;
            const completionRate = totalCount > 0 ? ((completedCount / totalCount) * 100).toFixed(1) : '0.0';
            
            return (
              <div key={timeSlot} className="summary-card">
                <div className="summary-number">{completedCount}/{totalCount}</div>
                <div className="summary-label">{timeSlot}</div>
                <div className="summary-percentage">{completionRate}%</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="completion-filters">
        <div className="filter-group">
          <label>Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="All">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Partial">Partial</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Outlet Type</label>
          <select
            value={filterOutletType}
            onChange={(e) => setFilterOutletType(e.target.value)}
          >
            <option value="All">All Types</option>
            {uniqueOutletTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Completion Table */}
      <div className="completion-table-container">
        <table className="completion-table">
          <thead>
            <tr>
              <th>Outlet Code</th>
              <th>Type</th>
              <th>Overall Status</th>
              <th>Time Slots</th>
              <th>Scheduled Staff</th>
              <th>Completed Slots</th>
              <th>Last Submission</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((outlet, index) => (
              <tr key={index} className={`status-${outlet.overallStatus.toLowerCase()}`}>
                <td>
                  <div className="outlet-info">
                    <strong>{getOutletDisplayName(outlet)}</strong>
                    {outlet.isCloudDays && <span className="cloud-badge">☁️ Cloud</span>}
                  </div>
                </td>
                <td>{outlet.outletType || 'N/A'}</td>
                <td>
                  <div className="status-cell">
                    <span 
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(outlet.overallStatus) }}
                    >
                      {getStatusIcon(outlet.overallStatus)} {outlet.overallStatus}
                    </span>
                  </div>
                </td>
                <td>
                  <div className="time-slots">
                    {outlet.timeSlotStatus.map((slot, idx) => (
                      <div key={idx} style={{ marginBottom: '8px' }}>
                        <span
                          className={`time-slot-badge ${slot.status.toLowerCase()}`}
                          title={`${slot.timeSlot}: ${slot.status}${slot.submittedBy ? ` by ${slot.submittedBy}` : ''}`}
                        >
                          {slot.timeSlot} {slot.status === 'Completed' ? '✓' : '✗'}
                        </span>
                        {/* NEW: Show scheduled employees under each time slot */}
                        {slot.scheduledEmployees && slot.scheduledEmployees.length > 0 && (
                          <div style={{ 
                            fontSize: '11px', 
                            color: '#6b7280', 
                            marginTop: '4px',
                            paddingLeft: '8px'
                          }}>
                            👥 {slot.scheduledEmployees.map(emp => emp.id || emp.name).join(', ')}
                            {slot.scheduledEmployees[0]?.startTime && (
                              <div style={{ fontSize: '10px', fontStyle: 'italic' }}>
                                ⏰ {slot.scheduledEmployees[0].startTime} - {slot.scheduledEmployees[0].endTime}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </td>
                {/* NEW: Scheduled Staff Column */}
                <td>
                  {outlet.allScheduledEmployees && outlet.allScheduledEmployees.length > 0 ? (
                    <div style={{ fontSize: '12px' }}>
                      <strong style={{ color: '#7c3aed' }}>{outlet.totalScheduledEmployees}</strong> staff
                      <div style={{ 
                        marginTop: '4px', 
                        fontSize: '11px', 
                        color: '#6b7280',
                        maxHeight: '60px',
                        overflow: 'auto'
                      }}>
                        {outlet.allScheduledEmployees.map((emp, i) => (
                          <span key={i} style={{ 
                            display: 'inline-block',
                            backgroundColor: '#f3f4f6',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            margin: '2px'
                          }}>
                            {emp.id || emp.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: '#9ca3af', fontSize: '12px' }}>No staff scheduled</span>
                  )}
                </td>
                <td>
                  <div className="completion-text">
                    <span className="completion-status-text">
                      {getTimeSlotCompletionText(outlet.timeSlotStatus)}
                    </span>
                    <small className="completion-percentage-small">
                      ({outlet.completionPercentage}%)
                    </small>
                  </div>
                </td>
                <td>
                  <div className="last-submission">
                    {formatLastSubmission(outlet.lastSubmissionTime)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredData.length === 0 && (
          <div className="no-completion-data">
            <div className="no-data-icon">📋</div>
            <h3>No outlets match your filters</h3>
            <p>Try adjusting your filters or selecting a different date.</p>
          </div>
        )}
      </div>

      {/* Debug Info for Whitelisted Outlets */}
      <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '5px', fontSize: '12px', color: '#666' }}>
        <strong>Whitelisted Outlets:</strong> {ALLOWED_OUTLET_CODES.join(', ')} ({ALLOWED_OUTLET_CODES.length} total)
        <br />
        <strong>Currently Displayed:</strong> {filteredData.map(o => o.outletCode).join(', ')} ({filteredData.length} found)
        <br />
        <strong>Missing Outlets:</strong> {ALLOWED_OUTLET_CODES.filter(code => !filteredData.some(o => o.outletCode.toUpperCase() === code)).join(', ') || 'None'}
      </div>
    </div>
  );
};

// Main ChecklistDashboard Component (rest of your original code continues...)
const ChecklistDashboard = () => {
  const [submissions, setSubmissions] = useState([]);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    date: '',
    outlet: '',
    timeSlot: '',
    employee: '',
  });
  const [expandedSubmission, setExpandedSubmission] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [activeTab, setActiveTab] = useState('submissions');

  const [filterOptions, setFilterOptions] = useState({
    outlets: [],
    employees: [],
    timeSlots: ['Morning', 'Mid Day', 'Closing'],
  });

  const updateFilterOptions = useCallback((submissionsData) => {
    const outlets = [...new Set(submissionsData.map(s => s.outlet).filter(Boolean))];
    const employees = [...new Set(submissionsData.map(s => s.submittedBy).filter(Boolean))];
    
    setFilterOptions(prev => ({
      ...prev,
      outlets: outlets.sort(),
      employees: employees.sort(),
      timeSlots: ['Morning', 'Mid Day', 'Closing'],
    }));
  }, []);

  const loadChecklistData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const fetchWithValidation = async (url) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      try {
        const response = await fetch(url, { 
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text();
          throw new Error(`Server returned non-JSON response: ${text.slice(0, 500)}`);
        }
        
        return response.json();
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          throw new Error('Request timed out');
        }
        throw err;
      }
    };

    const fetchWithRetry = async (url, retries = 3, delay = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          return await fetchWithValidation(url);
        } catch (err) {
          if (i < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw err;
        }
      }
    };

    try {
      const baseUrl = API_URL;
      const mainEndpoint = `${baseUrl}/api/checklist-data`;
      const debugEndpoint = `${baseUrl}/api/debug-checklist`;

      let data;
      try {
        data = await fetchWithRetry(mainEndpoint);
      } catch (mainError) {
        const debugData = await fetchWithRetry(debugEndpoint);
        if (debugData.success) {
          data = {
            success: true,
            submissions: transformDebugSubmissions(debugData.submissionsData),
            responses: transformDebugResponses(debugData.responsesData),
          };
        } else {
          throw new Error(`Debug endpoint error: ${debugData.error || 'Unknown error'}`);
        }
      }

      if (data.success) {
        const submissionsArray = Array.isArray(data.submissions) ? data.submissions : [];
        const responsesArray = Array.isArray(data.responses) ? data.responses : [];
        
        try {
          localStorage.setItem('cachedSubmissions', JSON.stringify(submissionsArray));
          localStorage.setItem('cachedResponses', JSON.stringify(responsesArray));
          localStorage.setItem('cacheTimestamp', new Date().toISOString());
        } catch (cacheErr) {
          console.warn('Failed to cache data:', cacheErr.message);
        }

        setSubmissions(submissionsArray);
        setResponses(responsesArray);
        updateFilterOptions(submissionsArray);
      } else {
        throw new Error(data.error || 'API returned error');
      }
    } catch (err) {
      setError(`Failed to load data: ${err.message}. Please check the server or try again.`);
      
      try {
        const cachedSubmissions = localStorage.getItem('cachedSubmissions');
        const cachedResponses = localStorage.getItem('cachedResponses');
        const cacheTimestamp = localStorage.getItem('cacheTimestamp');
        
        if (cachedSubmissions && cachedResponses) {
          const parsedSubmissions = JSON.parse(cachedSubmissions);
          const parsedResponses = JSON.parse(cachedResponses);
          
          if (Array.isArray(parsedSubmissions) && Array.isArray(parsedResponses)) {
            setSubmissions(parsedSubmissions);
            setResponses(parsedResponses);
            updateFilterOptions(parsedSubmissions);
            setError(`Using cached data from ${cacheTimestamp ? new Date(cacheTimestamp).toLocaleString() : 'unknown time'}. ${err.message}`);
          }
        }
      } catch (cacheErr) {
        console.warn('Failed to load cached data:', cacheErr.message);
        setSubmissions([]);
        setResponses([]);
      }
      
      setFilterOptions({
        outlets: [],
        employees: [],
        timeSlots: ['Morning', 'Mid Day', 'Closing'],
      });
    } finally {
      setLoading(false);
    }
  }, [updateFilterOptions]);

  useEffect(() => {
    try {
      const cachedSubmissions = localStorage.getItem('cachedSubmissions');
      const cachedResponses = localStorage.getItem('cachedResponses');
      if (cachedSubmissions && cachedResponses) {
        const parsedSubmissions = JSON.parse(cachedSubmissions);
        const parsedResponses = JSON.parse(cachedResponses);
        if (Array.isArray(parsedSubmissions) && Array.isArray(parsedResponses)) {
          setSubmissions(parsedSubmissions);
          setResponses(parsedResponses);
          updateFilterOptions(parsedSubmissions);
        }
      }
    } catch (cacheErr) {
      console.warn('Failed to load cached data:', cacheErr.message);
    }
    loadChecklistData();
    const interval = setInterval(loadChecklistData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadChecklistData, updateFilterOptions]);

  const getFilteredSubmissions = () => {
    return submissions.filter(submission => {
      return (
        (!filters.date || submission.date === filters.date) &&
        (!filters.outlet || submission.outlet === filters.outlet) &&
        (!filters.timeSlot || submission.timeSlot === filters.timeSlot) &&
        (!filters.employee || submission.submittedBy === filters.employee)
      );
    });
  };

  const getSubmissionResponses = (submissionId) => {
    return responses.filter(response => response.submissionId === submissionId);
  };

  const toggleSubmissionDetails = (submissionId) => {
    setExpandedSubmission(
      expandedSubmission === submissionId ? null : submissionId
    );
  };

  const clearAllFilters = () => {
    setFilters({ date: '', outlet: '', timeSlot: '', employee: '' });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (e) {
      return dateStr;
    }
  };

  const formatTime = (timestampStr) => {
    if (!timestampStr) return 'N/A';
    try {
      return new Date(timestampStr).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return timestampStr;
    }
  };

  const getTimeSlotEmoji = (timeSlot) => {
    const emojis = {
      'Morning': '🌅',
      'Mid Day': '☀️',
      'Closing': '🌙',
    };
    return emojis[timeSlot] || '📋';
  };

  const getImageUrl = (imageLink) => {
    if (!imageLink || !imageLink.trim()) return null;
    
    const baseUrl = API_URL;
    
    if (imageLink.startsWith('/api/image-proxy/')) {
      return `${baseUrl}${imageLink}`;
    }
    
    if (imageLink.startsWith('http') && imageLink.includes('/api/image-proxy/')) {
      return imageLink;
    }
    
    if (imageLink.startsWith('http')) {
      const fileIdMatch = imageLink.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
      if (fileIdMatch) {
        return `${baseUrl}/api/image-proxy/${fileIdMatch[1]}`;
      }
    }
    
    if (imageLink.match(/^[a-zA-Z0-9-_]+$/)) {
      return `${baseUrl}/api/image-proxy/${imageLink}`;
    }
    
    return null;
  };

  const filteredSubmissions = getFilteredSubmissions();
  const stats = {
    total: submissions.length,
    today: submissions.filter(s => s.date === new Date().toISOString().split('T')[0]).length,
    outlets: new Set(submissions.map(s => s.outlet).filter(Boolean)).size,
    images: responses.filter(r => r.image && r.image.trim()).length,
  };

  if (loading) {
    return (
      <div className="checklist-loading">
        <div className="loading-spinner"></div>
        <p>Loading checklist data...</p>
      </div>
    );
  }

  return (
    <div className="checklist-dashboard">
      <div className="checklist-header">
        <h1>Checklist Management System</h1>
        <button onClick={loadChecklistData} className="refresh-btn">
          🔄 Refresh
        </button>
      </div>

      {error && (
        <div className="checklist-error">
          <h3>❌ Error: {error}</h3>
          <p>Please check your server connection or contact support if the issue persists.</p>
          <button onClick={loadChecklistData} className="retry-btn">
            🔄 Retry
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button 
          className={`tab-button ${activeTab === 'submissions' ? 'active' : ''}`}
          onClick={() => setActiveTab('submissions')}
        >
          📝 Submissions & Responses
        </button>
        <button 
          className={`tab-button ${activeTab === 'completion' ? 'active' : ''}`}
          onClick={() => setActiveTab('completion')}
        >
          📊 Completion Status
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'submissions' && (
        <div className="tab-content">
          <div className="checklist-stats">
            <div className="stat-card">
              <div className="stat-number">{stats.total}</div>
              <div className="stat-label">Total Submissions</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stats.today}</div>
              <div className="stat-label">Today's Submissions</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stats.outlets}</div>
              <div className="stat-label">Active Outlets</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stats.images}</div>
              <div className="stat-label">Images</div>
            </div>
          </div>

          {submissions.length > 0 && (
            <div className="checklist-filters">
              <div className="filter-group">
                <label>Date</label>
                <input
                  type="date"
                  value={filters.date}
                  onChange={(e) => setFilters(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div className="filter-group">
                <label>Outlet</label>
                <select
                  value={filters.outlet}
                  onChange={(e) => setFilters(prev => ({ ...prev, outlet: e.target.value }))}
                >
                  <option value="">All Outlets</option>
                  {filterOptions.outlets.map(outlet => (
                    <option key={outlet} value={outlet}>{outlet}</option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <label>Time Slot</label>
                <select
                  value={filters.timeSlot}
                  onChange={(e) => setFilters(prev => ({ ...prev, timeSlot: e.target.value }))}
                >
                  <option value="">All Slots</option>
                  {filterOptions.timeSlots.map(slot => (
                    <option key={slot} value={slot}>{slot}</option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <label>Employee</label>
                <select
                  value={filters.employee}
                  onChange={(e) => setFilters(prev => ({ ...prev, employee: e.target.value }))}
                >
                  <option value="">All Employees</option>
                  {filterOptions.employees.map(employee => (
                    <option key={employee} value={employee}>{employee}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {submissions.length > 0 && (filters.date || filters.outlet || filters.timeSlot || filters.employee) && (
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <button 
                onClick={clearAllFilters}
                style={{
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                🧹 Clear All Filters
              </button>
            </div>
          )}

          <div className="submissions-list">
            {!error && submissions.length === 0 ? (
              <div className="no-data">
                <div className="no-data-icon">📭</div>
                <h3>No checklist submissions found</h3>
                <p>No checklist data is available in your Google Sheets yet.</p>
                <button onClick={loadChecklistData} className="refresh-btn">
                  🔄 Refresh Data
                </button>
              </div>
            ) : filteredSubmissions.length === 0 && submissions.length > 0 ? (
              <div className="no-data">
                <div className="no-data-icon">🔍</div>
                <h3>No submissions match your filters</h3>
                <p>Try adjusting or clearing your filters above.</p>
                <button onClick={clearAllFilters} className="refresh-btn">
                  🧹 Clear Filters
                </button>
              </div>
            ) : (
              filteredSubmissions
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .map(submission => (
                  <SubmissionCard
                    key={submission.submissionId}
                    submission={submission}
                    responses={getSubmissionResponses(submission.submissionId)}
                    isExpanded={expandedSubmission === submission.submissionId}
                    onToggle={() => toggleSubmissionDetails(submission.submissionId)}
                    onImageClick={setSelectedImage}
                    formatDate={formatDate}
                    formatTime={formatTime}
                    getTimeSlotEmoji={getTimeSlotEmoji}
                    getImageUrl={getImageUrl}
                  />
                ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'completion' && (
        <div className="tab-content">
          <ChecklistCompletionTracker API_URL={API_URL} />
        </div>
      )}

      {selectedImage && (
        <div className="image-modal" onClick={() => setSelectedImage(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button 
              className="close-btn" 
              onClick={() => setSelectedImage(null)}
            >
              ×
            </button>
            <img src={selectedImage} alt="Checklist Response" />
          </div>
        </div>
      )}
    </div>
  );
};

// SubmissionCard Component (unchanged)
const SubmissionCard = ({ 
  submission, 
  responses, 
  isExpanded, 
  onToggle, 
  onImageClick,
  formatDate,
  formatTime,
  getTimeSlotEmoji,
  getImageUrl,
}) => {
  return (
    <div className="submission-card">
      <div className="submission-header">
        <div className="submission-info">
          <h3>
            {getTimeSlotEmoji(submission.timeSlot)} {submission.outlet} - {submission.timeSlot}
          </h3>
          <div className="submission-meta">
            <span className="submission-date">{formatDate(submission.date)}</span>
            <span className="submission-time">{formatTime(submission.timestamp)}</span>
            <span className="submission-employee">{submission.submittedBy}</span>
          </div>
        </div>
        <button 
          className={`responses-btn ${isExpanded ? 'expanded' : ''}`}
          onClick={onToggle}
        >
          {isExpanded ? '▲' : '▼'} Responses ({responses.length})
        </button>
      </div>

      <div className="submission-details">
        <div className="detail-item">
          <span className="detail-label">Submission ID:</span>
          <span className="detail-value">{submission.submissionId}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Date:</span>
          <span className="detail-value">{formatDate(submission.date)}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Time Slot:</span>
          <span className="detail-value">{submission.timeSlot}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Outlet:</span>
          <span className="detail-value">{submission.outlet}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Submitted By:</span>
          <span className="detail-value">{submission.submittedBy}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Timestamp:</span>
          <span className="detail-value">{formatTime(submission.timestamp)}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="responses-section">
          <h4>Checklist Responses</h4>
          <div className="responses-grid">
            {responses.map((response) => (
              <ResponseItem
                key={`${response.submissionId}-${response.question}`}
                response={response}
                onImageClick={onImageClick}
                getImageUrl={getImageUrl}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ResponseItem Component (unchanged)
const ResponseItem = ({ response, onImageClick, getImageUrl }) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  
  const imageUrl = getImageUrl(response.image);

  const handleImageError = () => {
    setImageError(true);
    setImageLoading(false);
  };

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
  };

  return (
    <div className="response-item">
      <div className="response-question">{response.question}</div>
      <div className="response-answer">
        {response.answer === 'Image Required' && imageUrl ? (
          <div className="image-response">
            <span className="answer-badge image-badge">📷 Image Uploaded</span>
            <div className="image-container">
              {imageLoading && !imageError && (
                <div className="image-loading">Loading image...</div>
              )}
              {!imageError && (
                <img
                  src={imageUrl}
                  alt="Response"
                  className="response-image"
                  onClick={() => onImageClick(imageUrl)}
                  onError={handleImageError}
                  onLoad={handleImageLoad}
                  style={{ display: imageLoading ? 'none' : 'block' }}
                />
              )}
              {imageError && (
                <div className="image-error">
                  🖼️ Image unavailable
                  <br />
                  <small style={{ fontSize: '0.7rem', color: '#666' }}>
                    URL: {imageUrl}
                  </small>
                </div>
              )}
            </div>
          </div>
        ) : response.answer === 'Yes' ? (
          <span className="answer-badge yes-badge">✅ Yes</span>
        ) : response.answer === 'No' ? (
          <span className="answer-badge no-badge">❌ No</span>
        ) : (
          <span className="answer-badge">{response.answer}</span>
        )}
      </div>
    </div>
  );
};

export default ChecklistDashboard;