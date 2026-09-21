from pydantic import BaseModel

from s112.api.simulation_schemas import StudentTrainingHistoryItem


class StudentTrainingHistoryPage(BaseModel):
    items: list[StudentTrainingHistoryItem]
    total: int
    limit: int
    offset: int
