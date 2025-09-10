from starlette.applications import Starlette
from starlette.responses import FileResponse, JSONResponse
from starlette.routing import Route, WebSocketRoute
from starlette.staticfiles import StaticFiles
from starlette.endpoints import WebSocketEndpoint
import uvicorn
import os
import asyncio
import httpx
import json

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend_build")

# WebSocket 세션 관리
sessions = {}

async def index(request):
    # SPA index.html 반환
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

async def start_test(request):
    data = await request.json()
    concurrency = int(data.get("concurrency", 1))
    endpoint = data.get("endpoint", "/")
    method = data.get("method", "GET").upper()
    headers = data.get("headers", {})
    body = data.get("body", None)
    ws_id = data.get("ws_id")
    end_flags = data.get("end_flags", ['"type": "end"', '"streaming_completed": true', '"type": "complete"'])  # 완료 플래그들

    # 각 세션별로 비동기 요청 실행
    async def run_session(session_id):
        async with httpx.AsyncClient(timeout=600.0) as client:
            try:
                req_args = {"headers": headers}
                if method in ["POST", "PUT", "PATCH"]:
                    if isinstance(body, dict):
                        req_args["json"] = body
                    elif body:
                        req_args["data"] = body
                
                # 스트림 응답 처리
                async with client.stream(method, endpoint, **req_args) as response:
                    content_parts = []
                    chunk_count = 0
                    
                    async for chunk in response.aiter_text():
                        if chunk:  # 빈 청크 무시
                            content_parts.append(chunk)
                            chunk_count += 1
                            
                            # 완료 플래그 체크
                            chunk_complete = False
                            for flag in end_flags:
                                if flag in chunk:
                                    chunk_complete = True
                                    break
                            
                            if chunk_complete:
                                # 완료 플래그 발견 시 즉시 종료
                                final_content = ''.join(content_parts)
                                if ws_id in sessions:
                                    await sessions[ws_id].send_json({
                                        "session": session_id, 
                                        "response": f"✅ [완료] {final_content}"
                                    })
                                return
                            
                            # 실시간으로 청크 전송
                            if ws_id in sessions:
                                partial_content = ''.join(content_parts)
                                await sessions[ws_id].send_json({
                                    "session": session_id, 
                                    "response": f"🔄 [진행중 - {chunk_count}개 청크] {partial_content}"
                                })
                    
                    # 완료 플래그 없이 스트림이 끝난 경우
                    final_content = ''.join(content_parts)
                    if ws_id in sessions:
                        await sessions[ws_id].send_json({
                            "session": session_id, 
                            "response": f"⚠️ [연결 종료] {final_content}"
                        })
                        
            except httpx.TimeoutException:
                error_msg = "ERROR: 요청 시간 초과 (10분)"
                if ws_id in sessions:
                    await sessions[ws_id].send_json({"session": session_id, "response": error_msg})
            except Exception as e:
                error_msg = f"ERROR: {e}"
                if ws_id in sessions:
                    await sessions[ws_id].send_json({"session": session_id, "response": error_msg})

    # 동시성만큼 세션 생성
    tasks = [run_session(i+1) for i in range(concurrency)]
    await asyncio.gather(*tasks)
    return JSONResponse({"status": "started"})

class TestWebSocket(WebSocketEndpoint):
    encoding = "json"
    async def on_connect(self, websocket):
        await websocket.accept()
        ws_id = id(websocket)
        sessions[ws_id] = websocket
        await websocket.send_json({"ws_id": ws_id})
    async def on_disconnect(self, websocket, close_code):
        ws_id = id(websocket)
        sessions.pop(ws_id, None)
    async def on_receive(self, websocket, data):
        pass  # 클라이언트에서 메시지 수신 필요 없음

routes = [
    Route("/", index),
    Route("/api/start-test", start_test, methods=["POST"]),
    WebSocketRoute("/ws", TestWebSocket),
    # 정적 파일 서빙 (SPA 빌드 결과)
]

app = Starlette(debug=True, routes=routes)
app.mount("/static", StaticFiles(directory=os.path.join(FRONTEND_DIR, "static")), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8091)
