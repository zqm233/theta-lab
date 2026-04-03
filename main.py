"""CLI entry point for quick agent testing."""

from dotenv import load_dotenv

load_dotenv()

from backend.agent.agent import ThetaLabAgent


def main():
    agent = ThetaLabAgent()
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
            for chunk in agent.stream(user_input, thread_id=thread_id):
                print(chunk, end="", flush=True)
            print("\n")
    finally:
        agent.close()


if __name__ == "__main__":
    main()
