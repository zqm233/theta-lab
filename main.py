"""CLI entry point for quick agent testing."""

import asyncio

from dotenv import load_dotenv

load_dotenv(override=True)

from backend.agent.agent import ThetaLabAgent
from backend.agent.persistence import create_checkpointer, create_store


async def main():
    store = create_store()
    checkpointer = await create_checkpointer()
    agent = ThetaLabAgent(store=store, checkpointer=checkpointer)
    thread_id = "cli-demo"

    print("ThetaLab - Options Selling Assistant")
    print("Type 'quit' to exit, 'profile' to view your trading profile.\n")

    try:
        while True:
            user_input = input("You: ").strip()
            if not user_input:
                continue
            if user_input.lower() == "quit":
                break
            if user_input.lower() == "profile":
                print(f"\n{agent._profile_store.profile_as_text()}\n")
                continue

            print("AI: ", end="", flush=True)
            async for chunk in agent.astream(user_input, thread_id=thread_id):
                print(chunk, end="", flush=True)
            print("\n")
    finally:
        agent.close()


if __name__ == "__main__":
    asyncio.run(main())
