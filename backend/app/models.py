from typing import List, Optional

from sqlmodel import SQLModel, Field, Relationship


class Person(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    pfp_image: Optional[str] = None

    messages: List["Message"] = Relationship(back_populates="person")


class Message(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    message: str
    message_score: float = Field(ge=0.0, le=1.0)
    person_id: int = Field(foreign_key="person.id")

    person: Optional[Person] = Relationship(back_populates="messages", sa_relationship_kwargs={"cascade": "all, delete"})


class Item(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str


