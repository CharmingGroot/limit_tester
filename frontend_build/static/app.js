// 토스 스타일 바닐라 JavaScript
let ws, wsId;
let sessions = [];
let isResultsExpanded = false;

// DOM 요소들
const form = document.getElementById('testForm');
const sessionsDiv = document.getElementById('sessions');
const concurrencyInput = document.getElementById('concurrency');
const concurrencyDisplay = document.getElementById('concurrencyDisplay');
const endpointInput = document.getElementById('endpoint');
const methodSelect = document.getElementById('method');
const bodyTextarea = document.getElementById('body');
const headerContainer = document.getElementById('headerContainer');
const headerError = document.getElementById('headerError');
const bodyError = document.getElementById('bodyError');
const progressDots = document.getElementById('progressDots');

// 숫자 컨트롤 이벤트
document.getElementById('decBtn').onclick = () => {
  let current = parseInt(concurrencyInput.value) || 1;
  if (current > 1) {
    current--;
    concurrencyInput.value = current;
    concurrencyDisplay.textContent = current;
  }
};

document.getElementById('incBtn').onclick = () => {
  let current = parseInt(concurrencyInput.value) || 1;
  if (current < 50) {
    current++;
    concurrencyInput.value = current;
    concurrencyDisplay.textContent = current;
  }
};

// 숫자 입력 동기화
concurrencyInput.addEventListener('input', () => {
  concurrencyDisplay.textContent = concurrencyInput.value;
});

// WebSocket 연결
function connectWebSocket(onReady) {
  ws = new WebSocket(`ws://${window.location.host}/ws`);
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.ws_id) {
      wsId = data.ws_id;
      if (onReady) onReady();
    } else if (data.session && data.response !== undefined) {
      updateSession(data.session, data.response);
    }
  };
  ws.onclose = () => {
    ws = null;
  };
}

// 세션 업데이트
function updateSession(sessionId, response) {
  const sessionIndex = sessions.findIndex(s => s.id === sessionId);
  if (sessionIndex >= 0) {
    const isError = response.startsWith('ERROR:');
    const isComplete = response.startsWith('✅');
    const isProgress = response.startsWith('🔄');
    
    let newStatus;
    if (isError) {
      newStatus = 'error';
    } else if (isComplete) {
      newStatus = 'success';
    } else if (isProgress) {
      newStatus = 'loading';
    } else {
      // 첫 응답이지만 완료/진행 표시가 없으면 진행중으로 처리
      newStatus = 'loading';
    }
    
    // 기존 세션 카드의 스크롤 위치와 높이 저장
    const existingCard = document.querySelector(`[data-session-id="${sessionId}"]`);
    let scrollInfo = null;
    if (existingCard) {
      const responseContent = existingCard.querySelector('.response-content');
      if (responseContent) {
        scrollInfo = {
          scrollTop: responseContent.scrollTop,
          scrollHeight: responseContent.scrollHeight,
          clientHeight: responseContent.clientHeight
        };
      }
    }
    
    // 세션 데이터 업데이트
    sessions[sessionIndex] = {
      ...sessions[sessionIndex],
      status: newStatus,
      response: response
    };
    
    // 특정 세션만 업데이트 (전체 재렌더링 방지)
    updateSingleSession(sessionId, sessions[sessionIndex], scrollInfo);
    
    // 모든 세션이 완료되면 진행 표시 숨김
    const allComplete = sessions.every(s => s.status !== 'loading' && s.status !== 'pending');
    if (allComplete) {
      progressDots.style.display = 'none';
    }
  }
}

// 단일 세션 카드만 업데이트
function updateSingleSession(sessionId, sessionData, scrollInfo) {
  const card = document.querySelector(`[data-session-id="${sessionId}"]`);
  if (!card) return;
  
  // 상태 클래스 업데이트
  card.className = `session-card ${sessionData.status}`;
  
  // 상태 배지 업데이트
  const statusBadge = card.querySelector('.status-badge');
  if (statusBadge) {
    statusBadge.className = `status-badge ${sessionData.status}`;
    statusBadge.textContent = 
      sessionData.status === 'pending' ? '대기중' :
      sessionData.status === 'loading' ? '진행중' : 
      sessionData.status === 'success' ? '완료' : '실패';
  }
  
  // 응답 내용 업데이트
  const responseContent = card.querySelector('.response-content');
  if (responseContent) {
    responseContent.textContent = sessionData.response;
    
    // 스크롤 위치 관리
    if (scrollInfo) {
      if (sessionData.status === 'loading') {
        // 진행중일 때: 이전에 맨 아래였으면 맨 아래 유지, 아니면 현재 위치 유지
        const wasAtBottom = scrollInfo.scrollTop + scrollInfo.clientHeight >= scrollInfo.scrollHeight - 10;
        if (wasAtBottom) {
          setTimeout(() => {
            responseContent.scrollTop = responseContent.scrollHeight;
          }, 10);
        } else {
          responseContent.scrollTop = scrollInfo.scrollTop;
        }
      } else {
        // 완료/에러일 때: 현재 위치 유지
        responseContent.scrollTop = scrollInfo.scrollTop;
      }
    }
  }
}

