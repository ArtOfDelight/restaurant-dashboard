import React, { useState, useEffect, useCallback } from 'react';
import './ChecklistDashboard.css';

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
      const baseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
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
  }, [loadChecklistData]);

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
      'Morning': '',
      'Mid Day': '',
      'Closing': '',
    };
    return emojis[timeSlot] || '';
  };

  const getImageUrl = (imageLink) => {
    if (!imageLink || !imageLink.trim()) return null;
    
    const baseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
    
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
        <h1>Checklist Submissions</h1>
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

// SubmissionCard and ResponseItem components remain unchanged
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