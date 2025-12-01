from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlmodel import Session
from pydantic import BaseModel

from ..deps import get_session, get_ws_manager
from ..repositories.message_repository import MessageRepository
from ..services.message_service import MessageService
from ..schemas.message import MessageCreate, MessageRead
from ..websocket_manager import ConnectionManager
from ..ai.inferir import get_negativity_gradient
from ..ai.autocomplete import autocomplete_engine

router = APIRouter(prefix="/messages", tags=["messages"])


class ScoreRequest(BaseModel):
    message: str


class AutocompleteRequest(BaseModel):
    text: str
    slider_state: int = 1  # 0 = positive, 1 = neutral, 2 = negative


@router.get("/", response_model=list[MessageRead])
def list_messages(
    person_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
):
    service = MessageService(MessageRepository(session))
    return service.list_messages(person_id=person_id)


@router.post("/", response_model=MessageRead)
async def create_message(
    payload: MessageCreate, 
    session: Session = Depends(get_session),
    ws_manager: ConnectionManager = Depends(get_ws_manager)
):
    service = MessageService(MessageRepository(session))
    created_message = service.create_message(
        message=payload.message,
        person_id=payload.person_id,
    )
    
    # Calculate updated average score
    message_repo = MessageRepository(session)
    all_messages = message_repo.list(person_id=payload.person_id)
    average_score = None
    if all_messages:
        total_score = sum(msg.message_score for msg in all_messages)
        average_score = total_score / len(all_messages)
    
    # Broadcast to all connected clients for this person
    await ws_manager.broadcast_to_person(str(payload.person_id), {
        "type": "new_message",
        "message": {
            "id": created_message.id,
            "message": created_message.message,
            "message_score": created_message.message_score,
            "person_id": created_message.person_id
        },
        "average_score": average_score
    })
    return created_message


@router.post("/preview-score")
def preview_score(payload: ScoreRequest):
    """Calculate sentiment score for a message without saving it."""
    score = get_negativity_gradient(payload.message)
    return {"score": score}


@router.post("/autocomplete")
def autocomplete(payload: AutocompleteRequest):
    """
    Return a single-word suggestion given the current text and slider state.
    """
    suggestion = autocomplete_engine.predict(
        text=payload.text,
        slider_state=payload.slider_state,
    )
    return {"suggestion": suggestion}


@router.delete("/{message_id}", status_code=204)
def delete_message(message_id: int, session: Session = Depends(get_session)):
    service = MessageService(MessageRepository(session))
    if not service.delete_message(message_id):
        raise HTTPException(status_code=404, detail="Message not found")
    return None


