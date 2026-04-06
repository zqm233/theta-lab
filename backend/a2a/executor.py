"""A2A AgentExecutor bridging to ThetaLabAgent.

Maps A2A JSON-RPC requests to ``ThetaLabAgent.astream()`` and
translates our internal stream events into A2A protocol events.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.types import (
    Artifact,
    Message,
    Role,
    TaskArtifactUpdateEvent,
    TaskState,
    TaskStatus,
    TaskStatusUpdateEvent,
    TextPart,
)

if TYPE_CHECKING:
    from backend.agent.agent import ThetaLabAgent


class ThetaLabA2AExecutor(AgentExecutor):
    """Bridge A2A protocol to the existing ThetaLabAgent.

    Each A2A task is mapped to a LangGraph thread so that multi-turn
    conversations work naturally.
    """

    def __init__(self, agent: ThetaLabAgent) -> None:
        self._agent = agent

    async def execute(
        self, context: RequestContext, event_queue: EventQueue
    ) -> None:
        task_id = context.task_id
        context_id = context.context_id

        user_text = context.get_user_input()
        if not user_text:
            await event_queue.enqueue_event(
                _status_event(task_id, context_id, TaskState.failed)
            )
            return

        await event_queue.enqueue_event(
            _status_event(task_id, context_id, TaskState.working)
        )

        artifact_id = str(uuid.uuid4())
        artifact_created = False

        async for chunk in self._agent.astream(
            message=user_text,
            thread_id=task_id,
        ):
            ctype = chunk.get("type")

            if ctype == "token":
                content = chunk.get("content", "")
                await event_queue.enqueue_event(
                    TaskArtifactUpdateEvent(
                        taskId=task_id,
                        contextId=context_id,
                        artifact=Artifact(
                            artifactId=artifact_id,
                            parts=[TextPart(text=content)],
                        ),
                        append=artifact_created,
                        lastChunk=False,
                    )
                )
                artifact_created = True

            elif ctype in ("tool_start", "tool_end"):
                tool_name = chunk.get("name", "")
                label = (
                    f"Calling {tool_name}..."
                    if ctype == "tool_start"
                    else f"{tool_name} done"
                )
                await event_queue.enqueue_event(
                    _status_event(
                        task_id,
                        context_id,
                        TaskState.working,
                        agent_text=label,
                    )
                )

            elif ctype == "confirm":
                await event_queue.enqueue_event(
                    _status_event(
                        task_id,
                        context_id,
                        TaskState.input_required,
                        agent_text=(
                            "This operation requires confirmation. "
                            "Reply 'approve' or 'cancel'."
                        ),
                    )
                )
                return

        await event_queue.enqueue_event(
            TaskArtifactUpdateEvent(
                taskId=task_id,
                contextId=context_id,
                artifact=Artifact(
                    artifactId=artifact_id,
                    parts=[TextPart(text="")],
                ),
                append=True,
                lastChunk=True,
            )
        )
        await event_queue.enqueue_event(
            _status_event(task_id, context_id, TaskState.completed)
        )

    async def cancel(
        self, context: RequestContext, event_queue: EventQueue
    ) -> None:
        await event_queue.enqueue_event(
            _status_event(
                context.task_id, context.context_id, TaskState.canceled
            )
        )


def _status_event(
    task_id: str,
    context_id: str,
    state: TaskState,
    *,
    agent_text: str | None = None,
) -> TaskStatusUpdateEvent:
    msg = None
    if agent_text:
        msg = Message(
            messageId=str(uuid.uuid4()),
            role=Role.agent,
            parts=[TextPart(text=agent_text)],
        )
    return TaskStatusUpdateEvent(
        taskId=task_id,
        contextId=context_id,
        final=state in (TaskState.completed, TaskState.failed, TaskState.canceled),
        status=TaskStatus(state=state, message=msg),
    )
