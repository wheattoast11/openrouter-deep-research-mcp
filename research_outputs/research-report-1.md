### **Ensemble Research Synthesis**

**ORIGINAL QUERY:** Optimal local LLM architecture for AMD Ryzen Strix Halo platform with 128GB unified LPDDR5X 8533MHz RAM running BF16 and FP8 inference. Focus on: 1) Latest NVIDIA model releases suitable for orchestration (Nemotron, Llama-based models), 2) Best models for retrieval/online search, 3) Memory bandwidth utilization for 41k+ context windows, 4) Agentic loop architecture patterns combining cheap retrieval with heavy reasoning models, 5) LM Studio/vLLM/llama.cpp configuration for unified memory systems

**SUB-QUERIES STATUS:**
*   **Sub-Query 1: Technical specifications of AMD Ryzen "Strix Halo" platform.** — **SUCCESS**

---
### **Sub-Query 1: Technical Specifications of AMD Ryzen "Strix Halo"**

**Status:** SUCCESS

#### **Ensemble Comparison**
The two research models provided directly contradictory conclusions.
*   **Consensus:** There was no consensus.
*   **Contradictions:**
    *   `openai/gpt-5-chat` correctly identified "Strix Halo" as a real, high-performance APU platform based on mid-2024 information, outlining its key architectural components (Zen 5, RDNA 3.5, XDNA 2).
    *   `qwen/qwen3-vl-8b-thinking` incorrectly concluded that "Strix Halo" was a fabricated name for a non-existent product, basing its analysis on outdated information from 2023 and conflating it with existing, unrelated products.
*   **Resolution:** The provided web search results from mid-to-late 2025 definitively invalidate the conclusion from `qwen/qwen3-vl-8b-thinking`. An official AMD article and multiple hands-on reviews confirm that the platform is real, with its official branding being **AMD Ryzen AI Max+ 395** and "Strix Halo" as its development codename. The synthesis below relies on these recent, high-quality sources to provide an accurate and verified overview.

#### **Synthesized Answer**

**Confidence: High**

The AMD "Strix Halo" platform is a real System-on-a-Chip (SoC) officially marketed as the **AMD Ryzen™ AI Max+ 395**. It is designed for high-performance mobile and small-form-factor systems, with a strong focus on generative AI workloads enabled by its large unified memory pool and powerful integrated GPU. The platform's specifications are well-suited for running local Large Language Models (LLMs).

**Verified Technical Specifications:**

*   **CPU Subsystem:**
    *   **Architecture:** Zen 5
    *   **Core Count:** 16 cores [Source: Strix Halo, Unleashed: Real LLM Workflows on 128GB ... — https://medium.com/@orami98/strix-halo-unleashed-real-llm-workflows-on-128gb-ryzen-ai-max-395-mini-pcs-and-laptops-5dabdd3fcae3]
    *   **Packaging:** The CPU cores are split across two Core Complex Dies (CCDs) connected to the IO die via TSMC's InFO_oS packaging. [Source: Strix Halo’s Memory Subsystem: Tackling iGPU Challenges — https://old.chipsandcheese.com/2025/10/31/37437/]

*   **GPU Subsystem:**
    *   **Official Name:** AMD Radeon™ 8060S
    *   **Architecture:** RDNA™ 3.5
    *   **Compute Units (CUs):** Up to 40 CUs [Source: AMD Ryzen AI Max+395: A Leap Forward in Generative AI Performance with Consumer PC — https://www.amd.com/en/developer/resources/technical-articles/2025/amd-ryzen-ai-max-395--a-leap-forward-in-generative-ai-performanc.html]
    *   **Infinity Cache:** The GPU features a 32 MB memory side cache (also known as Infinity Cache or MALL) to improve memory access performance. [Source: Strix Halo’s Memory Subsystem: Tackling iGPU Challenges — https://old.chipsandcheese.com/2025/10/31/37437/]

*   **NPU (AI Accelerator):**
    *   **Architecture:** XDNA 2
    *   **Performance:** Up to 50 TOPS (Trillion Operations Per Second) [Source: Strix Halo, Unleashed: Real LLM Workflows on 128GB ... — https://medium.com/@orami98/strix-halo-unleashed-real-llm-workflows-on-128gb-ryzen-ai-max-395-mini-pcs-and-laptops-5dabdd3fcae3]

*   **Memory Subsystem:**
    *   **Type:** LPDDR5X-8000 Unified Memory
    *   **Capacity:** Up to 128GB on-board [Source: Strix Halo, Unleashed: Real LLM Workflows on 128GB ... — https://medium.com/@orami98/strix-halo-unleashed-real-llm-workflows-on-128gb-ryzen-ai-max-395-mini-pcs-and-laptops-5dabdd3fcae3]
    *   **GPU VRAM Allocation:** The Unified Memory Architecture (UMA) allows for large portions of system RAM to be reserved for the GPU, with configurations supporting up to 96GB or even 112GB allocated as VRAM. [Source: Strix Halo, Unleashed: Real LLM Workflows on 128GB ... — https://medium.com/@orami98/strix-halo-unleashed-real-llm-workflows-on-128gb-ryzen-ai-max-395-mini-pcs-and-laptops-5dabdd3fcae3, AMD Ryzen AI Max+395: A Leap Forward in Generative AI Performance with Consumer PC — https://www.amd.com/en/developer/resources/technical-articles/2025/amd-ryzen-ai-max-395--a-leap-forward-in-generative-ai-performanc.html]
    *   **Bandwidth:** Measured GPU memory bandwidth is approximately **215 GB/s** on a 256-bit bus, which is a key driver for LLM inference speed (tokens/second). [Source: Strix Halo, Unleashed: Real LLM Workflows on 128GB ... — https://medium.com/@orami98/strix-halo-unleashed-real-llm-workflows-on-128gb-ryzen-ai-max-395-mini-pcs-and-laptops-5dabdd3fcae3]

**LLM and AI Capabilities:**
The platform is explicitly designed and marketed for demanding local AI tasks.
*   **Large Model Support:** The 128GB unified memory architecture enables running 70-billion-parameter class LLMs locally. [Source: AMD Ryzen AI Max+395: A Leap Forward in Generative AI Performance with Consumer PC — https://www.amd.com/en/developer/resources/technical-articles/2025/amd-ryzen-ai-max-395--a-leap-forward-in-generative-ai-performanc.html]
*   **Finetuning:** The large memory capacity and powerful iGPU make the platform suitable for local LLM finetuning techniques, including full-parameter, LoRA, and QLoRA. [Source: Finetuning LLMs on Strix Halo – Full, LoRA, and QLoRA on ... — https://www.youtube.com/watch?v=nxugSRDg_jg]
*   **Performance:** AMD claims significant performance advantages over competing platforms like the Apple M4 Pro in generative AI tasks such as image generation with Stable Diffusion and concurrent LLM inference. [Source: AMD Ryzen AI Max+395: A Leap Forward in Generative AI Performance with Consumer PC — https://www.amd.com/en/developer/resources/technical-articles/2025/amd-ryzen-ai-max-395--a-leap-forward-in-generative-ai-performanc.html]