// 세션 렌더링
function renderSessions() {
  if (sessions.length === 0) {
    sessionsDiv.innerHTML = `
      <div class="empty-state">
        <span class="emoji">🚀</span>
        <p>테스트를 시작하면 결과가 여기에 표시됩니다</p>
      </div>
    `;
    return;
  }

  sessionsDiv.innerHTML = sessions.map(session => `
    <div class="session-card ${session.status}" data-session-id="${session.id}">
      <div class="session-header">
        <div class="session-title">세션 #${session.id}</div>
        <div class="status-badge ${session.status}">
          ${session.status === 'pending' ? '대기중' :
            session.status === 'loading' ? '진행중' : 
            session.status === 'success' ? '완료' : '실패'}
        </div>
      </div>
      <div class="response-content">${session.response}</div>
    </div>
  `).join('');
}

// 헤더 관리
function addHeader() {
  const row = document.createElement('div');
  row.className = 'header-item';
  row.innerHTML = `
    <input type="text" placeholder="헤더 이름" class="header-key" />
    <input type="text" placeholder="값" class="header-value" />
    <button type="button" class="btn-remove remove-header">삭제</button>
  `;
  headerContainer.appendChild(row);
  row.querySelector('.remove-header').onclick = () => row.remove();
}

function getHeadersObject() {
  const headerItems = document.querySelectorAll('.header-item');
  const headers = {};
  headerItems.forEach(item => {
    const key = item.querySelector('.header-key').value.trim();
    const value = item.querySelector('.header-value').value.trim();
    if (key && value) {
      headers[key] = value;
    }
  });
  return headers;
}

// 이벤트 리스너
document.getElementById('addHeader').onclick = addHeader;

// 초기 삭제 버튼 이벤트
document.querySelectorAll('.remove-header').forEach(btn => {
  btn.onclick = function() {
    if (document.querySelectorAll('.header-item').length > 1) {
      this.parentElement.remove();
    } else {
      this.parentElement.querySelector('.header-key').value = '';
      this.parentElement.querySelector('.header-value').value = '';
    }
  };
});

// 폼 제출
form.onsubmit = async (e) => {
  e.preventDefault();
  
  headerError.style.display = 'none';
  bodyError.style.display = 'none';
  
  // 바디 검증
  let bodyObj = bodyTextarea.value;
  if (bodyTextarea.value.trim()) {
    try {
      bodyObj = JSON.parse(bodyTextarea.value);
    } catch (err) {
      bodyError.textContent = 'JSON 형식이 올바르지 않습니다: ' + err.message;
      bodyError.style.display = 'block';
      return;
    }
  }
  
  // 진행 표시 시작
  progressDots.style.display = 'inline-flex';
  
  // 세션 초기화
  const concurrency = parseInt(concurrencyInput.value);
  sessions = Array.from({ length: concurrency }, (_, i) => ({
    id: i + 1,
    status: 'pending',
    response: '요청 준비 중...'
  }));
  renderSessions();
  
  const sendTest = () => {
    fetch('/api/start-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        concurrency: concurrency,
        endpoint: endpointInput.value,
        method: methodSelect.value,
        headers: getHeadersObject(),
        body: bodyObj,
        ws_id: wsId
      })
    }).catch(err => {
      progressDots.style.display = 'none';
      bodyError.textContent = '테스트 요청 중 오류가 발생했습니다: ' + err.message;
      bodyError.style.display = 'block';
    });
  };
  
  if (!ws || ws.readyState !== 1) {
    connectWebSocket(sendTest);
  } else {
    sendTest();
  }
};
