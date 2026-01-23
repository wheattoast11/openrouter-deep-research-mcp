Based on an ensemble analysis of the provided research, here is a synthesis of the findings regarding the user's query on Google Gemini's agentic API capabilities.

### **Executive Summary: Deconstructing the Query**

**HIGH CONFIDENCE:** The initial query for a "Google Gemini Interactions API" with an `/interactions` endpoint and a "December 2025" release date is based on incorrect assumptions. No such API has been officially documented or announced by Google. The query's keywords—`background polling`, `previous_interaction_id`, `agent invocation`, `deep-research`, `code-world`—describe a set of advanced features that are not found in a single API but are implemented across different services within Google's AI ecosystem, primarily the **Gemini API** and the **Vertex AI platform**.

This synthesis clarifies how these concepts are realized in Google's actual, documented services.

---

### **1. Asynchronous Tasks: "Background Polling" & Long-Running Operations**

**HIGH CONFIDENCE:** The concept of "background polling" for long-running tasks is not supported by the standard, synchronous Gemini API (`ai.google.dev`). Instead, it is a core feature of the broader **Vertex AI platform**, which is designed for heavy, asynchronous computation. The term `previous_interaction_id` is not a standard Google parameter for this process.

The correct mechanism is Google Cloud's **Long-Running Operation (LRO)** model, which follows a distinct workflow:

1.  **Initiation:** A client submits a task that is expected to take a long time, such as a batch prediction job on a large dataset (`batchPredict`) or a multi-step workflow using Vertex AI Pipelines.
2.  **Identifier Receipt:** The API immediately responds not with the result, but with an `Operation` object containing a unique identifier, typically in the `name` field (e.g., `operations/some-long-unique-id-12345`). This serves as the `operation_id` or `job_id`.
3.  **Polling:** The client then periodically sends `GET` requests to the `operations` endpoint with this ID to check the task's status. The response indicates if the task is still running (`"done": false`).
4.  **Result Retrieval:** Once the polling request returns `"done": true`, the same `Operation` object will contain the final `response` (or an `error`). For large outputs, the response often contains a path to the results in a Google Cloud Storage bucket.

This LRO pattern is the documented method for handling complex, multi-step agentic tasks that would exceed the short timeouts of synchronous APIs.

