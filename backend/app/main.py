from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel

from .db import engine
from .config import settings
from .routers.persons import router as persons_router
from .routers.messages import router as messages_router
from .websocket_manager import ConnectionManager
from .deps import get_ws_manager
from .ai.autocomplete import autocomplete_engine
import os


manager = get_ws_manager()

app = FastAPI()

# Make manager available to the app
app.state.ws_manager = manager
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

 

@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(engine)
    # Train autocomplete model once at startup
    base_dir = os.path.dirname(__file__)
    csv_path = os.path.join(base_dir, "ai", "feelings.csv")
    autocomplete_engine.train(csv_path)

app.include_router(persons_router, prefix=settings.api_prefix)
app.include_router(messages_router, prefix=settings.api_prefix)


@app.websocket("/ws/{person_id}")
async def websocket_endpoint(websocket: WebSocket, person_id: str):
    await manager.connect(websocket, person_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, person_id)