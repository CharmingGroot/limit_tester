# 부하 테스트 도구

웹 기반 UI를 통해 API 엔드포인트의 동시성 테스트를 수행하는 도구입니다.

## 설치 및 실행

```bash
pip install -r requirements.txt
python tissue_wrapper.py
```

브라우저에서 `http://localhost:8091` 접속.

## 기능

- 동시 사용자 수 설정 (1-50명)
- HTTP 메서드 선택 (GET/POST/PUT/DELETE/PATCH)
- 커스텀 헤더 설정
- JSON 요청 본문 지원
- 실시간 결과 모니터링

## 사용법

1. 테스트 설정 입력
2. "테스트 시작" 클릭
3. 실시간으로 각 세션의 응답 확인