*   **Sources:**
    *   [Source: Long-Running Operations — https://cloud.google.com/apis/design/standard_methods#long-running_operations]
    *   [Source: Get batch predictions from a generative model — https://cloud.google.com/vertex-ai/generative-ai/docs/models/get-batch-predictions]
    *   [Source: Introduction to Vertex AI Pipelines — https://cloud.google.com/vertex-ai/docs/pipelines/introduction]

---

### **2. Agent Invocation & State Management: `conversation_id` vs. Stateless Calls**

**HIGH CONFIDENCE:** "Agent invocation" is achieved in two primary ways within the Gemini ecosystem, each with a different approach to state management.

#### **Method 1: Stateless Function Calling (Base Gemini API)**

The base Gemini API supports agent-like behavior through **Function Calling** (also called Tool Use). This model is stateless, meaning the API does not remember past interactions. The developer is responsible for maintaining conversational context.

*   **Workflow:**
    1.  The client sends a prompt to the `generateContent` endpoint, including a list of available tools defined in a JSON schema.
    2.  If the model decides to use a tool, it responds with a `functionCall` object containing the tool's name and arguments, instead of a text answer.
    3.  The client's code executes the specified tool (e.g., calls an external API, runs local code).
    4.  The client sends a *new* request to the model, including the entire conversation history *plus* the tool's output formatted as a `functionResponse`.
    5.  The model uses this new context to generate a final, synthesized answer.

*   **Sources:**
    *   [Source: Gemini API Function Calling Guide — https://ai.google.dev/gemini-api/docs/function-calling]
    *   [Source: Start a multi-turn chat — https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/start-chat]

#### **Method 2: Stateful Agents (Vertex AI Agent Builder)**

For more robust, stateful conversations, Google provides **Vertex AI Agents**. This framework manages the conversational state on the server side, simplifying development.

*   **State Persistence:** State is maintained using a `conversation_id` (or session ID). This ID is passed in each API call, allowing the backend to retrieve the full history of the conversation, including previous user messages, agent responses, and tool outputs.
*   **Multi-Turn Tool Use Workflow:**
    1.  **User Prompt:** The client sends the user's message to the agent, referencing the `conversation_id`.
    2.  **Agent `FunctionCall`:** The agent responds with a `FunctionCall` to invoke a tool (like the Code Interpreter). The state is preserved on the server.
    3.  **Client `FunctionResponse`:** The client executes the tool and sends the result back in a new request, using the same `conversation_id`.
    4.  **Final Answer:** The agent, now aware of the tool's output thanks to the persistent session, generates a final, contextually relevant answer.

*   **Sources:**
    *   [Source: Build generative agents — https://cloud.google.com/vertex-ai/generative-ai/docs/agent-builder/build/generative-agents]
    *   [Source: Vertex AI Conversation Management — https://cloud.google.com/vertex-ai/generative-ai/docs/agent-builder/manage-conversations]
    *   [Source: Vertex AI REST API Reference — https://cloud.google.com/vertex-ai/docs/reference/rest/v1/agents/sessions/messages/send]

---

### **3. "Code-World" & "Deep-Research": The Code Interpreter Tool**

**HIGH CONFIDENCE:** The "code-world" and "deep-research" capabilities are enabled by tools, most notably the **Code Interpreter**. This tool allows the Gemini model to execute Python code to perform tasks like data analysis, calculations, and visualization.

To mitigate security risks, the Code Interpreter runs within a highly restricted environment:

*   **Sandboxing:** Code is executed in an isolated, containerized runtime managed by Google, completely separate from the underlying infrastructure. Technologies like `gVisor` are likely used to provide kernel-level isolation, though this is not explicitly confirmed for Gemini. (**MEDIUM CONFIDENCE** on `gVisor` use).
*   **Ephemeral Nature:** The runtime environment is temporary. No data or state persists between execution requests.
*   **No Network Access:** The sandbox has no egress to the public internet, preventing data exfiltration or interaction with external services.
*   **Resource Limits:** Execution is constrained by strict time, CPU, and memory limits to prevent abuse.

*   **Sources:**
    *   [Source: Vertex AI Code Interpreter — https://cloud.google.com/vertex-ai/generative-ai/docs/code-interpreter]
    *   [Source: Vertex AI Security Overview — https://cloud.google.com/vertex-ai/docs/general/security]
    *   [Source: Google AI Studio “Code Execution” Help Page — https://support.google.com/vertex-ai/answer/13896213]

### **4. Comparison with OpenAI's Assistants API**

**HIGH CONFIDENCE:** Google's approach to agentic workflows is more fragmented than OpenAI's.

*   **OpenAI Assistants API:** Provides a unified, high-level framework for building stateful, asynchronous agents. It uses clear abstractions like **Threads** (for persistent conversation state) and **Runs** (for managing asynchronous task execution and tool calls).
*   **Google's Ecosystem:** Requires developers to choose the right tool for the job. For simple, synchronous interactions, the base **Gemini API** with function calling is sufficient. For stateful conversations, **Vertex AI Agents** are used. For long-running, asynchronous tasks, developers must orchestrate **Vertex AI Pipelines** or **Batch Prediction** jobs.

While Google's ecosystem offers powerful and scalable components, OpenAI's Assistants API currently provides a more integrated and developer-friendly experience for building complex agents out-of-the-box.

*   **Sources:**
    *   [Source: OpenAI Assistants API Overview — https://platform.openai.com/docs/assistants/overview]
    *   [Source: Google AI for Developers — https://ai.google.dev/docs]