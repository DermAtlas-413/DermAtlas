"""Feedback request/response schemas."""

from pydantic import BaseModel


class FeedbackRequest(BaseModel):
    query_id: str
    reference_id: str
    is_helpful: bool


class FeedbackResponse(BaseModel):
    feedback_id: int
    is_helpful: bool
