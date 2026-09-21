import uuid

from pydantic import BaseModel, Field


class StudentGroupSummary(BaseModel):
    id: uuid.UUID
    name: str


class TeacherStudentListItem(BaseModel):
    id: uuid.UUID
    username: str
    display_name: str
    is_blocked: bool
    groups: list[StudentGroupSummary] = Field(default_factory=list)


class TeacherStudentPage(BaseModel):
    items: list[TeacherStudentListItem]
    total: int
    limit: int
    offset: int
