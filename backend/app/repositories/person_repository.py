from typing import List

from sqlmodel import Session, select

from ..models import Person, Message


class PersonRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list(self) -> List[Person]:
        return self.session.exec(select(Person)).all()

    def create(self, person: Person) -> Person:
        self.session.add(person)
        self.session.commit()
        self.session.refresh(person)
        # Auto-set pfp_image to /pfps/{id}.png if not provided
        if person.pfp_image is None:
            person.pfp_image = f"/pfps/{person.id}.png"
            self.session.add(person)
            self.session.commit()
            self.session.refresh(person)
        return person

    def get_by_id(self, person_id: int) -> Person | None:
        return self.session.get(Person, person_id)

    def update(self, person: Person) -> Person:
        self.session.add(person)
        self.session.commit()
        self.session.refresh(person)
        return person

    def delete(self, person_id: int) -> bool:
        person = self.session.get(Person, person_id)
        if person:
            # Delete all messages associated with this person first
            messages = self.session.exec(select(Message).where(Message.person_id == person_id)).all()
            for message in messages:
                self.session.delete(message)
            # Now delete the person
            self.session.delete(person)
            self.session.commit()
            return True
        return False


